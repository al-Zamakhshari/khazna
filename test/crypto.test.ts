// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  encryptMessage, decryptMessage,
  encryptFile,   decryptFile,
  encryptVault,  decryptVault,
  bytesToBase64, base64ToBytes,
  MIN_PUBLIC_KEY_LEN, MIN_PRIVATE_KEY_LEN,
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
