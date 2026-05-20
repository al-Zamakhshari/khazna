import { useState, useEffect, useRef, useCallback } from 'react';
import { type NostrEvent } from 'nostr-tools/pure';
import { getPublicKey } from 'nostr-tools/pure';
import { hexToBytes } from '@noble/hashes/utils.js';
import {
  wrapKhaznaMessage, unwrapKhaznaMessage, buildTextPayload,
  buildFilePayload, buildProfileEvent, publishEvent, decryptPayload,
  subscribeToGiftWraps, lookupContact, nostrPubToNpub,
  DEFAULT_RELAYS, type KhaznaPayload,
} from '../utils/nostr';
import { uploadToBlossom, DEFAULT_BLOSSOM_SERVERS } from '../utils/blossom';
import { encryptFile, type PQCKeyPair } from '../utils/crypto';

export interface Message {
  id:            string;
  fromNostrPub:  string;
  toNostrPub:    string;
  type:          'text' | 'file';
  text?:         string;
  fileUrl?:      string;
  fileName?:     string;
  timestamp:     number;
  verified:      boolean;
}

export function useNostr(
  nostrPrivKeyHex: string | undefined,
  activeKhaznaKeys: PQCKeyPair | null,
) {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [status,    setStatus]    = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [error]                   = useState<string | null>(null);
  const unsubRef    = useRef<(() => void) | null>(null);

  const myNostrPub = nostrPrivKeyHex
    ? getPublicKey(hexToBytes(nostrPrivKeyHex))
    : null;

  const myNpub = myNostrPub ? nostrPubToNpub(myNostrPub) : null;

  // ── Subscribe to incoming messages ───────────────────────────────────────────

  useEffect(() => {
    if (!nostrPrivKeyHex || !myNostrPub || !activeKhaznaKeys) return;

    setStatus('connecting');

    const unsub = subscribeToGiftWraps(
      myNostrPub,
      DEFAULT_RELAYS,
      (event: NostrEvent) => {
        setStatus('connected');
        const result = unwrapKhaznaMessage(event, nostrPrivKeyHex);
        if (!result) return;

        const { payload, senderNostrPubKey } = result;
        try {
          const decrypted = decryptKhaznaPayload(payload, activeKhaznaKeys.privateKey, senderNostrPubKey);
          const msg: Message = {
            id:           event.id,
            fromNostrPub: senderNostrPubKey,
            toNostrPub:   myNostrPub,
            timestamp:    event.created_at * 1000,
            verified:     true,
            ...decrypted,
          };
          setMessages(prev =>
            prev.some(m => m.id === msg.id) ? prev : [...prev, msg]
          );
        } catch {
          // failed to decrypt — not for us or corrupted
        }
      },
    );

    unsubRef.current = unsub;
    return () => { unsub(); unsubRef.current = null; };
  }, [nostrPrivKeyHex, myNostrPub, activeKhaznaKeys]);

  // ── Send text ────────────────────────────────────────────────────────────────

  const sendText = useCallback(async (
    text: string,
    recipientKhaznaKey: string,
    recipientNostrPub: string,
  ) => {
    if (!nostrPrivKeyHex) throw new Error('Nostr key not set up.');
    const payload   = buildTextPayload(text, recipientKhaznaKey, nostrPrivKeyHex);
    const giftWrap  = wrapKhaznaMessage(payload, nostrPrivKeyHex, recipientNostrPub);
    await publishEvent(giftWrap);

    setMessages(prev => [...prev, {
      id:           giftWrap.id,
      fromNostrPub: myNostrPub!,
      toNostrPub:   recipientNostrPub,
      type:         'text',
      text,
      timestamp:    Date.now(),
      verified:     true,
    }]);
  }, [nostrPrivKeyHex, myNostrPub]);

  // ── Send file ────────────────────────────────────────────────────────────────

  const sendFile = useCallback(async (
    file: File,
    recipientKhaznaKey: string,
    recipientNostrPub: string,
  ) => {
    if (!nostrPrivKeyHex) throw new Error('Nostr key not set up.');

    const encrypted  = await encryptFile(file, recipientKhaznaKey);
    const url        = await uploadToBlossom(encrypted, nostrPrivKeyHex, DEFAULT_BLOSSOM_SERVERS);
    const payload    = buildFilePayload(url, file.name, recipientKhaznaKey, nostrPrivKeyHex);
    const giftWrap   = wrapKhaznaMessage(payload, nostrPrivKeyHex, recipientNostrPub);
    await publishEvent(giftWrap);

    setMessages(prev => [...prev, {
      id:           giftWrap.id,
      fromNostrPub: myNostrPub!,
      toNostrPub:   recipientNostrPub,
      type:         'file',
      fileUrl:      url,
      fileName:     file.name,
      timestamp:    Date.now(),
      verified:     true,
    }]);
  }, [nostrPrivKeyHex, myNostrPub]);

  // ── Publish my profile ───────────────────────────────────────────────────────

  const publishProfile = useCallback(async (displayName: string, khaznaPublicKey: string) => {
    if (!nostrPrivKeyHex) throw new Error('Nostr key not set up.');
    const event = buildProfileEvent(displayName, khaznaPublicKey, nostrPrivKeyHex);
    await publishEvent(event);
  }, [nostrPrivKeyHex]);

  return {
    myNpub,
    myNostrPub,
    messages,
    status,
    error,
    sendText,
    sendFile,
    publishProfile,
    lookupContact,
  };
}

// ── Internal helper ───────────────────────────────────────────────────────────

function decryptKhaznaPayload(
  payload: KhaznaPayload,
  recipientKhaznaPrivKey: string,
  senderNostrPubKey: string,
): Pick<Message, 'type' | 'text' | 'fileUrl' | 'fileName'> {
  const result = decryptPayload(payload, recipientKhaznaPrivKey, senderNostrPubKey);
  if (result.type === 'file') {
    return { type: 'file', fileUrl: result.url, fileName: result.fileName };
  }
  return { type: 'text', text: result.text };
}
