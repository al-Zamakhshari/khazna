import React from 'react';
import { Shield, AlertTriangle, FileLock, Download, RefreshCw } from 'lucide-react';

export const GuideTab: React.FC = () => {
  return (
    <div className="space-y-8" style={{ lineHeight: 1.6 }}>
      <section>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.25rem', marginBottom: '1rem' }}>
          <Shield color="var(--primary)" size={22} /> What is Khazna?
        </h2>
        <p style={{ margin: 0 }}>
          Khazna is a <strong>Post-Quantum Encryption</strong> vault. Traditional encryption (like the kind
          used in banking today) can theoretically be broken by future quantum computers. Khazna uses a
          hybrid of <strong>ML-KEM-768</strong> and <strong>X25519</strong>, combining post-quantum and
          classical security so your data stays safe even if one algorithm is ever compromised.
        </p>
      </section>

      <section className="card" style={{ background: 'var(--bg)', padding: '1.5rem', borderStyle: 'solid' }}>
        <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Quick Start Guide</h3>
        <ol style={{ paddingLeft: '1.25rem', margin: 0 }}>
          <li style={{ marginBottom: '1rem' }}>
            <strong>Initialize your Vault:</strong> Set a <strong>Master Password</strong> when you first
            open Khazna. This password encrypts all your keys and contacts locally in your browser.
          </li>
          <li style={{ marginBottom: '1rem' }}>
            <strong>Create an Identity:</strong> In the <strong>Vault</strong> tab, click "Add New Identity."
            This generates your <strong>Public Address</strong> (share freely) and <strong>Private Key</strong> (keep secret).
          </li>
          <li style={{ marginBottom: '1rem' }}>
            <strong>Share your Public Address:</strong> Use the Copy or QR button on your identity.
            Anyone who has your Public Address can encrypt messages or files for you.
          </li>
          <li style={{ margin: 0 }}>
            <strong>Decrypt messages:</strong> Select your identity in the Vault tab (so your Private Key
            is available), then go to the <strong>Decrypt</strong> tab to unlock anything sent to you.
          </li>
        </ol>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="result-area" style={{ marginTop: 0 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 8px', fontSize: '0.875rem' }}>
            <FileLock size={15} /> File Encryption
          </h4>
          <p style={{ fontSize: '0.8rem', margin: 0 }}>
            Encrypt any file into a <code>.khazna</code> bundle. Only the intended recipient's
            Private Key can open it.
          </p>
        </div>
        <div className="result-area" style={{ marginTop: 0, borderColor: 'var(--success)' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 8px', fontSize: '0.875rem', color: 'var(--success)' }}>
            <Download size={15} /> Backup & Restore
          </h4>
          <p style={{ fontSize: '0.8rem', margin: 0 }}>
            Export your encrypted vault as a JSON file. Restore it on any device — your
            Master Password is still required to unlock it.
          </p>
        </div>
      </div>

      <section>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
          <RefreshCw size={16} /> Privacy & Safety
        </h3>
        <p style={{ fontSize: '0.875rem', margin: 0 }}>
          <strong>Zero-Knowledge:</strong> All encryption happens 100% in your browser.
          No keys or data are ever sent to any server.
          <br /><br />
          <AlertTriangle size={13} style={{ color: '#f59e0b', verticalAlign: 'middle', marginRight: '4px' }} />
          <strong>Important:</strong> If you lose your Master Password or your Private Key, your encrypted
          data <strong>cannot be recovered</strong>. Back up your vault regularly.
        </p>
      </section>
    </div>
  );
};
