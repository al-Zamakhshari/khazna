import React, { useState, useEffect } from 'react';
import { encryptMessage, encryptFile, type PQCKeyPair } from '../utils/crypto';
import { Lock, Copy, CheckCircle2, XCircle, FileIcon, FileUp, User } from 'lucide-react';

interface EncryptTabProps {
  keys: PQCKeyPair | null;
  prefilledKey?: string;
}

export const EncryptTab: React.FC<EncryptTabProps> = ({ keys, prefilledKey }) => {
  const [publicKey, setPublicKey] = useState(prefilledKey || '');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [bundle, setBundle] = useState('');
  const [encryptedFile, setEncryptedFile] = useState<Uint8Array | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (prefilledKey) setPublicKey(prefilledKey);
  }, [prefilledKey]);

  const isValidPublicKey = publicKey.trim().length > 1500;

  const handleEncrypt = async () => {
    try {
      setError('');
      setIsProcessing(true);
      if (!publicKey.trim()) throw new Error('Recipient Khazna Address is required');

      if (file) {
        const result = await encryptFile(file, publicKey.trim());
        setEncryptedFile(result);
        setBundle('');
      } else if (message) {
        const encrypted = encryptMessage(message, publicKey.trim());
        setBundle(encrypted);
        setEncryptedFile(null);
      } else {
        throw new Error('Provide either a message or a file to encrypt');
      }
    } catch (err: any) {
      setError(err.message || 'Encryption failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const useMyIdentity = () => {
    if (keys) {
      setPublicKey(keys.publicKey);
    }
  };

  const downloadEncryptedFile = () => {
    if (!encryptedFile || !file) return;
    const blob = new Blob([encryptedFile as any], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name}.khazna`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className={`form-group drop-zone ${isDragging ? 'active' : ''}`}
           onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
           onDragLeave={() => setIsDragging(false)}
           onDrop={(e) => {
             e.preventDefault();
             setIsDragging(false);
             const droppedFile = e.dataTransfer.files[0];
             if (droppedFile) {
               if (droppedFile.name.endsWith('.txt')) {
                 const reader = new FileReader();
                 reader.onload = (ev) => setPublicKey(ev.target?.result as string);
                 reader.readAsText(droppedFile);
               } else {
                 setFile(droppedFile);
               }
             }
           }}>
        <label>
          Recipient's Khazna Address
          <div style={{ display: 'flex', gap: '8px' }}>
            {keys && (
              <button className="copy-btn" onClick={useMyIdentity}>
                <User size={12} /> Use My Identity
              </button>
            )}
            {publicKey && (
              <span className={`validation-badge ${isValidPublicKey ? 'badge-valid' : 'badge-invalid'}`}>
                {isValidPublicKey ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {isValidPublicKey ? 'Valid' : 'Too Short'}
              </span>
            )}
          </div>
        </label>
        <textarea
          placeholder="Paste address or drag key file here..."
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
          style={{ height: '80px' }}
        />
      </div>

      <div className="form-group">
        <label>Option A: Text Message</label>
        <textarea
          placeholder="Type your secret message..."
          value={message}
          onChange={(e) => { setMessage(e.target.value); if (e.target.value) setFile(null); }}
          disabled={!!file}
        />
      </div>

      <div className="form-group">
        <label>Option B: File Encryption</label>
        <div 
          className="drop-zone" 
          style={{ padding: '2rem', textAlign: 'center', cursor: 'pointer' }}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input 
            id="file-input"
            type="file" 
            style={{ display: 'none' }} 
            onChange={(e) => { 
              const f = e.target.files?.[0]; 
              if (f) { setFile(f); setMessage(''); } 
            }} 
          />
          {file ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <FileIcon size={24} color="var(--primary)" />
              <strong>{file.name}</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>
              <FileUp size={24} style={{ marginBottom: '8px' }} />
              <p>Click or drag a file here to encrypt</p>
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error"><XCircle size={20} />{error}</div>}

      <button className="btn" onClick={handleEncrypt} disabled={!isValidPublicKey || (!message && !file) || isProcessing}>
        <Lock size={18} style={{ marginRight: '8px' }} />
        {isProcessing ? 'Processing...' : 'Lock Everything'}
      </button>

      {bundle && (
        <div className="result-area">
          <div className="result-header">
            <label>Encrypted Message Bundle</label>
            <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(bundle); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
              <Copy size={14} /> {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="key-display">{bundle}</div>
        </div>
      )}

      {encryptedFile && (
        <div className="result-area alert-success">
          <div className="result-header">
            <label style={{ color: 'inherit' }}>File Encrypted Successfully</label>
            <button className="btn" onClick={downloadEncryptedFile} style={{ width: 'auto', padding: '0.5rem 1rem' }}>
              Download .khazna File
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
