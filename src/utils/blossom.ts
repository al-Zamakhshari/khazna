import { finalizeEvent } from 'nostr-tools/pure';
import { hexToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export const DEFAULT_BLOSSOM_SERVERS = [
  'https://blossom.band',
  'https://cdn.satellite.earth',
];

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadToBlossom(
  data: Uint8Array,
  nostrPrivKeyHex: string,
  servers: string[] = DEFAULT_BLOSSOM_SERVERS,
): Promise<string> {
  if (data.byteLength > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(data.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024} MB.`);
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
  const authHeader = btoa(JSON.stringify(authEvent));
  // Use a Blob so the body is the exact bytes — avoids ArrayBuffer view-offset issues
  const slice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const body = new Blob([slice], { type: 'application/octet-stream' });

  const errors: string[] = [];

  for (const server of servers) {
    try {
      const res = await fetch(`${server}/upload`, {
        method:  'PUT',
        headers: {
          'Authorization': `Nostr ${authHeader}`,
          'Content-Type':  'application/octet-stream',
        },
        body,
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        return json.url ?? `${server}/${hash}`;
      }
      errors.push(`${server}: HTTP ${res.status}`);
    } catch (e: unknown) {
      errors.push(`${server}: ${e instanceof Error ? e.message : 'network error'}`);
    }
  }

  throw new Error(
    `File upload failed on all servers.\n${errors.join('\n')}\n\nTip: large files or restricted networks can cause this.`
  );
}

// ── Download ──────────────────────────────────────────────────────────────────

export async function downloadFromBlossom(url: string): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e: unknown) {
    throw new Error(`Network error downloading file: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} from ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}
