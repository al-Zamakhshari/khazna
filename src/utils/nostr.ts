import {
  generateSecretKey, getPublicKey, finalizeEvent,
  type NostrEvent,
} from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import * as nip17 from 'nostr-tools/nip17';
import * as nip19 from 'nostr-tools/nip19';
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { encryptMessage, decryptMessage } from './crypto';

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

const PROFILE_FETCH_TIMEOUT = 8_000;

// ── Key management ────────────────────────────────────────────────────────────

export function generateNostrKey(): { privateKey: string; publicKey: string } {
  const privBytes = generateSecretKey();
  return {
    privateKey: bytesToHex(privBytes),
    publicKey:  getPublicKey(privBytes),
  };
}

export function nostrPubToNpub(hexPub: string): string {
  return nip19.npubEncode(hexPub);
}

export function npubToNostrPub(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') throw new Error('Not a valid npub');
  return decoded.data as string;
}

export function isValidNpub(s: string): boolean {
  try { npubToNostrPub(s); return true; } catch { return false; }
}

// ── Payload signing ───────────────────────────────────────────────────────────

// Signs the Khazna ciphertext bundle so recipients can detect tampering.
export function signBundle(bundleB64: string, nostrPrivKeyHex: string): string {
  const hash = sha256(new TextEncoder().encode(bundleB64));
  return bytesToHex(schnorr.sign(hash, hexToBytes(nostrPrivKeyHex)));
}

export function verifyBundle(
  bundleB64: string,
  sigHex: string,
  nostrPubKeyHex: string,
): boolean {
  try {
    const hash = sha256(new TextEncoder().encode(bundleB64));
    return schnorr.verify(hexToBytes(sigHex), hash, hexToBytes(nostrPubKeyHex));
  } catch {
    return false;
  }
}

// ── Message payload ───────────────────────────────────────────────────────────

export interface KhaznaPayload {
  v: 1;
  type: 'text' | 'file';
  bundle: string;        // Khazna-PQC-encrypted content (base64)
  sig: string;           // schnorr(sha256(bundle), sender_nostr_key)
  fileName?: string;     // only for type === 'file'
  prekeyId?: string;     // if set: encrypted to recipient's one-time prekey
  sessionKey?: true;     // marker: encrypted to recipient's session key (not long-term)
}

export function buildTextPayload(
  plaintext: string,
  recipientKey: string,
  senderNostrPrivKey: string,
  prekeyId?: string,
): KhaznaPayload {
  const bundle = encryptMessage(plaintext, recipientKey);
  return { v: 1, type: 'text', bundle, sig: signBundle(bundle, senderNostrPrivKey), prekeyId };
}

export function buildFilePayload(
  blossomUrl: string,
  fileName: string,
  recipientKey: string,
  senderNostrPrivKey: string,
  prekeyId?: string,
): KhaznaPayload {
  const bundle = encryptMessage(JSON.stringify({ url: blossomUrl, fileName }), recipientKey);
  return { v: 1, type: 'file', bundle, sig: signBundle(bundle, senderNostrPrivKey), fileName, prekeyId };
}

export function decryptPayload(
  payload: KhaznaPayload,
  recipientKhaznaKey: string,
  senderNostrPubKey: string,
): { type: 'text'; text: string } | { type: 'file'; url: string; fileName: string } {
  if (!verifyBundle(payload.bundle, payload.sig, senderNostrPubKey)) {
    throw new Error('Payload signature invalid — message may have been tampered with.');
  }
  const plaintext = decryptMessage(payload.bundle, recipientKhaznaKey);
  if (payload.type === 'file') {
    const { url, fileName } = JSON.parse(plaintext);
    return { type: 'file', url, fileName };
  }
  return { type: 'text', text: plaintext };
}

// ── NIP-17 Gift Wrap ──────────────────────────────────────────────────────────

export function wrapKhaznaMessage(
  payload: KhaznaPayload,
  senderNostrPrivKeyHex: string,
  recipientNostrPubHex: string,
): NostrEvent {
  return nip17.wrapEvent(
    hexToBytes(senderNostrPrivKeyHex),
    { publicKey: recipientNostrPubHex },
    JSON.stringify(payload),
  );
}

