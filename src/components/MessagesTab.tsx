import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Paperclip, Wifi, WifiOff, User, Copy, Check,
  RefreshCw, Shield, FileIcon, Download, Loader, Key, RotateCcw,
} from 'lucide-react';
import { useNostr, type NostrKeyOps, type Message } from '../hooks/useNostr';
import { downloadFromBlossom, MAX_FILE_SIZE } from '../utils/blossom';
import { isValidNpub, nostrPubToNpub } from '../utils/nostr';
import { decryptFile, type VaultContact, type SessionKey } from '../utils/crypto';

interface MessagesTabProps {
  nostrPrivKeyHex:    string | undefined;
  keyOps:             NostrKeyOps;
  contacts:           VaultContact[];
  sessionKey:         SessionKey | undefined;
  prekeyCount:        number;
  onAddContact:       (name: string, khaznaKey: string, nostrPub: string) => void;
  onSetupNostr:       () => void;
  onPublishProfile:   (displayName: string, sessionPub?: string) => void;
  onRotateSession:    () => Promise<void>;
  onGeneratePrekeys:  () => Promise<{ id: string; keys: { publicKey: string } }[]>;
  activeIdentityName: string | null;
}

export const MessagesTab: React.FC<MessagesTabProps> = ({
  nostrPrivKeyHex,
  keyOps,
  contacts,
  sessionKey,
  prekeyCount,
  onAddContact,
  onSetupNostr,
  onPublishProfile,
  onRotateSession,
  onGeneratePrekeys,
  activeIdentityName,
}) => {
  const [selectedContact, setSelectedContact]  = useState<VaultContact | null>(null);
  const [draft,           setDraft]            = useState('');
  const [lookupNpub,      setLookupNpub]       = useState('');
  const [lookupStatus,    setLookupStatus]     = useState<'idle' | 'loading' | 'error'>('idle');
  const [lookupError,     setLookupError]      = useState('');
  const [copied,          setCopied]           = useState(false);
  const [sending,         setSending]          = useState(false);
  const [publishStatus,   setPublishStatus]    = useState<'idle' | 'loading' | 'done'>('idle');
  const [rotatingSession, setRotatingSession]  = useState(false);
  const [generatingKeys,  setGeneratingKeys]   = useState(false);
  const [fileError,       setFileError]        = useState<string | null>(null);
  const [downloadingId,   setDownloadingId]    = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);

  const { myNpub, messages, status, sendText, sendFile, lookupContact, publishPrekeys } = useNostr(
    nostrPrivKeyHex,
    keyOps,
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedContact]);

  const threadMessages = selectedContact?.nostrPubkey
    ? messages.filter(m =>
        m.fromNostrPub === selectedContact.nostrPubkey ||
        m.toNostrPub   === selectedContact.nostrPubkey
      )
    : [];

  // ── Security helpers ──────────────────────────────────────────────────────────

  const sessionDaysLeft = sessionKey
    ? Math.max(0, Math.ceil((sessionKey.expiry - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

  const handleRotateSession = async () => {
    setRotatingSession(true);
    try {
      await onRotateSession();
      if (activeIdentityName && keyOps.longTermKeys) {
        const newSession = keyOps.sessionKeys?.publicKey;
        await onPublishProfile(activeIdentityName, newSession);
      }
    } finally {
      setRotatingSession(false);
    }
  };

  const handleGeneratePrekeys = async () => {
    setGeneratingKeys(true);
    try {
      const fresh = await onGeneratePrekeys();
      await publishPrekeys(fresh.map(p => ({ id: p.id, publicKey: p.keys.publicKey })));
    } finally {
      setGeneratingKeys(false);
    }
  };

  // ── Nostr setup ───────────────────────────────────────────────────────────────

  if (!nostrPrivKeyHex) {
    return (
      <div className="space-y-6">
        <div className="onboarding-steps">
          <p className="onboarding-title">Set up Nostr to start messaging</p>
          <div className="onboarding-step">
            <div className="step-num">1</div>
            <div>
              <strong>Generate a Nostr identity</strong>
              <p>Creates a secp256k1 keypair stored in your encrypted vault — used for routing and sender authentication, not for encryption.</p>
            </div>
          </div>
          <div className="onboarding-step">
            <div className="step-num">2</div>
            <div>
              <strong>Publish your profile</strong>
              <p>Uploads your Khazna Public Address to a Nostr relay. Contacts look you up by npub — no more 1600-character key copy-paste.</p>
            </div>
          </div>
          <div className="onboarding-step">
            <div className="step-num">3</div>
            <div>
              <strong>Add contacts &amp; message</strong>
              <p>Paste a contact's npub. Khazna fetches their key automatically and sends messages encrypted to their strongest available key.</p>
            </div>
          </div>
        </div>
        <button className="btn" onClick={onSetupNostr}>
          <Shield size={17} style={{ marginRight: '8px' }} /> Generate Nostr Identity
        </button>
      </div>
    );
  }

  // ── Contact lookup ────────────────────────────────────────────────────────────

  const handleLookup = async () => {
    const npub = lookupNpub.trim();
    if (!isValidNpub(npub)) {
      setLookupError('Not a valid npub.'); setLookupStatus('error'); return;
    }
    setLookupStatus('loading'); setLookupError('');
    const result = await lookupContact(npub);
    if (!result) {
      setLookupError('Profile not found or has no Khazna key published.');
      setLookupStatus('error'); return;
    }
    onAddContact(result.name, result.khaznaPublicKey, result.nostrPubKey);
    setLookupNpub(''); setLookupStatus('idle');
  };

  const handlePublishProfile = async () => {
    if (!activeIdentityName || !keyOps.longTermKeys) return;
    setPublishStatus('loading');
    try {
      await onPublishProfile(activeIdentityName, keyOps.sessionKeys?.publicKey);
      setPublishStatus('done');
    } catch {
      setPublishStatus('idle');
    }
  };

  // ── Send handlers ─────────────────────────────────────────────────────────────

  const handleSendText = async () => {
    if (!draft.trim() || !selectedContact) return;
    setSending(true);
    try {
      await sendText(draft.trim(), selectedContact);
      setDraft('');
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  const handleSendFile = async (file: File) => {
    if (!selectedContact) return;
    if (file.size > MAX_FILE_SIZE) {
      setFileError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 100 MB.`);
      return;
    }
    setSending(true);
    setFileError(null);
    try {
      await sendFile(file, selectedContact);
    } catch (e: unknown) {
      setFileError(e instanceof Error ? e.message : 'Failed to send file.');
    } finally {
      setSending(false);
    }
  };

  const handleDownload = async (msg: Message) => {
    if (!msg.fileUrl) return;
    setDownloadingId(msg.id);
    setFileError(null);
    try {
      const encryptedBlob = await downloadFromBlossom(msg.fileUrl);

      // Try keys in priority order — same order as encryption was resolved
      let decrypted: Uint8Array | null = null;

      if (msg.prekeyId) {
        const privKey = keyOps.getPrekeyPrivKey(msg.prekeyId);
        if (privKey) {
          try { decrypted = decryptFile(encryptedBlob, privKey); } catch { /* try next */ }
        }
      }
      if (!decrypted && keyOps.sessionKeys?.privateKey) {
        try { decrypted = decryptFile(encryptedBlob, keyOps.sessionKeys.privateKey); } catch { /* try next */ }
      }
      if (!decrypted && keyOps.longTermKeys?.privateKey) {
        try { decrypted = decryptFile(encryptedBlob, keyOps.longTermKeys.privateKey); } catch { /* try next */ }
      }

      if (!decrypted) {
        throw new Error('Could not decrypt the file. The private key may have been rotated or the file is corrupted.');
      }

      // Prekey is consumed only after successful file decryption
      if (msg.prekeyId) await keyOps.consumePrekey(msg.prekeyId);

      const a = document.createElement('a');
      a.href     = URL.createObjectURL(new Blob([decrypted as BlobPart]));
      a.download = msg.fileName ?? 'file';
      a.click();
    } catch (e: unknown) {
      setFileError(e instanceof Error ? e.message : 'File download failed.');
    } finally {
      setDownloadingId(null);
    }
  };

  const copyNpub = () => {
    if (!myNpub) return;
    navigator.clipboard.writeText(myNpub);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const nostrContacts = contacts.filter(c => c.nostrPubkey);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Security status bar */}
      <div style={{
        display: 'flex', gap: '0.75rem', flexWrap: 'wrap',
        padding: '0.75rem 1rem', background: 'var(--bg)',
        border: '1px solid var(--border)', borderRadius: '10px',
        fontSize: '0.75rem',
      }}>
        {/* npub */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '200px' }}>
          <User size={12} color="var(--text-muted)" />
          <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {myNpub?.slice(0, 28)}…
          </span>
          <button className="copy-btn" style={{ padding: '1px 6px', fontSize: '0.65rem', flexShrink: 0 }} onClick={copyNpub}>
            {copied ? <Check size={9} /> : <Copy size={9} />}
          </button>
          <span style={{ color: status === 'connected' ? 'var(--success)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
            {status === 'connected' ? <Wifi size={10} /> : status === 'connecting' ? <Loader size={10} /> : <WifiOff size={10} />}
            {status}
          </span>
        </div>

        {/* Session key */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <Key size={12} color={sessionDaysLeft !== null && sessionDaysLeft < 7 ? 'var(--error)' : 'var(--text-muted)'} />
          <span style={{ color: 'var(--text-muted)' }}>
            Session key:&nbsp;
            {sessionDaysLeft === null
              ? <span style={{ color: 'var(--error)' }}>not set</span>
              : <span style={{ color: sessionDaysLeft < 7 ? 'var(--error)' : 'var(--success)' }}>
                  {sessionDaysLeft}d left
                </span>
            }
          </span>
          <button
            className="copy-btn"
            style={{ padding: '1px 6px', fontSize: '0.65rem' }}
            onClick={handleRotateSession}
            disabled={rotatingSession}
            title="Rotate session key — old messages encrypted to the previous key become unreadable"
          >
            {rotatingSession ? <Loader size={9} /> : <RotateCcw size={9} />} Rotate
          </button>
        </div>

        {/* Prekeys */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <Shield size={12} color={prekeyCount < 10 ? 'var(--error)' : 'var(--text-muted)'} />
          <span style={{ color: 'var(--text-muted)' }}>
            Prekeys:&nbsp;
            <span style={{ color: prekeyCount < 10 ? 'var(--error)' : prekeyCount > 20 ? 'var(--success)' : 'var(--text-muted)' }}>
              {prekeyCount} remaining
            </span>
          </span>
          {prekeyCount < 20 && (
            <button
              className="copy-btn"
              style={{ padding: '1px 6px', fontSize: '0.65rem' }}
              onClick={handleGeneratePrekeys}
              disabled={generatingKeys}
            >
              {generatingKeys ? <Loader size={9} /> : <RefreshCw size={9} />} Generate
            </button>
          )}
        </div>

        {/* Publish profile */}
        {keyOps.longTermKeys && (
          <button
            className="copy-btn"
            style={{ padding: '1px 6px', fontSize: '0.65rem', flexShrink: 0 }}
            onClick={handlePublishProfile}
            disabled={publishStatus !== 'idle'}
          >
            {publishStatus === 'done' ? <Check size={9} /> : publishStatus === 'loading' ? <Loader size={9} /> : <RefreshCw size={9} />}
            {publishStatus === 'done' ? 'Published' : 'Publish Profile'}
          </button>
        )}
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', gap: '1.5rem', minHeight: '440px' }}>

        {/* Sidebar */}
        <div style={{ width: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {nostrContacts.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>
              No Nostr contacts yet.
            </p>
          ) : nostrContacts.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedContact(c)}
              style={{
                width: '100%', textAlign: 'left',
                background: selectedContact?.id === c.id ? 'rgba(37,99,235,0.08)' : 'none',
                border: 'none', borderRadius: '8px', padding: '0.5rem 0.75rem',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                fontSize: '0.8rem',
                color: selectedContact?.id === c.id ? 'var(--primary)' : 'var(--text)',
              }}
            >
              <User size={14} /> {c.name}
            </button>
          ))}

          {/* Lookup */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.35rem', display: 'block' }}>
              Add by npub
            </label>
            <input
              placeholder="npub1…"
              value={lookupNpub}
              onChange={e => { setLookupNpub(e.target.value); setLookupStatus('idle'); }}
              style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem', marginBottom: '0.35rem' }}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
            />
            {lookupStatus === 'error' && (
              <p style={{ fontSize: '0.7rem', color: 'var(--error)', margin: '0 0 0.35rem' }}>{lookupError}</p>
            )}
            <button
              className="btn"
              style={{ padding: '0.4rem', fontSize: '0.75rem' }}
              onClick={handleLookup}
              disabled={lookupStatus === 'loading' || !lookupNpub}
            >
              {lookupStatus === 'loading' ? <Loader size={12} /> : 'Look up'}
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {!selectedContact ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {nostrContacts.length === 0 ? 'Add a contact by npub to start messaging.' : 'Select a contact.'}
            </div>
          ) : (
            <>
              <div style={{ paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={16} />
                <strong style={{ fontSize: '0.9rem' }}>{selectedContact.name}</strong>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {selectedContact.nostrPubkey ? nostrPubToNpub(selectedContact.nostrPubkey).slice(0, 20) + '…' : ''}
                </span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px' }}>
                {threadMessages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2rem' }}>
                    No messages yet.
                  </div>
                ) : threadMessages.map(msg => {
                  const isMine = msg.fromNostrPub !== selectedContact.nostrPubkey;
                  const keyBadge = msg.keyType === 'prekey' ? '🔑' : msg.keyType === 'session' ? '⏱' : null;
                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '75%', padding: '0.6rem 0.9rem',
                        borderRadius: isMine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                        background: isMine ? 'var(--primary)' : 'var(--bg)',
                        color: isMine ? 'white' : 'var(--text)',
                        border: isMine ? 'none' : '1px solid var(--border)',
                        fontSize: '0.875rem', lineHeight: 1.5,
                      }}>
                        {msg.type === 'text' ? (
                          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileIcon size={16} />
                            <span style={{ flex: 1, wordBreak: 'break-all' }}>{msg.fileName}</span>
                            <button
                              onClick={() => handleDownload(msg)}
                              disabled={downloadingId === msg.id}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, flexShrink: 0 }}
                              title="Download and decrypt"
                            >
                              {downloadingId === msg.id
                                ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                : <Download size={14} />
                              }
                            </button>
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.verified && <Shield size={9} color="var(--success)" aria-label="Signature verified" />}
                        {keyBadge && <span title={msg.keyType}>{keyBadge}</span>}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {fileError && (
                <div className="alert alert-error" style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
                  <span>{fileError}</span>
                  <button onClick={() => setFileError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem' }}>×</button>
                </div>
              )}

              {!keyOps.longTermKeys ? (
                <div className="hint" style={{ marginTop: '1rem' }}>
                  Select an identity in the Vault tab to send messages.
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'flex-end' }}>
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); }}}
                    style={{ flex: 1, minHeight: '44px', maxHeight: '120px', resize: 'vertical', fontSize: '0.875rem' }}
                  />
                  <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleSendFile(f); e.target.value = ''; }} />
                  <button className="copy-btn" onClick={() => fileInputRef.current?.click()} title="Send file" style={{ padding: '0.6rem' }}>
                    <Paperclip size={16} />
                  </button>
                  <button className="btn" onClick={handleSendText} disabled={!draft.trim() || sending} style={{ width: 'auto', padding: '0.6rem 1rem' }}>
                    {sending ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
