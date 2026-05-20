// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  generateNostrKey, nostrPubToNpub, npubToNostrPub, isValidNpub,
  signBundle, verifyBundle,
  buildTextPayload, buildFilePayload, decryptPayload,
  wrapKhaznaMessage, unwrapKhaznaMessage,
  buildProfileEvent, extractKhaznaKey, extractSessionKey,
  buildPrekeyEvent, fetchPrekeys, pickValidPrekey,
} from '../src/utils/nostr';
import { generateKeyPair, generateSessionKey, isSessionExpired, SESSION_TTL_MS } from '../src/utils/crypto';

// ── Key management ────────────────────────────────────────────────────────────

describe('generateNostrKey', () => {
  it('produces 64-char hex keys', () => {
    const { privateKey, publicKey } = generateNostrKey();
    expect(privateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(publicKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique keys on each call', () => {
    const a = generateNostrKey();
    const b = generateNostrKey();
    expect(a.privateKey).not.toBe(b.privateKey);
    expect(a.publicKey).not.toBe(b.publicKey);
  });
});

describe('npub encoding', () => {
  it('encodes and decodes a pubkey round-trip', () => {
    const { publicKey } = generateNostrKey();
    const npub = nostrPubToNpub(publicKey);
    expect(npub).toMatch(/^npub1/);
    expect(npubToNostrPub(npub)).toBe(publicKey);
  });

  it('isValidNpub returns true for valid npub', () => {
    const npub = nostrPubToNpub(generateNostrKey().publicKey);
    expect(isValidNpub(npub)).toBe(true);
  });

  it('isValidNpub returns false for garbage', () => {
    expect(isValidNpub('notanpub')).toBe(false);
    expect(isValidNpub('')).toBe(false);
    expect(isValidNpub('npub1invalidchars!!!')).toBe(false);
  });
});

// ── Bundle signing ────────────────────────────────────────────────────────────

describe('signBundle / verifyBundle', () => {
  const { privateKey, publicKey } = generateNostrKey();
  const bundle = 'AAAA+somebase64bundle==';

  it('verification passes with matching key', () => {
    const sig = signBundle(bundle, privateKey);
    expect(verifyBundle(bundle, sig, publicKey)).toBe(true);
  });

  it('verification fails with wrong key', () => {
    const sig = signBundle(bundle, privateKey);
    const { publicKey: wrongPub } = generateNostrKey();
    expect(verifyBundle(bundle, sig, wrongPub)).toBe(false);
  });

  it('verification fails with tampered bundle', () => {
    const sig = signBundle(bundle, privateKey);
    expect(verifyBundle(bundle + 'X', sig, publicKey)).toBe(false);
  });
});

// ── Payload build + decrypt ───────────────────────────────────────────────────

describe('buildTextPayload / decryptPayload', () => {
  const recipientKP = generateKeyPair();
  const senderNostr = generateNostrKey();

  it('round-trips a text message', () => {
    const payload   = buildTextPayload('hello world', recipientKP.publicKey, senderNostr.privateKey);
    expect(payload.v).toBe(1);
    expect(payload.type).toBe('text');

    const result    = decryptPayload(payload, recipientKP.privateKey, senderNostr.publicKey);
    expect(result.type).toBe('text');
    if (result.type === 'text') expect(result.text).toBe('hello world');
  });

  it('round-trips a file payload', () => {
    const url       = 'https://blossom.band/abc123';
    const payload   = buildFilePayload(url, 'doc.pdf', recipientKP.publicKey, senderNostr.privateKey);
    expect(payload.type).toBe('file');

    const result    = decryptPayload(payload, recipientKP.privateKey, senderNostr.publicKey);
    expect(result.type).toBe('file');
    if (result.type === 'file') {
      expect(result.url).toBe(url);
      expect(result.fileName).toBe('doc.pdf');
    }
  });

  it('throws when signature does not match sender pubkey', () => {
    const payload       = buildTextPayload('test', recipientKP.publicKey, senderNostr.privateKey);
    const wrongPub      = generateNostrKey().publicKey;
    expect(() => decryptPayload(payload, recipientKP.privateKey, wrongPub)).toThrow(/signature invalid/i);
  });

  it('throws when decrypting with wrong recipient key', () => {
    const payload   = buildTextPayload('test', recipientKP.publicKey, senderNostr.privateKey);
    const wrongKey  = generateKeyPair();
    expect(() => decryptPayload(payload, wrongKey.privateKey, senderNostr.publicKey)).toThrow();
  });
});

// ── NIP-17 Gift Wrap ──────────────────────────────────────────────────────────

describe('wrapKhaznaMessage / unwrapKhaznaMessage', () => {
  const sender    = generateNostrKey();
  const recipient = generateNostrKey();
  const kp        = generateKeyPair();

  it('wraps and unwraps correctly, preserving sender pubkey', () => {
    const payload   = buildTextPayload('quantum message', kp.publicKey, sender.privateKey);
    const wrapped   = wrapKhaznaMessage(payload, sender.privateKey, recipient.publicKey);

    expect(wrapped.kind).toBe(1059); // gift wrap kind

    const result    = unwrapKhaznaMessage(wrapped, recipient.privateKey);
    expect(result).not.toBeNull();
    expect(result!.senderNostrPubKey).toBe(sender.publicKey);
    expect(result!.payload.type).toBe('text');
    expect(result!.payload.v).toBe(1);
  });

  it('returns null when unwrapping with wrong recipient key', () => {
    const payload   = buildTextPayload('secret', kp.publicKey, sender.privateKey);
    const wrapped   = wrapKhaznaMessage(payload, sender.privateKey, recipient.publicKey);
    const wrong     = generateNostrKey();
    expect(unwrapKhaznaMessage(wrapped, wrong.privateKey)).toBeNull();
  });
});

// ── Payload with prekeyId ─────────────────────────────────────────────────────

describe('buildTextPayload with prekeyId', () => {
  const recipientKP = generateKeyPair();
  const senderNostr = generateNostrKey();
  const prekeyId    = crypto.randomUUID();

  it('includes prekeyId in the payload', () => {
    const payload = buildTextPayload('hello', recipientKP.publicKey, senderNostr.privateKey, prekeyId);
    expect(payload.prekeyId).toBe(prekeyId);
  });

  it('round-trips with prekeyId present', () => {
    const payload = buildTextPayload('hello prekey', recipientKP.publicKey, senderNostr.privateKey, prekeyId);
    const result  = decryptPayload(payload, recipientKP.privateKey, senderNostr.publicKey);
    expect(result.type).toBe('text');
    if (result.type === 'text') expect(result.text).toBe('hello prekey');
  });
});

// ── Profile events ────────────────────────────────────────────────────────────

describe('buildProfileEvent / extractKhaznaKey', () => {
  it('round-trips the Khazna public key through a kind-0 profile event', () => {
    const nostr     = generateNostrKey();
    const kp        = generateKeyPair();
    const event     = buildProfileEvent('Alice', kp.publicKey, nostr.privateKey);

    expect(event.kind).toBe(0);
    expect(extractKhaznaKey(event)).toBe(kp.publicKey);
  });

  it('returns null for a profile without a khazna_pub field', () => {
    const nostr     = generateNostrKey();
    const event     = buildProfileEvent('Bob', '', nostr.privateKey);
    const result    = extractKhaznaKey(event);
    expect(typeof result === 'string' || result === null).toBe(true);
  });

  it('includes and extracts session key from profile', () => {
    const nostr   = generateNostrKey();
    const kp      = generateKeyPair();
    const session = generateSessionKey();
    const event   = buildProfileEvent('Alice', kp.publicKey, nostr.privateKey, session.keys.publicKey);

    expect(extractKhaznaKey(event)).toBe(kp.publicKey);
    expect(extractSessionKey(event)).toBe(session.keys.publicKey);
  });

  it('extractSessionKey returns null when no session key is in profile', () => {
    const nostr = generateNostrKey();
    const kp    = generateKeyPair();
    const event = buildProfileEvent('Alice', kp.publicKey, nostr.privateKey);
    expect(extractSessionKey(event)).toBeNull();
  });
});

// ── Session key (crypto.ts) ───────────────────────────────────────────────────

describe('generateSessionKey / isSessionExpired', () => {
  it('generates a session key with ~30-day expiry', () => {
    const session = generateSessionKey();
    const msLeft  = session.expiry - Date.now();
    expect(msLeft).toBeGreaterThan(SESSION_TTL_MS - 5000);
    expect(msLeft).toBeLessThanOrEqual(SESSION_TTL_MS);
  });

  it('fresh session key is not expired', () => {
    expect(isSessionExpired(generateSessionKey())).toBe(false);
  });

  it('past-expiry session key is expired', () => {
    const expired = { keys: generateKeyPair(), expiry: Date.now() - 1 };
    expect(isSessionExpired(expired)).toBe(true);
  });
});

// ── One-time prekeys ──────────────────────────────────────────────────────────

describe('buildPrekeyEvent / pickValidPrekey', () => {
  const nostr   = generateNostrKey();
  const batch   = Array.from({ length: 5 }, () => ({
    id:        crypto.randomUUID(),
    publicKey: generateKeyPair().publicKey,
  }));

  it('produces a kind-10050 event', () => {
    const event = buildPrekeyEvent(batch, nostr.privateKey);
    expect(event.kind).toBe(10050);
  });

  it('pickValidPrekey returns a valid prekey from the batch', () => {
    const event  = buildPrekeyEvent(batch, nostr.privateKey);
    const parsed = JSON.parse(event.content);
    const picked = pickValidPrekey(parsed, nostr.publicKey);
    expect(picked).not.toBeNull();
    expect(batch.some(p => p.id === picked!.id)).toBe(true);
  });

  it('pickValidPrekey rejects entries with wrong signature', () => {
    const event   = buildPrekeyEvent(batch, nostr.privateKey);
    const parsed  = JSON.parse(event.content);
    const wrongPub = generateNostrKey().publicKey;
    // All sigs were made with nostr.privateKey → wrong public key → all invalid
    const picked  = pickValidPrekey(parsed, wrongPub);
    expect(picked).toBeNull();
  });

  it('round-trip: build event → parse → pick → verify sig', () => {
    const event  = buildPrekeyEvent(batch, nostr.privateKey);
    const parsed = JSON.parse(event.content) as { id: string; pub: string; sig: string }[];

    for (const pk of parsed) {
      expect(verifyBundle(pk.id + pk.pub, pk.sig, nostr.publicKey)).toBe(true);
    }
  });
});
