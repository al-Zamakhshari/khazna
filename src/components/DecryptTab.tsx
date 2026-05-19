import React, { useState, useEffect } from 'react';
import { decryptMessage, decryptFile, type PQCKeyPair, MIN_PRIVATE_KEY_LEN } from '../utils/crypto';
import {
  Unlock, AlertCircle, Trash2, CheckCircle2, XCircle, FileIcon, FileUp,
  Timer, Key, MessageSquare, Info,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface DecryptTabProps {
  keys: PQCKeyPair | null;
  onGoToVault: () => void;
}

export const DecryptTab: React.FC<DecryptTabProps> = ({ keys, onGoToVault }) => {
  const [privateKey, setPrivateKey] = useState('');
  const [mode, setMode] = useState<'bundle' | 'file'>('bundle');
  const [bundle, setBundle] = useState('');
  const [fileBundle, setFileBundle] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState('');
  const [decryptedFile, setDecryptedFile] = useState<Uint8Array | null>(null);
  const [error, setError] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isDraggingKey, setIsDraggingKey] = useState(false);
  const [autoLockSeconds, setAutoLockSeconds] = useState(0);

  const isValidKey = privateKey.trim().length >= MIN_PRIVATE_KEY_LEN;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (autoLockSeconds > 0) {
      timer = setInterval(() => {
        setAutoLockSeconds(prev => {
          if (prev <= 1) { setMessage(''); setDecryptedFile(null); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [autoLockSeconds]);

  const switchMode = (next: 'bundle' | 'file') => {
    setMode(next);
    setError('');
    setMessage('');
    setDecryptedFile(null);
    if (next === 'bundle') { setFileBundle(null); setFileName(''); }
    else setBundle('');
  };

  const handleDecrypt = async () => {
    try {
      setError('');
      setMessage('');
      setDecryptedFile(null);
      if (!privateKey.trim()) throw new Error('Private Key is required.');

      if (mode === 'file' && fileBundle) {
        setDecryptedFile(decryptFile(fileBundle, privateKey.trim()));
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        setAutoLockSeconds(60);
      } else if (mode === 'bundle' && bundle) {
        setMessage(decryptMessage(bundle.trim(), privateKey.trim()));
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        setAutoLockSeconds(300);
      } else {
        throw new Error(mode === 'bundle' ? 'Paste the encrypted bundle.' : 'Drop or select a .khazna file.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Decryption failed. Wrong key or corrupted data.');
    }
  };

  const loadKhaznaFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = ev => {
      setFileBundle(new Uint8Array(ev.target?.result as ArrayBuffer));
      setFileName(file.name.replace('.khazna', ''));
    };
    reader.readAsArrayBuffer(file);
  };

  const loadKeyFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = ev => setPrivateKey(ev.target?.result as string);
    reader.readAsText(file);
  };

  const onDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.name.endsWith('.khazna')) { loadKhaznaFile(file); switchMode('file'); }
    else if (file.name.endsWith('.txt')) loadKeyFile(file);
  };

  const onDropKey = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingKey(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.txt')) loadKeyFile(file);
  };

  const downloadFile = () => {
    if (!decryptedFile) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([decryptedFile as BlobPart]));
    a.download = fileName;
    a.click();
  };

  const clearAll = () => {
    setBundle(''); setFileBundle(null); setFileName('');
    setMessage(''); setDecryptedFile(null); setError('');
  };

  const canDecrypt = isValidKey && (mode === 'bundle' ? !!bundle : !!fileBundle);

  return (
    <div className="space-y-6">
      {/* Input mode toggle */}
      <div>
        <div className="segmented-toggle">
          <button
            className={`toggle-btn ${mode === 'bundle' ? 'active' : ''}`}
            onClick={() => switchMode('bundle')}
          >
            <MessageSquare size={14} /> Message Bundle
          </button>
          <button
            className={`toggle-btn ${mode === 'file' ? 'active' : ''}`}
            onClick={() => switchMode('file')}
          >
            <FileUp size={14} /> .khazna File
          </button>
        </div>

        {mode === 'bundle' ? (
          <textarea
            placeholder="Paste the encrypted bundle here…"
            value={bundle}
            onChange={e => setBundle(e.target.value)}
            style={{ height: '100px' }}
          />
        ) : (
          <div
            className={`drop-zone ${isDraggingFile ? 'active' : ''}`}
            style={{ padding: '2.5rem', textAlign: 'center', cursor: 'pointer' }}
            onDragOver={e => { e.preventDefault(); setIsDraggingFile(true); }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={onDropFile}
            onClick={() => document.getElementById('decrypt-file-input')?.click()}
          >
            <input
              id="decrypt-file-input"
              type="file"
              accept=".khazna"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) loadKhaznaFile(f); }}
            />
            {fileBundle ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <FileIcon size={22} color="var(--primary)" />
                <strong>{fileName}.khazna</strong>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>
                <FileUp size={22} style={{ marginBottom: '8px' }} />
                <p style={{ margin: 0 }}>Drop or click to select a .khazna file</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Private key */}
      <div
        className={`form-group drop-zone ${isDraggingKey ? 'active' : ''}`}
        onDragOver={e => { e.preventDefault(); setIsDraggingKey(true); }}
        onDragLeave={() => setIsDraggingKey(false)}
        onDrop={onDropKey}
      >
        <label>
          Your Private Key
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {keys ? (
              <button className="copy-btn" onClick={() => setPrivateKey(keys.privateKey)}>
                <Key size={12} /> Use Stored Key
              </button>
            ) : (
              <button
                className="copy-btn"
                onClick={onGoToVault}
                style={{ fontSize: '0.7rem' }}
              >
                Select identity in Vault →
              </button>
            )}
            {privateKey && (
              <span className={`validation-badge ${isValidKey ? 'badge-valid' : 'badge-invalid'}`}>
                {isValidKey ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {isValidKey ? 'Valid' : 'Invalid'}
              </span>
            )}
          </div>
        </label>
        <textarea
          placeholder="Paste your Private Key or drop a private-key.txt here…"
          value={privateKey}
          onChange={e => setPrivateKey(e.target.value)}
          style={{ height: '90px' }}
        />
        {!keys && !privateKey && (
          <div className="hint" style={{ marginTop: '0.5rem' }}>
            <Info size={13} />
            <span>
              Go to the <button onClick={onGoToVault} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, padding: 0, fontSize: 'inherit' }}>Vault tab</button> and select an identity to auto-fill your key.
            </span>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error"><AlertCircle size={18} />{error}</div>}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button className="btn" onClick={handleDecrypt} style={{ flex: 1 }} disabled={!canDecrypt}>
          <Unlock size={17} style={{ marginRight: '8px' }} /> Decrypt
        </button>
        <button
          className="btn"
          onClick={clearAll}
          style={{ background: 'var(--text-muted)', width: 'auto', padding: '0 1.25rem' }}
          title="Clear all"
        >
          <Trash2 size={17} />
        </button>
      </div>

      {/* Result */}
      {(message || decryptedFile) && (
        <div
          className="result-area"
          style={{ border: '2px solid var(--success)', background: 'rgba(16,185,129,0.04)', position: 'relative' }}
        >
          <div style={{
            position: 'absolute', top: '10px', right: '12px',
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '0.7rem', color: 'var(--success)',
          }}>
            <Timer size={12} /> Clears in {autoLockSeconds}s
          </div>

          {message && (
            <>
              <label style={{ color: 'var(--success)', marginBottom: '0.75rem' }}>Decrypted Message</label>
              <div style={{ fontSize: '1.1rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{message}</div>
            </>
          )}

          {decryptedFile && (
            <div style={{ textAlign: 'center', padding: '0.5rem' }}>
              <p style={{ color: 'var(--success)', fontWeight: 700, marginBottom: '1rem' }}>
                File decrypted successfully!
              </p>
              <button className="btn" onClick={downloadFile} style={{ width: 'auto' }}>
                Download Original File
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
