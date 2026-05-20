import { useState, useEffect, useRef, useCallback } from 'react';
import { type NostrEvent } from 'nostr-tools/pure';
import { getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from '@noble/hashes/utils.js';
import {
  wrapKhaznaMessage, unwrapKhaznaMessage,
  buildTextPayload, buildFilePayload, buildProfileEvent,
  buildPrekeyEvent, fetchPrekeys, pickValidPrekey,
  publishEvent, subscribeToGiftWraps, lookupContact, nostrPubToNpub,
  fetchProfile, extractSessionKey,
  decryptPayload, DEFAULT_RELAYS, SESSION_CACHE_MS,
  type KhaznaPayload,
} from '../utils/nostr';
import { uploadToBlossom, DEFAULT_BLOSSOM_SERVERS } from '../utils/blossom';
import { encryptFile, type PQCKeyPair, type VaultContact } from '../utils/crypto';

export interface Message {
  id:           string;
  fromNostrPub: string;
  toNostrPub:   string;
  type:         'text' | 'file';
  text?:        string;
  fileUrl?:     string;
  fileName?:    string;
  timestamp:    number;
  verified:     boolean;
  keyType:      'prekey' | 'session' | 'longterm' | 'unknown';
}

export interface NostrKeyOps {
  longTermKeys:         PQCKeyPair | null;
  sessionKeys:          PQCKeyPair | null;
  getPrekeyPrivKey:     (id: string) => string | null;
  consumePrekey:        (id: string) => Promise<void>;
  updateContactSession: (contactId: string, sessionPub: string) => Promise<void>;
  getContactById:       (id: string) => VaultContact | undefined;
}

export function useNostr(
  nostrPrivKeyHex: string | undefined,
  keyOps: NostrKeyOps,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status,   setStatus]   = useState<'idle' | 'connecting' | 'connected'>('idle');
  const unsubRef   = useRef<(() => void) | null>(null);

  const myNostrPub = nostrPrivKeyHex
    ? getPublicKey(hexToBytes(nostrPrivKeyHex))
    : null;
  const myNpub = myNostrPub ? nostrPubToNpub(myNostrPub) : null;

  // ── Incoming message subscription ─────────────────────────────────────────────

  useEffect(() => {
    if (!nostrPrivKeyHex || !myNostrPub) return;
    if (!keyOps.longTermKeys && !keyOps.sessionKeys) return;

    setStatus('connecting');

    const unsub = subscribeToGiftWraps(myNostrPub, DEFAULT_RELAYS, (event: NostrEvent) => {
      setStatus('connected');
      const result = unwrapKhaznaMessage(event, nostrPrivKeyHex);
      if (!result) return;

      const { payload, senderNostrPubKey } = result;
      const decrypted = tryDecrypt(payload, keyOps, senderNostrPubKey);
      if (!decrypted) return;

      // Consume one-time prekey after successful decryption
      if (payload.prekeyId) {
        keyOps.consumePrekey(payload.prekeyId);
      }

      const msg: Message = {
        id:           event.id,
        fromNostrPub: senderNostrPubKey,
        toNostrPub:   myNostrPub,
        timestamp:    event.created_at * 1000,
        verified:     true,
        keyType:      payload.prekeyId ? 'prekey' : (payload.sessionKey ? 'session' : 'longterm'),
        ...decrypted,
      };

      setMessages(prev =>
        prev.some(m => m.id === msg.id) ? prev : [...prev, msg]
      );
    });

    unsubRef.current = unsub;
    return () => { unsub(); unsubRef.current = null; };
  }, [nostrPrivKeyHex, myNostrPub, keyOps.longTermKeys, keyOps.sessionKeys]);

  // ── Key resolution for sending ────────────────────────────────────────────────

  const resolveRecipientKey = useCallback(async (
    contact: VaultContact,
  ): Promise<{ key: string; type: 'prekey' | 'session' | 'longterm'; prekeyId?: string }> => {
    if (!contact.nostrPubkey) {
      return { key: contact.publicKey, type: 'longterm' };
    }

    // 1. Try one-time prekeys first (best forward secrecy)
    const prekeys = await fetchPrekeys(contact.nostrPubkey, DEFAULT_RELAYS);
    const prekey  = pickValidPrekey(prekeys, contact.nostrPubkey);
    if (prekey) {
      return { key: prekey.pub, type: 'prekey', prekeyId: prekey.id };
    }

    // 2. Try session key (time-window forward secrecy)
    const cacheValid = contact.sessionFetchedAt &&
                       Date.now() - contact.sessionFetchedAt < SESSION_CACHE_MS;
    let sessionPub   = cacheValid ? contact.sessionPublicKey : null;

    if (!sessionPub) {
      const profile = await fetchProfile(contact.nostrPubkey, DEFAULT_RELAYS);
      sessionPub    = profile ? extractSessionKey(profile) : null;
      if (sessionPub) {
        await keyOps.updateContactSession(contact.id, sessionPub);
      }
    }

    if (sessionPub) return { key: sessionPub, type: 'session' };

    // 3. Long-term key fallback
    return { key: contact.publicKey, type: 'longterm' };
  }, [keyOps]);

  // ── Send text ──────────────────────────────────────────────────────────────────

  const sendText = useCallback(async (
    text: string,
    contact: VaultContact,
  ) => {
    if (!nostrPrivKeyHex || !contact.nostrPubkey) throw new Error('Nostr not configured or contact has no npub.');

    const { key, type, prekeyId } = await resolveRecipientKey(contact);
    const payload   = buildTextPayload(text, key, nostrPrivKeyHex, prekeyId);
    const giftWrap  = wrapKhaznaMessage(payload, nostrPrivKeyHex, contact.nostrPubkey);
    await publishEvent(giftWrap);

    setMessages(prev => [...prev, {
      id:           giftWrap.id,
      fromNostrPub: myNostrPub!,
      toNostrPub:   contact.nostrPubkey!,
      type:         'text',
      text,
      timestamp:    Date.now(),
      verified:     true,
      keyType:      type,
    }]);
  }, [nostrPrivKeyHex, myNostrPub, resolveRecipientKey]);

  // ── Send file ──────────────────────────────────────────────────────────────────

  const sendFile = useCallback(async (
    file: File,
    contact: VaultContact,
  ) => {
    if (!nostrPrivKeyHex || !contact.nostrPubkey) throw new Error('Nostr not configured or contact has no npub.');

    const { key, type, prekeyId } = await resolveRecipientKey(contact);
    const encrypted = await encryptFile(file, key);
    const url       = await uploadToBlossom(encrypted, nostrPrivKeyHex, DEFAULT_BLOSSOM_SERVERS);
    const payload   = buildFilePayload(url, file.name, key, nostrPrivKeyHex, prekeyId);
    const giftWrap  = wrapKhaznaMessage(payload, nostrPrivKeyHex, contact.nostrPubkey);
    await publishEvent(giftWrap);

    setMessages(prev => [...prev, {
      id:           giftWrap.id,
      fromNostrPub: myNostrPub!,
      toNostrPub:   contact.nostrPubkey!,
      type:         'file',
      fileUrl:      url,
      fileName:     file.name,
      timestamp:    Date.now(),
      verified:     true,
      keyType:      type,
    }]);
  }, [nostrPrivKeyHex, myNostrPub, resolveRecipientKey]);

  // ── Publish profile with session key ──────────────────────────────────────────

  const publishProfile = useCallback(async (
    displayName: string,
    khaznaPublicKey: string,
    sessionPublicKey?: string,
  ) => {
    if (!nostrPrivKeyHex) throw new Error('Nostr key not set up.');
    const event = buildProfileEvent(displayName, khaznaPublicKey, nostrPrivKeyHex, sessionPublicKey);
    await publishEvent(event);
  }, [nostrPrivKeyHex]);

  // ── Publish prekey batch ───────────────────────────────────────────────────────

  const publishPrekeys = useCallback(async (
    prekeys: { id: string; publicKey: string }[],
  ) => {
    if (!nostrPrivKeyHex) throw new Error('Nostr key not set up.');
    const event = buildPrekeyEvent(prekeys, nostrPrivKeyHex);
    await publishEvent(event);
  }, [nostrPrivKeyHex]);

  return {
    myNpub,
    myNostrPub,
    messages,
    status,
    sendText,
    sendFile,
    publishProfile,
    publishPrekeys,
    lookupContact,
  };
}

// ── Decryption helper (tries all available keys in priority order) ─────────────

function tryDecrypt(
  payload: KhaznaPayload,
  keyOps: NostrKeyOps,
  senderNostrPub: string,
): Pick<Message, 'type' | 'text' | 'fileUrl' | 'fileName'> | null {
  const candidates: string[] = [];

  // 1. One-time prekey (highest priority — consume after use)
  if (payload.prekeyId) {
    const pk = keyOps.getPrekeyPrivKey(payload.prekeyId);
    if (pk) candidates.push(pk);
  }

  // 2. Session key
  if (keyOps.sessionKeys?.privateKey) candidates.push(keyOps.sessionKeys.privateKey);

  // 3. Long-term identity key
  if (keyOps.longTermKeys?.privateKey) candidates.push(keyOps.longTermKeys.privateKey);

  for (const privKey of candidates) {
    try {
      const result = decryptPayload(payload, privKey, senderNostrPub);
      if (result.type === 'file') return { type: 'file', fileUrl: result.url, fileName: result.fileName };
      return { type: 'text', text: result.text };
    } catch {
      // wrong key — try next
    }
  }

  return null;
}
