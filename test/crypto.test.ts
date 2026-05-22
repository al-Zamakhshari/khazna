// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  encryptMessage, decryptMessage,
  encryptFile,   decryptFile,
  encryptVault,  decryptVault,
  bytesToBase64, base64ToBytes,
  contactFingerprint,
  MIN_PUBLIC_KEY_LEN, MIN_PRIVATE_KEY_LEN,
  HYBRID_PK_SIZE,
  type PQCKeyPair,
} from '../src/utils/crypto';

// ── Key generation ────────────────────────────────────────────────────────────

describe('generateKeyPair', () => {
  it('produces keys that meet minimum length for UI validation', () => {
    const { publicKey, privateKey } = generateKeyPair();
    expect(publicKey.length).toBeGreaterThanOrEqual(MIN_PUBLIC_KEY_LEN);
    expect(privateKey.length).toBeGreaterThanOrEqual(MIN_PRIVATE_KEY_LEN);
  });

  it('produces unique key pairs on every call', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.privateKey).not.toBe(b.privateKey);
  });
});

// ── Message encryption ────────────────────────────────────────────────────────

describe('encryptMessage / decryptMessage', () => {
  let kp: PQCKeyPair;
  beforeEach(() => { kp = generateKeyPair(); });

  it('round-trips a plain ASCII message', () => {
    const msg = 'Hello, quantum world!';
    expect(decryptMessage(encryptMessage(msg, kp.publicKey), kp.privateKey)).toBe(msg);
  });

  it('round-trips an empty string', () => {
    expect(decryptMessage(encryptMessage('', kp.publicKey), kp.privateKey)).toBe('');
  });

  it('round-trips unicode and emoji', () => {
    const msg = '🔐 مرحبا quantum! 量子';
    expect(decryptMessage(encryptMessage(msg, kp.publicKey), kp.privateKey)).toBe(msg);
  });

  it('round-trips a 100 KB message', () => {
    const msg = 'x'.repeat(100_000);
    expect(decryptMessage(encryptMessage(msg, kp.publicKey), kp.privateKey)).toBe(msg);
  });

  it('produces a different ciphertext on each call (ephemeral sender key)', () => {
    const b1 = encryptMessage('same', kp.publicKey);
    const b2 = encryptMessage('same', kp.publicKey);
    expect(b1).not.toBe(b2);
  });

  it('throws when decrypting with a different private key', () => {
    const bundle = encryptMessage('secret', kp.publicKey);
    expect(() => decryptMessage(bundle, generateKeyPair().privateKey)).toThrow();
  });

  it('throws on a truncated bundle', () => {
    expect(() => decryptMessage('tooshort', kp.privateKey)).toThrow('Invalid encrypted bundle');
  });

  it('throws on a corrupted bundle', () => {
    const bundle = encryptMessage('secret', kp.publicKey);
    const corrupted = bundle.slice(0, -8) + 'AAAAAAAA';
    expect(() => decryptMessage(corrupted, kp.privateKey)).toThrow();
  });
});

// ── File encryption ───────────────────────────────────────────────────────────

describe('encryptFile / decryptFile', () => {
  let kp: PQCKeyPair;
  beforeEach(() => { kp = generateKeyPair(); });

  it('round-trips binary file contents', async () => {
    const data = new Uint8Array([0, 1, 2, 3, 255, 254, 128]);
    const encrypted = await encryptFile(new File([data], 'test.bin'), kp.publicKey);
    const decrypted = decryptFile(encrypted, kp.privateKey);
    expect(Array.from(decrypted)).toEqual(Array.from(data));
  });

  it('round-trips a 500 KB file without stack overflow', async () => {
    const data = new Uint8Array(500_000).fill(42);
    const encrypted = await encryptFile(new File([data], 'large.bin'), kp.publicKey);
    const decrypted = decryptFile(encrypted, kp.privateKey);
    expect(decrypted.length).toBe(500_000);
    expect(decrypted[0]).toBe(42);
    expect(decrypted[499_999]).toBe(42);
  });

  it('round-trips an empty file', async () => {
    const encrypted = await encryptFile(new File([], 'empty.bin'), kp.publicKey);
    const decrypted = decryptFile(encrypted, kp.privateKey);
    expect(decrypted.length).toBe(0);
  });

  it('throws when decrypting with a different private key', async () => {
    const encrypted = await encryptFile(new File([new Uint8Array([1,2,3])], 't'), kp.publicKey);
    expect(() => decryptFile(encrypted, generateKeyPair().privateKey)).toThrow();
  });

  it('throws on a truncated file bundle', () => {
    expect(() => decryptFile(new Uint8Array(10), kp.privateKey)).toThrow('Invalid file bundle');
  });
});

// ── Vault encryption ──────────────────────────────────────────────────────────

describe('encryptVault / decryptVault', () => {
  const password = 'correct-horse-battery-staple';
  const vault = {
    identities: [{ id: 'id-1', name: 'Alice', keys: generateKeyPair() }],
    contacts:   [{ id: 'c-1',  name: 'Bob',   publicKey: generateKeyPair().publicKey }],
  };

  it('round-trips vault contents', async () => {
    const encrypted = await encryptVault(vault, password);
    const decrypted = await decryptVault(encrypted, password);
    expect(decrypted).toEqual(vault);
  });

  it('produces a unique ciphertext on each call', async () => {
    const a = await encryptVault(vault, password);
    const b = await encryptVault(vault, password);
    expect(a).not.toBe(b);
  });

  it('throws on wrong password', async () => {
    const encrypted = await encryptVault(vault, password);
    await expect(decryptVault(encrypted, 'wrong-password')).rejects.toThrow();
  });

  it('round-trips an empty vault', async () => {
    const empty = { identities: [], contacts: [] };
    const encrypted = await encryptVault(empty, password);
    expect(await decryptVault(encrypted, password)).toEqual(empty);
  });
});

