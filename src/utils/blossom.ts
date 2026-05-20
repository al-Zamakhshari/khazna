import { finalizeEvent } from 'nostr-tools/pure';
import { hexToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export const DEFAULT_BLOSSOM_SERVERS = [
  'https://blossom.band',
  'https://cdn.satellite.earth',
];

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadToBlossom(
  data: Uint8Array,
  nostrPrivKeyHex: string,
  servers: string[] = DEFAULT_BLOSSOM_SERVERS,
): Promise<string> {
  const hash      = bytesToHex(sha256(data));
  const expiry    = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
  const authEvent = finalizeEvent(
    {
      kind:       24242,
      content:    'Upload encrypted file',
      tags:       [['t', 'upload'], ['x', hash], ['expiration', String(expiry)]],
      created_at: Math.floor(Date.now() / 1000),
    },
    hexToBytes(nostrPrivKeyHex),
  );
  const authHeader = btoa(JSON.stringify(authEvent));

  for (const server of servers) {
    try {
      const res = await fetch(`${server}/upload`, {
        method:  'PUT',
        headers: { 'Authorization': `Nostr ${authHeader}`, 'Content-Type': 'application/octet-stream' },
        body:    data.buffer as ArrayBuffer,
      });
      if (res.ok) {
        const json = await res.json();
        return json.url ?? `${server}/${hash}`;
      }
    } catch {
      // try next server
    }
  }
  throw new Error('All Blossom servers failed. Try again or check your connection.');
}

// ── Download ──────────────────────────────────────────────────────────────────

export async function downloadFromBlossom(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}
