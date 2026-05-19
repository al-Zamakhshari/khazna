import React, { useState, useEffect } from 'react';
import { encryptMessage, encryptFile, type PQCKeyPair, MIN_PUBLIC_KEY_LEN } from '../utils/crypto';
import {
  Lock, Copy, Check, XCircle, FileIcon, FileUp, CheckCircle2, MessageSquare, Download,
} from 'lucide-react';

interface EncryptTabProps {
  keys: PQCKeyPair | null;
  prefilledKey?: string;
}

export const EncryptTab: React.FC<EncryptTabProps> = ({ keys, prefilledKey }) => {
  const [recipientKey, setRecipientKey] = useState(prefilledKey || '');
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [bundle, setBundle] = useState('');
  const [encryptedFile, setEncryptedFile] = useState<Uint8Array | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (prefilledKey) setRecipientKey(prefilledKey);
  }, [prefilledKey]);

  const isValidKey = recipientKey.trim().length >= MIN_PUBLIC_KEY_LEN;

  const switchMode = (next: 'text' | 'file') => {
    setMode(next);
    setBundle('');
    setEncryptedFile(null);
    setError('');
    if (next === 'text') setFile(null);
    else setMessage('');
  };

  const handleEncrypt = async () => {
    try {
      setError('');
      setIsProcessing(true);

      if (mode === 'file' && file) {
        setEncryptedFile(await encryptFile(file, recipientKey.trim()));
        setBundle('');
      } else if (mode === 'text' && message) {
        setBundle(encryptMessage(message, recipientKey.trim()));
        setEncryptedFile(null);
      } else {
        throw new Error(mode === 'text' ? 'Type a message to encrypt.' : 'Select a file to encrypt.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Encryption failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const copyBundle = () => {
    navigator.clipboard.writeText(bundle);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadEncryptedFile = () => {
    if (!encryptedFile || !file) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([encryptedFile as BlobPart], { type: 'application/octet-stream' }));
    a.download = `${file.name}.khazna`;
    a.click();
  };

  const canEncrypt = isValidKey && (mode === 'text' ? !!message : !!file) && !isProcessing;

  return (
    <div className="space-y-6">
      {/* Recipient key */}
      <div
        className={`form-group drop-zone ${isDragging ? 'active' : ''}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setIsDragging(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped?.name.endsWith('.txt')) {
            const reader = new FileReader();
            reader.onload = ev => setRecipientKey(ev.target?.result as string);
            reader.readAsText(dropped);
          }
        }}
      >
        <label>
          Recipient's Public Address
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {keys && (
              <button className="copy-btn" onClick={() => setRecipientKey(keys.publicKey)}>
                Encrypt to Myself
              </button>
            )}
            {recipientKey && (
              <span className={`validation-badge ${isValidKey ? 'badge-valid' : 'badge-invalid'}`}>
                {isValidKey ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {isValidKey ? 'Valid' : 'Too short'}
              </span>
            )}
          </div>
        </label>
        <textarea
          placeholder="Paste their Public Address or drag a .txt key file here…"
          value={recipientKey}
          onChange={e => setRecipientKey(e.target.value)}
          style={{ height: '72px' }}
        />
      </div>

      {/* Mode toggle */}
      <div>
        <div className="segmented-toggle">
          <button
            className={`toggle-btn ${mode === 'text' ? 'active' : ''}`}
            onClick={() => switchMode('text')}
          >
            <MessageSquare size={14} /> Text Message
          </button>
          <button
            className={`toggle-btn ${mode === 'file' ? 'active' : ''}`}
            onClick={() => switchMode('file')}
          >
            <FileUp size={14} /> File
          </button>
        </div>

        {mode === 'text' ? (
          <textarea
            placeholder="Type your secret message…"
            value={message}
            onChange={e => setMessage(e.target.value)}
            style={{ minHeight: '120px' }}
          />
        ) : (
          <div
            className="drop-zone"
            style={{ padding: '2rem', textAlign: 'center', cursor: 'pointer' }}
            onClick={() => document.getElementById('encrypt-file-input')?.click()}
          >
            <input
              id="encrypt-file-input"
              type="file"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }}
            />
            {file ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <FileIcon size={22} color="var(--primary)" />
                <strong>{file.name}</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>
                <FileUp size={22} style={{ marginBottom: '8px' }} />
                <p style={{ margin: 0 }}>Click or drag a file here to encrypt</p>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="alert alert-error"><XCircle size={18} />{error}</div>}

      <button className="btn" onClick={handleEncrypt} disabled={!canEncrypt}>
        <Lock size={17} style={{ marginRight: '8px' }} />
        {isProcessing ? 'Encrypting…' : 'Encrypt'}
      </button>

      {/* Text result */}
      {bundle && (
        <div className="success-panel">
          <div className="success-header">
            <CheckCircle2 size={18} /> Encrypted successfully
          </div>
          <div className="key-display">{bundle}</div>
          <button
            className="btn"
            style={{ marginTop: '1rem', background: 'var(--success)', width: 'auto', padding: '0.75rem 1.5rem' }}
            onClick={copyBundle}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span style={{ marginLeft: '8px' }}>{copied ? 'Copied!' : 'Copy Encrypted Bundle'}</span>
          </button>
        </div>
      )}

      {/* File result */}
      {encryptedFile && (
        <div className="success-panel">
          <div className="success-header">
            <CheckCircle2 size={18} /> File encrypted successfully
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
            Share the <code>.khazna</code> file with your recipient. Only their Private Key can open it.
          </p>
          <button
            className="btn"
            style={{ background: 'var(--success)', width: 'auto', padding: '0.75rem 1.5rem' }}
            onClick={downloadEncryptedFile}
          >
            <Download size={16} style={{ marginRight: '8px' }} /> Download .khazna File
          </button>
        </div>
      )}
    </div>
  );
};