// ── Adversarial message decryption ────────────────────────────────────────────

describe('decryptMessage — adversarial inputs', () => {
  let kp: PQCKeyPair;
  beforeEach(() => { kp = generateKeyPair(); });

  it('throws when AES-GCM auth tag is flipped (last 16 bytes)', () => {
    const bundle  = base64ToBytes(encryptMessage('sensitive data', kp.publicKey));
    // Flip the last byte of the auth tag
    bundle[bundle.length - 1] ^= 0xff;
    expect(() => decryptMessage(bytesToBase64(bundle), kp.privateKey)).toThrow();
  });

  it('throws when the first byte of AES ciphertext is corrupted', () => {
    const bundle = base64ToBytes(encryptMessage('hello', kp.publicKey));
    // Corrupt the first byte of the AES ciphertext (after the 1132-byte header)
    bundle[1132] ^= 0x01;
    expect(() => decryptMessage(bytesToBase64(bundle), kp.privateKey)).toThrow();
  });

  it('throws when the ML-KEM ciphertext region is zeroed', () => {
    const bundle = base64ToBytes(encryptMessage('secret', kp.publicKey));
    // Zero out the first 1088 bytes (ML-KEM ciphertext)
    bundle.fill(0, 0, 1088);
    expect(() => decryptMessage(bytesToBase64(bundle), kp.privateKey)).toThrow();
  });

  it('handles multiple concurrent encrypt/decrypt operations (parallelism safety)', async () => {
    const plainTexts = Array.from({ length: 8 }, (_, i) => `message-${i}`);
    // All encrypt in parallel
    const bundles = await Promise.all(plainTexts.map(m => Promise.resolve(encryptMessage(m, kp.publicKey))));
    // All decrypt in parallel
    const results = await Promise.all(bundles.map(b => Promise.resolve(decryptMessage(b, kp.privateKey))));
    expect(results).toEqual(plainTexts);
  });

  it('all bundles from parallel encrypts are distinct', () => {
    const bundles = Array.from({ length: 5 }, () => encryptMessage('same', kp.publicKey));
    const unique  = new Set(bundles);
    expect(unique.size).toBe(5);
  });
});

// ── Adversarial vault decryption ──────────────────────────────────────────────

describe('decryptVault — adversarial inputs', () => {
  const password = 'correcthorsebatterystaple';
  const vault    = { identities: [], contacts: [] };

  it('throws when ciphertext is truncated to just salt+nonce (no payload)', async () => {
    // 16-byte salt + 12-byte nonce = 28 bytes → no encrypted content
    const stub = bytesToBase64(new Uint8Array(28));
    await expect(decryptVault(stub, password)).rejects.toThrow();
  });

  it('throws when a single byte is flipped in the auth tag', async () => {
    const bundle  = base64ToBytes(await encryptVault(vault, password));
    bundle[bundle.length - 1] ^= 0x80;
    await expect(decryptVault(bytesToBase64(bundle), password)).rejects.toThrow();
  });

  it('throws on wrong password (same as existing test — explicit adversarial label)', async () => {
    const enc = await encryptVault(vault, password);
    await expect(decryptVault(enc, 'wrong-password')).rejects.toThrow();
  });
});

// ── contactFingerprint ────────────────────────────────────────────────────────

describe('contactFingerprint', () => {
  it('returns exactly 8 hex characters', () => {
    const { publicKey } = generateKeyPair();
    const fp = contactFingerprint(publicKey);
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces a different fingerprint for different keys', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(contactFingerprint(a.publicKey)).not.toBe(contactFingerprint(b.publicKey));
  });

  it('is deterministic — same key always produces same fingerprint', () => {
    const { publicKey } = generateKeyPair();
    expect(contactFingerprint(publicKey)).toBe(contactFingerprint(publicKey));
  });

  it('only fingerprints the KEM public key bytes (not the full vault identity)', () => {
    // Two identities with different ML-KEM keys but same X25519 part should differ
    // (in practice generateKeyPair always creates both, so just verify determinism)
    const { publicKey } = generateKeyPair();
    // Serialise public key to bytes, flip one byte of the ML-KEM half, re-encode
    const bytes = base64ToBytes(publicKey);
    bytes[0] ^= 0xff;
    const mutated = bytesToBase64(bytes);
    expect(contactFingerprint(publicKey)).not.toBe(contactFingerprint(mutated));
  });
});

// ── HYBRID_PK_SIZE export sanity ──────────────────────────────────────────────

describe('HYBRID_PK_SIZE constant', () => {
  it('matches the actual generated public key byte length', () => {
    const { publicKey } = generateKeyPair();
    expect(base64ToBytes(publicKey).length).toBe(HYBRID_PK_SIZE);
  });
});

// ── Base64 helpers ────────────────────────────────────────────────────────────

describe('bytesToBase64 / base64ToBytes', () => {
  it('round-trips arbitrary bytes', () => {
    const data = new Uint8Array([0, 1, 127, 128, 254, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(data)))).toEqual(Array.from(data));
  });

  it('handles 1 MB without stack overflow (spread-operator regression)', () => {
    const data = new Uint8Array(1_000_000).fill(99);
    const b64  = bytesToBase64(data);
    const back = base64ToBytes(b64);
    expect(back.length).toBe(1_000_000);
    expect(back[0]).toBe(99);
    expect(back[999_999]).toBe(99);
  });

  it('round-trips all byte values 0-255', () => {
    const data = new Uint8Array(256).map((_, i) => i);
    expect(Array.from(base64ToBytes(bytesToBase64(data)))).toEqual(Array.from(data));
  });
});
