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
}

export function buildTextPayload(
  plaintext: string,
  recipientKhaznaKey: string,
  senderNostrPrivKey: string,
): KhaznaPayload {
  const bundle = encryptMessage(plaintext, recipientKhaznaKey);
  return { v: 1, type: 'text', bundle, sig: signBundle(bundle, senderNostrPrivKey) };
}

export function buildFilePayload(
  blossomUrl: string,
  fileName: string,
  recipientKhaznaKey: string,
  senderNostrPrivKey: string,
): KhaznaPayload {
  const bundle = encryptMessage(JSON.stringify({ url: blossomUrl, fileName }), recipientKhaznaKey);
  return { v: 1, type: 'file', bundle, sig: signBundle(bundle, senderNostrPrivKey), fileName };
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
): NostrEvent {
  const privKey     = hexToBytes(nostrPrivKeyHex);
  const existing    = {}; // could merge with fetched profile in the future
  const content     = JSON.stringify({
    ...existing,
    name:               displayName,
    khazna_pub:         khaznaPublicKey,
    khazna_pub_version: 1,
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
