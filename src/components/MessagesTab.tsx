import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Paperclip, Wifi, WifiOff, User, Copy, Check,
  RefreshCw, Shield, FileIcon, Download, Loader,
} from 'lucide-react';
import { useNostr } from '../hooks/useNostr';
import { downloadFromBlossom } from '../utils/blossom';
import { isValidNpub, nostrPubToNpub } from '../utils/nostr';
import { type PQCKeyPair } from '../utils/crypto';

interface Contact {
  id:           string;
  name:         string;
  publicKey:    string;
  nostrPubkey?: string;
}

interface MessagesTabProps {
  nostrPrivKeyHex:  string | undefined;
  activeKhaznaKeys: PQCKeyPair | null;
  contacts:         Contact[];
  onAddContact:     (name: string, khaznaKey: string, nostrPub: string) => void;
  onSetupNostr:     () => void;
  onPublishProfile: (displayName: string) => void;
  activeIdentityName: string | null;
  activeIdentityKey:  PQCKeyPair | null;
}

export const MessagesTab: React.FC<MessagesTabProps> = ({
  nostrPrivKeyHex,
  activeKhaznaKeys,
  contacts,
  onAddContact,
  onSetupNostr,
  onPublishProfile,
  activeIdentityName,
  activeIdentityKey,
}) => {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [draft,           setDraft]           = useState('');
  const [lookupNpub,      setLookupNpub]      = useState('');
  const [lookupStatus,    setLookupStatus]    = useState<'idle' | 'loading' | 'error'>('idle');
  const [lookupError,     setLookupError]     = useState('');
  const [copied,          setCopied]          = useState(false);
  const [sending,         setSending]         = useState(false);
  const [publishStatus,   setPublishStatus]   = useState<'idle' | 'loading' | 'done'>('idle');
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const bottomRef     = useRef<HTMLDivElement>(null);

  const { myNpub, messages, status, sendText, sendFile, lookupContact } = useNostr(
    nostrPrivKeyHex,
    activeKhaznaKeys,
  );

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedContact]);

  const threadMessages = selectedContact?.nostrPubkey
    ? messages.filter(m =>
        m.fromNostrPub === selectedContact.nostrPubkey ||
        m.toNostrPub   === selectedContact.nostrPubkey
      )
    : [];

  // ── Nostr not set up ─────────────────────────────────────────────────────────

  if (!nostrPrivKeyHex) {
    return (
      <div className="space-y-6">
        <div className="onboarding-steps">
          <p className="onboarding-title">Set up Nostr to start messaging</p>
          <div className="onboarding-step">
            <div className="step-num">1</div>
            <div>
              <strong>Generate a Nostr identity</strong>
              <p>Creates a secp256k1 keypair stored in your encrypted vault. Used for routing and sender authentication — not for encryption.</p>
            </div>
          </div>
          <div className="onboarding-step">
            <div className="step-num">2</div>
            <div>
              <strong>Publish your profile</strong>
              <p>Uploads your Khazna Public Address to a public Nostr relay so contacts can look you up by your npub.</p>
            </div>
          </div>
          <div className="onboarding-step">
            <div className="step-num">3</div>
            <div>
              <strong>Add contacts by npub</strong>
              <p>Paste a contact's npub — Khazna fetches their Khazna key automatically. No more 1600-character copy-paste.</p>
            </div>
          </div>
        </div>
        <button className="btn" onClick={onSetupNostr}>
          <Shield size={17} style={{ marginRight: '8px' }} /> Generate Nostr Identity
        </button>
      </div>
    );
  }

  // ── Profile not published yet ─────────────────────────────────────────────────

  const handlePublishProfile = async () => {
    if (!activeIdentityName || !activeIdentityKey) return;
    setPublishStatus('loading');
    try {
      await onPublishProfile(activeIdentityName);
      setPublishStatus('done');
    } catch {
      setPublishStatus('idle');
    }
  };

  // ── Lookup contact by npub ────────────────────────────────────────────────────

  const handleLookup = async () => {
    if (!isValidNpub(lookupNpub.trim())) {
      setLookupError('Not a valid npub.'); setLookupStatus('error'); return;
    }
    setLookupStatus('loading'); setLookupError('');
    const result = await lookupContact(lookupNpub.trim());
    if (!result) {
      setLookupError('Profile not found or has no Khazna key published.');
      setLookupStatus('error'); return;
    }
    onAddContact(result.name, result.khaznaPublicKey, result.nostrPubKey);
    setLookupNpub(''); setLookupStatus('idle');
  };

  // ── Send handlers ─────────────────────────────────────────────────────────────

  const handleSendText = async () => {
    if (!draft.trim() || !selectedContact?.nostrPubkey || !activeKhaznaKeys) return;
    setSending(true);
    try {
      await sendText(draft.trim(), selectedContact.publicKey, selectedContact.nostrPubkey);
      setDraft('');
    } catch (e: unknown) {
      console.error('Send failed', e);
    } finally {
      setSending(false);
    }
  };

  const handleSendFile = async (file: File) => {
    if (!selectedContact?.nostrPubkey || !activeKhaznaKeys) return;
    setSending(true);
    try {
      await sendFile(file, selectedContact.publicKey, selectedContact.nostrPubkey);
    } catch (e: unknown) {
      console.error('File send failed', e);
    } finally {
      setSending(false);
    }
  };

  const handleDownload = async (url: string, fileName: string) => {
    try {
      const data  = await downloadFromBlossom(url);
      const blob  = new Blob([data as BlobPart]);
      const a     = document.createElement('a');
      a.href      = URL.createObjectURL(blob);
      a.download  = fileName;
      a.click();
    } catch {
      alert('Download failed.');
    }
  };

  const copyNpub = () => {
    if (!myNpub) return;
    navigator.clipboard.writeText(myNpub);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const nostrContacts = contacts.filter(c => c.nostrPubkey);

  return (
    <div style={{ display: 'flex', gap: '1.5rem', minHeight: '500px' }}>

      {/* Sidebar */}
      <div style={{ width: '220px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* My npub */}
        <div style={{ padding: '0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>My npub</span>
            <button className="copy-btn" style={{ padding: '2px 6px', fontSize: '0.65rem' }} onClick={copyNpub}>
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div style={{ fontFamily: 'monospace', wordBreak: 'break-all', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
            {myNpub?.slice(0, 24)}…
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.65rem' }}>
            {status === 'connected'
              ? <><Wifi size={10} color="var(--success)" /> <span style={{ color: 'var(--success)' }}>Connected</span></>
              : status === 'connecting'
              ? <><Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> Connecting…</>
              : <><WifiOff size={10} color="var(--text-muted)" /> <span style={{ color: 'var(--text-muted)' }}>Offline</span></>
            }
          </div>
        </div>

        {/* Publish profile */}
        {activeIdentityKey && (
          <button
            className="copy-btn"
            style={{ fontSize: '0.75rem', justifyContent: 'center' }}
            onClick={handlePublishProfile}
            disabled={publishStatus === 'loading' || publishStatus === 'done'}
          >
            {publishStatus === 'loading' ? <Loader size={12} /> : publishStatus === 'done' ? <Check size={12} /> : <RefreshCw size={12} />}
            {publishStatus === 'done' ? 'Published' : 'Publish Profile'}
          </button>
        )}

        {/* Contact list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {nostrContacts.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem' }}>
              No Nostr contacts yet. Look up someone by npub below.
            </p>
          ) : nostrContacts.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedContact(c)}
              style={{
                width: '100%', textAlign: 'left', background: selectedContact?.id === c.id ? 'rgba(37,99,235,0.08)' : 'none',
                border: 'none', borderRadius: '8px', padding: '0.5rem 0.75rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem',
                color: selectedContact?.id === c.id ? 'var(--primary)' : 'var(--text)',
              }}
            >
              <User size={14} /> {c.name}
            </button>
          ))}
        </div>

        {/* Lookup by npub */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0' }}>
        {!selectedContact ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {nostrContacts.length === 0
              ? 'Add a contact by npub to start messaging.'
              : 'Select a contact to start a conversation.'}
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={16} />
              <strong style={{ fontSize: '0.9rem' }}>{selectedContact.name}</strong>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '4px', fontFamily: 'monospace' }}>
                {selectedContact.nostrPubkey ? nostrPubToNpub(selectedContact.nostrPubkey).slice(0, 20) + '…' : ''}
              </span>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: '300px', maxHeight: '380px' }}>
              {threadMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2rem' }}>
                  No messages yet. Send the first one!
                </div>
              ) : threadMessages.map(msg => {
                const isMine = msg.fromNostrPub !== selectedContact.nostrPubkey;
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: isMine ? 'flex-end' : 'flex-start',
                    }}
                  >
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
                          <span>{msg.fileName}</span>
                          <button
                            onClick={() => msg.fileUrl && handleDownload(msg.fileUrl, msg.fileName ?? 'file')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
                          >
                            <Download size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {msg.verified && <Shield size={9} color="var(--success)" aria-label="Signature verified" />}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            {!activeKhaznaKeys ? (
              <div className="hint" style={{ marginTop: '1rem' }}>
                Select an identity in the Vault tab to send messages.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'flex-end' }}>
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); }}}
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
                  title="Send file"
                  style={{ padding: '0.6rem' }}
                >
                  <Paperclip size={16} />
                </button>
                <button
                  className="btn"
                  onClick={handleSendText}
                  disabled={!draft.trim() || sending}
                  style={{ width: 'auto', padding: '0.6rem 1rem' }}
                >
                  {sending ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
