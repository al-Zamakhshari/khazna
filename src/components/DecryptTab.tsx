import React, { useState, useEffect } from 'react';
import { decryptMessage, decryptFile, type PQCKeyPair } from '../utils/crypto';
import { Unlock, AlertCircle, Trash2, CheckCircle2, XCircle, FileIcon, FileUp, Timer, Key } from 'lucide-react';
import confetti from 'canvas-confetti';

interface DecryptTabProps {
  keys: PQCKeyPair | null;
}

export const DecryptTab: React.FC<DecryptTabProps> = ({ keys }) => {
  const [privateKey, setPrivateKey] = useState('');
  const [bundle, setBundle] = useState('');
  const [fileBundle, setFileBundle] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState('');
  const [decryptedFile, setDecryptedFile] = useState<Uint8Array | null>(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [autoLockSeconds, setAutoLockSeconds] = useState(0);

  const isValidPrivateKey = privateKey.trim().length > 3000;

  useEffect(() => {
    let timer: any;
    if (autoLockSeconds > 0) {
      timer = setInterval(() => {
        setAutoLockSeconds(prev => {
          if (prev <= 1) {
            setMessage('');
            setDecryptedFile(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [autoLockSeconds]);

  const handleDecrypt = async () => {
    try {
      setError('');
      setMessage('');
      setDecryptedFile(null);
      if (!privateKey.trim()) throw new Error('Master Key is required');

      if (fileBundle) {
        const decrypted = decryptFile(fileBundle, privateKey.trim());
        setDecryptedFile(decrypted);
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        setAutoLockSeconds(60); 
      } else if (bundle) {
        const decrypted = decryptMessage(bundle.trim(), privateKey.trim());
        setMessage(decrypted);
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        setAutoLockSeconds(300);
      } else {
        throw new Error('Provide either a message bundle or a .khazna file');
      }
    } catch (err: any) {
      setError(err.message || 'Decryption failed.');
    }
  };

  const useStoredKey = () => {
    if (keys) {
      setPrivateKey(keys.privateKey);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      if (file.name.endsWith('.khazna')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setFileBundle(new Uint8Array(ev.target?.result as ArrayBuffer));
          setFileName(file.name.replace('.khazna', ''));
          setBundle('');
        };
        reader.readAsArrayBuffer(file);
      } else if (file.name.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = (ev) => setPrivateKey(ev.target?.result as string);
        reader.readAsText(file);
      }
    }
  };

  const downloadFile = () => {
    if (!decryptedFile) return;
    const blob = new Blob([decryptedFile as any]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="alert alert-info">
        <Unlock size={20} />
        <span>Use your Master Key to unlock messages or .khazna files.</span>
      </div>

      <div className="form-group">
        <label>Option A: Paste Bundle</label>
        <textarea
          placeholder="Paste message bundle here..."
          value={bundle}
          onChange={(e) => { setBundle(e.target.value); if (e.target.value) setFileBundle(null); }}
          style={{ height: '80px' }}
          disabled={!!fileBundle}
        />
      </div>

      <div className="form-group">
        <label>Option B: Drop .khazna File</label>
        <div 
          className={`drop-zone ${isDragging ? 'active' : ''}`}
          style={{ padding: '2rem', textAlign: 'center' }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          {fileBundle ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <FileIcon size={24} color="var(--primary)" />
              <strong>{fileName}.khazna</strong>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>
              <FileUp size={24} style={{ marginBottom: '8px' }} />
              <p>Drop .khazna file here</p>
            </div>
          )}
        </div>
      </div>

      <div className={`form-group drop-zone ${isDragging ? 'active' : ''}`}
           onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
           onDragLeave={() => setIsDragging(false)}
           onDrop={onDrop}>
        <label>
          Your Master Key
          <div style={{ display: 'flex', gap: '8px' }}>
            {keys && (
              <button className="copy-btn" onClick={useStoredKey}>
                <Key size={12} /> Use Stored Master Key
              </button>
            )}
            {privateKey && (
              <span className={`validation-badge ${isValidPrivateKey ? 'badge-valid' : 'badge-invalid'}`}>
                {isValidPrivateKey ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {isValidPrivateKey ? 'Valid' : 'Invalid'}
              </span>
            )}
          </div>
        </label>
        <textarea
          placeholder="Paste or drop your pqc-private-key.txt here..."
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          style={{ height: '100px' }}
        />
      </div>

      {error && <div className="alert alert-error"><AlertCircle size={20} />{error}</div>}

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button className="btn" onClick={handleDecrypt} style={{ flex: 1 }} disabled={!isValidPrivateKey || (!bundle && !fileBundle)}>
          <Unlock size={18} style={{ marginRight: '8px' }} /> Unlock Content
        </button>
        <button className="btn" onClick={() => { setMessage(''); setBundle(''); setFileBundle(null); setDecryptedFile(null); }} style={{ background: 'var(--text-muted)', width: 'auto' }}>
          <Trash2 size={18} />
        </button>
      </div>

      {(message || decryptedFile) && (
        <div className="result-area" style={{ border: '2px solid var(--success)', background: 'rgba(16, 185, 129, 0.05)', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--success)' }}>
            <Timer size={14} /> Auto-locking in {autoLockSeconds}s
          </div>
          
          {message && (
            <>
              <label style={{ color: 'var(--success)', marginBottom: '0.75rem' }}>Decrypted Message</label>
              <div style={{ fontSize: '1.25rem', whiteSpace: 'pre-wrap' }}>{message}</div>
            </>
          )}
          
          {decryptedFile && (
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <p style={{ color: 'var(--success)', fontWeight: 600, marginBottom: '1rem' }}>File unlocked successfully!</p>
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