export function unwrapKhaznaMessage(
  giftWrap: NostrEvent,
  recipientNostrPrivKeyHex: string,
): { payload: KhaznaPayload; senderNostrPubKey: string } | null {
  try {
    const privKey = hexToBytes(recipientNostrPrivKeyHex);
    const rumor   = nip17.unwrapEvent(giftWrap, privKey);
    const payload = JSON.parse(rumor.content) as KhaznaPayload;
    if (payload.v !== 1) return null;
    // The seal's pubkey is the true sender's Nostr pubkey (proven by NIP-59)
    return { payload, senderNostrPubKey: rumor.pubkey ?? '' };
  } catch {
    return null;
  }
}

// ── Nostr profile (kind-0) ────────────────────────────────────────────────────

export function buildProfileEvent(
  displayName: string,
  khaznaPublicKey: string,
  nostrPrivKeyHex: string,
  sessionPublicKey?: string,
): NostrEvent {
  const privKey = hexToBytes(nostrPrivKeyHex);
  const content = JSON.stringify({
    name:                   displayName,
    khazna_pub:             khaznaPublicKey,
    khazna_pub_version:     1,
    ...(sessionPublicKey && {
      khazna_session_pub:    sessionPublicKey,
      khazna_session_expiry: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
    }),
  });
  return finalizeEvent({ kind: 0, content, tags: [], created_at: Math.floor(Date.now() / 1000) }, privKey);
}

export function extractKhaznaKey(profileEvent: NostrEvent): string | null {
  try {
    const meta = JSON.parse(profileEvent.content);
    return typeof meta.khazna_pub === 'string' ? meta.khazna_pub : null;
  } catch {
    return null;
  }
}

export function extractSessionKey(profileEvent: NostrEvent): string | null {
  try {
    const meta    = JSON.parse(profileEvent.content);
    const key     = meta.khazna_session_pub;
    const expiry  = meta.khazna_session_expiry;
    if (typeof key !== 'string') return null;
    // Reject expired session keys
    if (expiry && expiry * 1000 < Date.now()) return null;
    return key;
  } catch {
    return null;
  }
}

// ── One-time prekeys (kind 10050, replaceable) ────────────────────────────────

export const PREKEY_KIND        = 10050;
export const KEY_ROTATION_KIND  = 10051; // custom: signed identity-key rotation announcement
export const PREKEY_BATCH       = 50;
export const SESSION_CACHE_MS   = 6 * 60 * 60 * 1000;   // 6 hours
export const MAX_PREKEY_AGE_MS  = 90 * 24 * 60 * 60 * 1000; // 90 days

export interface SignedPrekey {
  id:  string;   // UUID
  pub: string;   // base64 ML-KEM+X25519 public key
  sig: string;   // schnorr(sha256(id+pub), nostr_priv_key) — proves ownership
}

export function buildPrekeyEvent(
  prekeys: { id: string; publicKey: string }[],
  nostrPrivKeyHex: string,
): NostrEvent {
  const signed: SignedPrekey[] = prekeys.map(pk => ({
    id:  pk.id,
    pub: pk.publicKey,
    sig: signBundle(pk.id + pk.publicKey, nostrPrivKeyHex),
  }));
  return finalizeEvent(
    {
      kind:       PREKEY_KIND,
      content:    JSON.stringify(signed),
      tags:       [],
      created_at: Math.floor(Date.now() / 1000),
    },
    hexToBytes(nostrPrivKeyHex),
  );
}

export async function fetchPrekeys(
  nostrPubHex: string,
  relays: string[] = DEFAULT_RELAYS,
): Promise<SignedPrekey[]> {
  const pool   = new SimplePool();
  const events = await pool.querySync(relays, { kinds: [PREKEY_KIND], authors: [nostrPubHex] });
  pool.close(relays);
  if (!events.length) return [];
  try {
    return JSON.parse(events.sort((a, b) => b.created_at - a.created_at)[0].content);
  } catch {
    return [];
  }
}

/**
 * Fetch prekeys and validate freshness.
 * Returns null if the latest prekey event is older than MAX_PREKEY_AGE_MS,
 * indicating the contact may have stale or tampered prekeys on the relay.
 */
export async function fetchPrekeysFresh(
  nostrPubHex: string,
  relays: string[] = DEFAULT_RELAYS,
): Promise<{ prekeys: SignedPrekey[]; eventAge: number } | null> {
  const pool   = new SimplePool();
  const events = await pool.querySync(relays, { kinds: [PREKEY_KIND], authors: [nostrPubHex] });
  pool.close(relays);
  if (!events.length) return null;

  const latest  = events.sort((a, b) => b.created_at - a.created_at)[0];
  const eventAge = Date.now() - latest.created_at * 1000;

  if (eventAge > MAX_PREKEY_AGE_MS) {
    // Prekey event is too old — contact should have published fresh prekeys by now
    return null;
  }

  try {
    const prekeys = JSON.parse(latest.content) as SignedPrekey[];
    return { prekeys, eventAge };
  } catch {
    return null;
  }
}

