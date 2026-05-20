import { finalizeEvent } from 'nostr-tools/pure';
import { hexToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export const DEFAULT_BLOSSOM_SERVERS = [
  'https://blossom.band',
  'https://blossom.oxtr.dev',
  'https://cdn.hzrd149.com',
];

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// BUD-01 requires base64url (RFC 4648 §5) — not regular base64.
// btoa() produces base64 with '+' and '/', which some servers reject.
function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadToBlossom(
  data: Uint8Array,
  nostrPrivKeyHex: string,
  servers: string[] = DEFAULT_BLOSSOM_SERVERS,
): Promise<string> {
  if (data.byteLength > MAX_FILE_SIZE) {
    throw new Error(
      `File too large (${(data.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024} MB.`
    );
  }

  const hash    = bytesToHex(sha256(data));
  const expiry  = Math.floor(Date.now() / 1000) + 60 * 60;
  const authEvent = finalizeEvent(
    {
      kind:       24242,
      content:    'Upload encrypted file',
      tags:       [
        ['t', 'upload'],
        ['x', hash],
        ['expiration', String(expiry)],
        ['size', String(data.byteLength)],
      ],
      created_at: Math.floor(Date.now() / 1000),
    },
    hexToBytes(nostrPrivKeyHex),
  );

  // BUD-01: Authorization: Nostr <base64url(event_json)>
  const authHeader = toBase64Url(JSON.stringify(authEvent));

  // Use a typed Blob — the browser then auto-sets both Content-Type and Content-Length
  // from the Blob's type and size. Do NOT override Content-Type in the headers object;
  // letting the Blob drive it avoids charset suffixes or other browser transformations.
  const slice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const body  = new Blob([slice], { type: 'application/octet-stream' });

  const errors: string[] = [];

  for (const server of servers) {
    try {
      const res = await fetch(`${server}/upload`, {
        method:  'PUT',
        headers: { 'Authorization': `Nostr ${authHeader}` }, // Content-Type/Length come from the Blob
        body,
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        return json.url ?? `${server}/${hash}`;
      }
      const detail = await res.text().catch(() => '');
      errors.push(`${server}: HTTP ${res.status}${detail ? ` — ${detail.slice(0, 120)}` : ''}`);
    } catch (e: unknown) {
      errors.push(`${server}: ${e instanceof Error ? e.message : 'network error'}`);
    }
  }

  throw new Error(`File upload failed:\n${errors.join('\n')}`);
}

// ── Download ──────────────────────────────────────────────────────────────────

export async function downloadFromBlossom(url: string): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e: unknown) {
    throw new Error(`Network error: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
