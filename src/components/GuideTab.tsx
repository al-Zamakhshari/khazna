import React from 'react';
import { Shield, AlertTriangle, FileLock, Download, RefreshCw } from 'lucide-react';

export const GuideTab: React.FC = () => {
  return (
    <div className="space-y-8" style={{ lineHeight: 1.6 }}>
      <section>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.25rem', marginBottom: '1rem' }}>
          <Shield color="var(--primary)" size={24} /> What is Khazna?
        </h2>
        <p>
          Khazna is a <strong>Post-Quantum Encryption</strong> vault. Traditional encryption (like the kind used in banking today) can theoretically be broken by future quantum computers. Khazna uses <strong>ML-KEM-768</strong>, a new global standard designed to stay secure even in the age of quantum computing.
        </p>
      </section>

      <section className="card" style={{ background: 'var(--bg)', padding: '1.5rem', borderStyle: 'solid' }}>
        <h3 style={{ marginTop: 0, fontSize: '1rem' }}>🚀 Quick Start Guide</h3>
        <ol style={{ paddingLeft: '1.25rem' }}>
          <li style={{ marginBottom: '1rem' }}>
            <strong>Initialize your Vault:</strong> When you first open Khazna, set a <strong>Master Password</strong>. This password encrypts all your keys and contacts locally.
          </li>
          <li style={{ marginBottom: '1rem' }}>
            <strong>Create an Identity:</strong> In the <strong>Vault</strong> tab, click "Add New Identity." This generates your unique <strong>Khazna Address</strong> (Public) and <strong>Master Key</strong> (Private).
          </li>
          <li style={{ marginBottom: '1rem' }}>
            <strong>Share your Address:</strong> Click the <strong>QR</strong> or <strong>Copy</strong> icon on your identity. Send this address to people who want to send you secure messages or files.
          </li>
          <li>
            <strong>Encrypt & Decrypt:</strong> Use the <strong>Encrypt</strong> tab to lock data for others, and the <strong>Decrypt</strong> tab (with your Master Key) to unlock data sent to you.
          </li>
        </ol>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div className="result-area" style={{ marginTop: 0 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 10px 0', fontSize: '0.9rem' }}>
            <FileLock size={16} /> File Support
          </h4>
          <p style={{ fontSize: '0.8rem', margin: 0 }}>You can encrypt any small file (PDF, JPG, etc.) into a <code>.khazna</code> bundle that only the recipient can open.</p>
        </div>
        <div className="result-area" style={{ marginTop: 0, borderColor: 'var(--success)' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--success)' }}>
            <Download size={16} /> Backup & Portability
          </h4>
          <p style={{ fontSize: '0.8rem', margin: 0 }}>Use <strong>Vault Backup</strong> to export your encrypted data. You can restore it on any other device using your password.</p>
        </div>
      </div>

      <section>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
          <RefreshCw size={18} /> Safety & Privacy
        </h3>
        <p style={{ fontSize: '0.875rem' }}>
          <strong>Zero-Knowledge:</strong> All encryption happens 100% in your browser. No keys or data are ever sent to our servers.
          <br /><br />
          <AlertTriangle size={14} style={{ color: '#f59e0b', marginRight: '4px' }} />
          <strong>Important:</strong> If you lose your Master Password or your Master Key, your encrypted data <strong>cannot be recovered</strong>. Keep your backups safe!
        </p>
      </section>
    </div>
  );
};