// Picks a random prekey whose sig verifies against the owner's Nostr pubkey.
export function pickValidPrekey(
  prekeys: SignedPrekey[],
  ownerNostrPubHex: string,
): SignedPrekey | null {
  const valid = prekeys.filter(pk =>
    verifyBundle(pk.id + pk.pub, pk.sig, ownerNostrPubHex)
  );
  if (!valid.length) return null;
  return valid[Math.floor(Math.random() * valid.length)];
}

export function extractDisplayName(profileEvent: NostrEvent): string {
  try {
    const meta = JSON.parse(profileEvent.content);
    return meta.name ?? meta.display_name ?? '';
  } catch {
    return '';
  }
}

// ── Relay queries ─────────────────────────────────────────────────────────────

export async function fetchProfile(
  nostrPubHex: string,
  relays: string[] = DEFAULT_RELAYS,
): Promise<NostrEvent | null> {
  const pool   = new SimplePool();
  const events = await pool.querySync(relays, { kinds: [0], authors: [nostrPubHex] });
  pool.close(relays);
  if (!events.length) return null;
  // Return the most recent kind-0 event
  return events.sort((a, b) => b.created_at - a.created_at)[0];
}

export async function lookupContact(
  npub: string,
  relays: string[] = DEFAULT_RELAYS,
): Promise<{ name: string; nostrPubKey: string; khaznaPublicKey: string } | null> {
  const nostrPub   = npubToNostrPub(npub);
  const profile    = await Promise.race([
    fetchProfile(nostrPub, relays),
    new Promise<null>(resolve => setTimeout(() => resolve(null), PROFILE_FETCH_TIMEOUT)),
  ]);
  if (!profile) return null;
  const khaznaPublicKey = extractKhaznaKey(profile);
  if (!khaznaPublicKey) return null;
  return { name: extractDisplayName(profile) || npub.slice(0, 16), nostrPubKey: nostrPub, khaznaPublicKey };
}

export async function publishEvent(
  event: NostrEvent,
  relays: string[] = DEFAULT_RELAYS,
): Promise<void> {
  const pool = new SimplePool();
  await Promise.allSettled(pool.publish(relays, event));
  pool.close(relays);
}

// ── Identity key rotation (kind 10051) ────────────────────────────────────────

/**
 * Build a key-rotation announcement.  The old Nostr key signs the event,
 * proving the rotation was authorised by the legitimate identity holder.
 *
 * Content: { newKhaznaPublicKey, keyVersion, rotatedAt }
 * Verifiers can confirm: event.pubkey === sha256(oldNostrPrivKey) and
 * the new key is the one to use going forward.
 */
export function buildKeyRotationEvent(
  newKhaznaPublicKey: string,
  keyVersion: number,
  nostrPrivKeyHex: string,
): NostrEvent {
  return finalizeEvent(
    {
      kind:       KEY_ROTATION_KIND,
      content:    JSON.stringify({ newKhaznaPublicKey, keyVersion, rotatedAt: Math.floor(Date.now() / 1000) }),
      tags:       [],
      created_at: Math.floor(Date.now() / 1000),
    },
    hexToBytes(nostrPrivKeyHex),
  );
}

// ── NIP-09 deletion request ───────────────────────────────────────────────────

/**
 * Build a NIP-09 deletion event for a gift-wrap message event.
 * Relays are NOT required to honour deletion — callers must inform users.
 */
export function buildDeleteEvent(eventId: string, nostrPrivKeyHex: string): NostrEvent {
  return finalizeEvent(
    {
      kind:       5, // NIP-09 deletion
      content:    'Deleted by sender',
      tags:       [['e', eventId]],
      created_at: Math.floor(Date.now() / 1000),
    },
    hexToBytes(nostrPrivKeyHex),
  );
}

export function subscribeToGiftWraps(
  recipientNostrPubHex: string,
  relays: string[],
  onEvent: (event: NostrEvent) => void,
): () => void {
  const pool = new SimplePool();
  const sub  = pool.subscribe(relays, {
    kinds: [1059],
    '#p': [recipientNostrPubHex],
    since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 7, // last 7 days
  }, { onevent: onEvent });
  return () => { sub.close(); pool.close(relays); };
}
