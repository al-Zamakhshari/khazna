import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Paperclip, Wifi, WifiOff, User, Copy, Check,
  RefreshCw, Shield, FileIcon, Download, Loader,
  RotateCcw, ChevronDown, ChevronUp, Lock,
} from 'lucide-react';
import { useNostr, type NostrKeyOps, type Message } from '../hooks/useNostr';
import { downloadFromBlossom, MAX_FILE_SIZE } from '../utils/blossom';
import {
  isValidNpub, nostrPubToNpub,
  buildPrekeyEvent, buildProfileEvent, publishEvent,
} from '../utils/nostr';
import { decryptFile, type VaultContact, type SessionKey } from '../utils/crypto';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pubkeyColor(hex: string): string {
  const n = parseInt(hex.slice(0, 6), 16) % 360;
  return `hsl(${n}, 60%, 48%)`;
}

function pubkeyInitial(hex: string): string {
  return hex.slice(0, 1).toUpperCase();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MessagesTabProps {
  nostrPrivKeyHex:    string | undefined;
  keyOps:             NostrKeyOps;
  contacts:           VaultContact[];
  sessionKey:         SessionKey | undefined;
  prekeyCount:        number;
  onAddContact:       (name: string, khaznaKey: string, nostrPub: string) => void;
  onInitMessaging:    () => Promise<{ nostrKey: { privateKey: string; publicKey: string }; sessionKey: { publicKey: string }; prekeys: { id: string; keys: { publicKey: string } }[] } | null>;
  onEnsureSession:    () => Promise<string | null>;
  onPublishProfile:   (displayName: string, sessionPub?: string) => void;
  onRotateSession:    () => Promise<void>;
  onGeneratePrekeys:  () => Promise<{ id: string; keys: { publicKey: string } }[]>;
  onGoToVault:        () => void;
  activeIdentityName: string | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const MessagesTab: React.FC<MessagesTabProps> = ({
  nostrPrivKeyHex, keyOps, contacts, sessionKey, prekeyCount,
  onAddContact, onInitMessaging, onEnsureSession, onPublishProfile,
  onRotateSession, onGeneratePrekeys, onGoToVault, activeIdentityName,
}) => {
  const [selectedContact, setSelectedContact]  = useState<VaultContact | null>(null);
  const [draft,           setDraft]            = useState('');
  const [lookupNpub,      setLookupNpub]       = useState('');
  const [lookupStatus,    setLookupStatus]     = useState<'idle'|'loading'|'error'>('idle');
  const [lookupError,     setLookupError]      = useState('');
  const [copiedNpub,      setCopiedNpub]       = useState(false);
  const [sending,         setSending]          = useState(false);
  const [sendingFile,     setSendingFile]      = useState<string | null>(null);
  const [fileError,       setFileError]        = useState<string | null>(null);
  const [downloadingId,   setDownloadingId]    = useState<string | null>(null);
  const [settingUp,       setSettingUp]        = useState(false);
  const [showSecDetails,  setShowSecDetails]   = useState(false);
  const [rotatingSession, setRotatingSession]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);

  const { myNpub, messages, status, sendText, sendFile,
          lookupContact, publishPrekeys } = useNostr(nostrPrivKeyHex, keyOps);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedContact]);

  const nostrContacts   = contacts.filter(c => c.nostrPubkey);
  const threadMessages  = selectedContact?.nostrPubkey
    ? messages.filter(m => m.fromNostrPub === selectedContact.nostrPubkey || m.toNostrPub === selectedContact.nostrPubkey)
    : [];

  // ── Security level ────────────────────────────────────────────────────────

  const sessionDaysLeft = sessionKey
    ? Math.max(0, Math.ceil((sessionKey.expiry - Date.now()) / 86_400_000))
    : null;

  type Level = 'none' | 'basic' | 'good' | 'strong';
  const secLevel: Level = (() => {
    if (!nostrPrivKeyHex)                                              return 'none';
    if (prekeyCount > 0 && sessionDaysLeft !== null && sessionDaysLeft > 0) return 'strong';
    if (sessionDaysLeft !== null && sessionDaysLeft > 0)               return 'good';
    return 'basic';
  })();

  const SEC = {
    none:   { color: 'var(--text-muted)', label: 'Not set up' },
    basic:  { color: '#f59e0b',           label: 'Basic' },
    good:   { color: '#eab308',           label: 'Good' },
    strong: { color: 'var(--success)',    label: 'Strong' },
  };

  // ── Setup step detection ──────────────────────────────────────────────────

  type SetupStep = 'nostr' | 'identity' | 'prekeys' | null;
  const setupStep: SetupStep = (() => {
    if (!nostrPrivKeyHex)       return 'nostr';
    if (!keyOps.longTermKeys)   return 'identity';
    if (prekeyCount === 0)      return 'prekeys';
    return null;
  })();

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleFullSetup = useCallback(async () => {
    setSettingUp(true);
    try {
      // Single atomic vault write — avoids stale-closure overwrites from sequential saves
      const result = await onInitMessaging();
      if (!result) return;

      const { nostrKey, sessionKey: sessionKeys, prekeys } = result;

      if (prekeys.length > 0) {
        await publishEvent(buildPrekeyEvent(
          prekeys.map(p => ({ id: p.id, publicKey: p.keys.publicKey })),
          nostrKey.privateKey,
        ));
      }

      if (activeIdentityName && keyOps.longTermKeys) {
        await publishEvent(buildProfileEvent(
          activeIdentityName,
          keyOps.longTermKeys.publicKey,
          nostrKey.privateKey,
          sessionKeys.publicKey,
        ));
      }
    } catch (e) {
      console.error('Setup failed:', e);
    } finally {
      setSettingUp(false);
    }
  }, [onInitMessaging, activeIdentityName, keyOps.longTermKeys]);

  const handleGeneratePrekeys = async () => {
    const prekeys = await onGeneratePrekeys();
    if (prekeys.length > 0 && nostrPrivKeyHex) {
      await publishPrekeys(prekeys.map(p => ({ id: p.id, publicKey: p.keys.publicKey })));
    }
  };

  const handleRotateSession = async () => {
    setRotatingSession(true);
    try {
      await onRotateSession();
      if (activeIdentityName && keyOps.longTermKeys && nostrPrivKeyHex) {
        const sessionPub = await onEnsureSession();
        await onPublishProfile(activeIdentityName, sessionPub ?? undefined);
      }
    } finally {
      setRotatingSession(false);
    }
  };

  const handleLookup = async () => {
    const npub = lookupNpub.trim();
    if (!isValidNpub(npub)) { setLookupError('Not a valid npub.'); setLookupStatus('error'); return; }
    setLookupStatus('loading'); setLookupError('');
    const r = await lookupContact(npub);
    if (!r) {
      setLookupError("Profile not found, or this user hasn't published a Khazna key yet.");
      setLookupStatus('error'); return;
    }
    onAddContact(r.name, r.khaznaPublicKey, r.nostrPubKey);
    setLookupNpub(''); setLookupStatus('idle');
  };

  const handleSendText = async () => {
    if (!draft.trim() || !selectedContact) return;
    setSending(true); setFileError(null);
    try { await sendText(draft.trim(), selectedContact); setDraft(''); }
    catch (e: unknown) { setFileError(e instanceof Error ? e.message : 'Send failed.'); }
    finally { setSending(false); }
  };

  const handleSendFile = async (file: File) => {
    if (!selectedContact) return;
    if (file.size > MAX_FILE_SIZE) {
      setFileError(`File too large (${(file.size/1024/1024).toFixed(1)} MB). Max is 100 MB.`); return;
    }
    setSendingFile(file.name); setFileError(null);
    try { await sendFile(file, selectedContact); }
    catch (e: unknown) { setFileError(e instanceof Error ? e.message : 'File send failed.'); }
    finally { setSendingFile(null); }
  };

  const handleDownload = async (msg: Message) => {
    if (!msg.fileUrl) return;
    setDownloadingId(msg.id); setFileError(null);
    try {
      const enc = await downloadFromBlossom(msg.fileUrl);
      let dec: Uint8Array | null = null;

      if (msg.prekeyId) {
        const pk = keyOps.getPrekeyPrivKey(msg.prekeyId);
        if (pk) try { dec = decryptFile(enc, pk); } catch { /* try next */ }
      }
      if (!dec && keyOps.sessionKeys?.privateKey)
        try { dec = decryptFile(enc, keyOps.sessionKeys.privateKey); } catch { /* try next */ }
      if (!dec && keyOps.longTermKeys?.privateKey)
        try { dec = decryptFile(enc, keyOps.longTermKeys.privateKey); } catch { /* */ }

      if (!dec) throw new Error('Could not decrypt — private key may have been rotated.');
      if (msg.prekeyId) await keyOps.consumePrekey(msg.prekeyId);

      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([dec as BlobPart]));
      a.download = msg.fileName ?? 'file';
      a.click();
    } catch (e: unknown) {
      setFileError(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      setDownloadingId(null);
    }
  };

  const copyNpub = () => {
    if (!myNpub) return;
    navigator.clipboard.writeText(myNpub);
    setCopiedNpub(true);
    setTimeout(() => setCopiedNpub(false), 2000);
  };

  // ── Setup screens ─────────────────────────────────────────────────────────

  if (setupStep === 'nostr') {
    return (
      <div className="setup-card">
        <Lock size={40} color="var(--primary)" />
        <h3>Set up Secure Messaging</h3>
        <p>
          One click generates your Nostr routing identity, a 30-day session key,
          and 50 one-time prekeys — then publishes your profile so contacts can find you.
        </p>
        <button className="btn" onClick={handleFullSetup} disabled={settingUp}>
          {settingUp
            ? <><Loader size={16} style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} />Setting up…</>
            : 'Get Started'}
        </button>
        {!activeIdentityName && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Tip: select an identity in the Vault tab first so your profile is published automatically.
          </p>
        )}
      </div>
    );
  }

  if (setupStep === 'identity') {
    return (
      <div className="setup-card">
        <User size={40} color="var(--primary)" />
        <h3>Select an Identity</h3>
        <p>Go to the Vault tab and select an identity to enable encryption.</p>
        <button className="btn" onClick={onGoToVault}>Open Vault</button>
      </div>
    );
  }

  if (setupStep === 'prekeys') {
    return (
      <div className="setup-card">
        <Shield size={40} color="var(--primary)" />
        <h3>Generate One-Time Keys</h3>
        <p>
          One-time prekeys give every message its own forward secrecy —
          if a key is ever stolen, only that single message is exposed.
        </p>
        <button className="btn" onClick={handleGeneratePrekeys}>
          Generate Keys
        </button>
      </div>
    );
  }

  // ── Full messaging UI ─────────────────────────────────────────────────────

  return (
    <div>
      {/* Security badge */}
      <div className="security-bar">
        <div className="security-dot" style={{ background: SEC[secLevel].color }} />
        <span className="security-level" style={{ color: SEC[secLevel].color }}>
          {SEC[secLevel].label}
        </span>
        <span className="sep">·</span>
        <span style={{ color: status === 'connected' ? 'var(--success)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {status === 'connected' ? <Wifi size={11} /> : status === 'connecting' ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <WifiOff size={11} />}
          {status}
        </span>
        <button
          onClick={() => setShowSecDetails(v => !v)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', padding: '2px 4px' }}
        >
          {showSecDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {showSecDetails ? 'Hide' : 'Details'}
        </button>
      </div>

      {showSecDetails && (
        <div className="security-details">
          <div>
            <label>My npub</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="detail-val" style={{ color: 'var(--text-muted)' }}>
                {myNpub?.slice(0, 32)}…
              </span>
              <button className="copy-btn" style={{ padding: '1px 6px', fontSize: '0.65rem' }} onClick={copyNpub}>
                {copiedNpub ? <Check size={9} /> : <Copy size={9} />}
              </button>
            </div>
          </div>
          <div>
            <label>Session key</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: sessionDaysLeft !== null && sessionDaysLeft < 7 ? 'var(--error)' : 'var(--text)' }}>
                {sessionDaysLeft === null ? 'Not set' : `${sessionDaysLeft}d left`}
              </span>
              <button className="copy-btn" style={{ padding: '1px 6px', fontSize: '0.65rem' }} onClick={handleRotateSession} disabled={rotatingSession}>
                {rotatingSession ? <Loader size={9} /> : <RotateCcw size={9} />} Rotate
              </button>
            </div>
          </div>
          <div>
            <label>One-time prekeys</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: prekeyCount < 10 ? 'var(--error)' : 'var(--text)' }}>
                {prekeyCount} remaining
              </span>
              {prekeyCount < 20 && (
                <button className="copy-btn" style={{ padding: '1px 6px', fontSize: '0.65rem' }} onClick={handleGeneratePrekeys}>
                  <RefreshCw size={9} /> Generate
                </button>
              )}
            </div>
          </div>
          <div>
            <label>Profile</label>
            <button className="copy-btn" style={{ padding: '1px 6px', fontSize: '0.65rem', marginTop: 2 }}
              onClick={async () => { if (activeIdentityName && keyOps.longTermKeys) { const s = await onEnsureSession(); onPublishProfile(activeIdentityName, s ?? undefined); }}}>
              <RefreshCw size={9} /> Re-publish
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', minHeight: '420px' }}>

        {/* Contact sidebar */}
        <div style={{ width: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {nostrContacts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <User size={28} style={{ opacity: 0.15, display: 'block', margin: '0 auto 0.5rem' }} />
              No contacts yet. Add someone by npub below.
            </div>
          ) : nostrContacts.map(c => {
            const color = pubkeyColor(c.nostrPubkey ?? '0');
            return (
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
                <div className="pub-avatar" style={{ background: color }}>{pubkeyInitial(c.nostrPubkey ?? '0')}</div>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              </button>
            );
          })}

          {/* Add contact */}
          <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
            <input
              placeholder="npub1… — look up by Nostr ID"
              value={lookupNpub}
              onChange={e => { setLookupNpub(e.target.value); setLookupStatus('idle'); }}
              onKeyDown={e => e.key === 'Enter' && handleLookup()}
              style={{ fontSize: '0.72rem', padding: '0.4rem 0.6rem', marginBottom: '0.35rem' }}
            />
            {lookupStatus === 'error' && (
              <p style={{ fontSize: '0.7rem', color: 'var(--error)', margin: '0 0 0.35rem', lineHeight: 1.4 }}>{lookupError}</p>
            )}
            <button
              className="btn"
              style={{ padding: '0.4rem', fontSize: '0.75rem' }}
              onClick={handleLookup}
              disabled={lookupStatus === 'loading' || !lookupNpub.trim()}
            >
              {lookupStatus === 'loading' ? <Loader size={12} /> : 'Add Contact'}
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!selectedContact ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center' }}>
              {nostrContacts.length === 0
                ? 'Add a contact by npub to start messaging.'
                : 'Select a contact to start a conversation.'}
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={{ paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="pub-avatar" style={{ background: pubkeyColor(selectedContact.nostrPubkey ?? '0'), width: 26, height: 26, fontSize: '0.7rem' }}>
                  {pubkeyInitial(selectedContact.nostrPubkey ?? '0')}
                </div>
                <strong style={{ fontSize: '0.9rem' }}>{selectedContact.name}</strong>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedContact.nostrPubkey ? nostrPubToNpub(selectedContact.nostrPubkey).slice(0, 24) + '…' : ''}
                </span>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', paddingRight: '2px' }}>
                {threadMessages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2rem' }}>
                    No messages yet. Send the first one!
                  </div>
                ) : threadMessages.map(msg => {
                  const isMine = msg.toNostrPub === selectedContact.nostrPubkey;
                  const keyBadge = msg.keyType === 'prekey' ? '🔑' : msg.keyType === 'session' ? '⏱' : null;

                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                      {!isMine && <p className="msg-sender">{selectedContact.name}</p>}
                      <div style={{
                        maxWidth: '78%', padding: '0.6rem 0.875rem',
                        borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isMine ? 'var(--primary)' : 'var(--bg)',
                        color: isMine ? 'white' : 'var(--text)',
                        border: isMine ? 'none' : '1px solid var(--border)',
                        fontSize: '0.875rem', lineHeight: 1.5, wordBreak: 'break-word',
                      }}>
                        {msg.type === 'text' ? (
                          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileIcon size={15} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.fileName}</span>
                            <button
                              onClick={() => handleDownload(msg)}
                              disabled={downloadingId === msg.id}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, flexShrink: 0 }}
                            >
                              {downloadingId === msg.id
                                ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                : <Download size={13} />}
                            </button>
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.verified && <Shield size={9} color="var(--success)" aria-label="Verified" />}
                        {keyBadge && <span title={msg.keyType}>{keyBadge}</span>}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Error */}
              {fileError && (
                <div className="alert alert-error" style={{ marginTop: '0.75rem', fontSize: '0.8rem', padding: '0.625rem 1rem' }}>
                  <span style={{ flex: 1 }}>{fileError}</span>
                  <button onClick={() => setFileError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: '1rem', marginLeft: 6 }}>×</button>
                </div>
              )}

              {/* Input */}
              {!keyOps.longTermKeys ? (
                <div className="hint" style={{ marginTop: '1rem' }}>
                  Select an identity in the Vault tab to send messages.
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'flex-end' }}>
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder={sendingFile ? `Uploading ${sendingFile}…` : 'Type a message… (Enter to send)'}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); }}}
                    disabled={!!sendingFile}
                    style={{ flex: 1, minHeight: '44px', maxHeight: '120px', resize: 'vertical', fontSize: '0.875rem' }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleSendFile(f); e.target.value = ''; }}
                  />
                  <button
                    className="copy-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file"
                    style={{ padding: '0.6rem' }}
                    disabled={!!sendingFile}
                  >
                    {sendingFile
                      ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Paperclip size={15} />}
                  </button>
                  <button
                    className="btn"
                    onClick={handleSendText}
                    disabled={!draft.trim() || sending || !!sendingFile}
                    style={{ width: 'auto', padding: '0.6rem 1rem' }}
                  >
                    {sending ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
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
