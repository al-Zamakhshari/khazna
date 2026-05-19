// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EncryptTab } from '../src/components/EncryptTab';
import { DecryptTab } from '../src/components/DecryptTab';
import { VaultTab } from '../src/components/VaultTab';
import { useVault } from '../src/hooks/useVault';
import { generateKeyPair } from '../src/utils/crypto';
import React from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Renders VaultTab wired to a real useVault instance. */
function VaultWrapper({
  onIdentitySelect = vi.fn(),
  onContactSelect  = vi.fn(),
}: {
  onIdentitySelect?: (id: { name: string; keys: ReturnType<typeof generateKeyPair> }) => void;
  onContactSelect?: (pk: string) => void;
}) {
  const manager = useVault();
  return (
    <VaultTab
      manager={manager}
      activeIdentity={null}
      onIdentitySelect={onIdentitySelect}
      onContactSelect={onContactSelect}
    />
  );
}

const user = userEvent.setup();

// ── Vault UI ──────────────────────────────────────────────────────────────────

describe('VaultTab', () => {
  it('shows the new-vault setup form on first load', () => {
    render(<VaultWrapper />);
    expect(screen.getByPlaceholderText('Master Password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByText('Create Vault')).toBeInTheDocument();
  });

  it('Create Vault button is disabled until passwords match', async () => {
    render(<VaultWrapper />);
    const btn = screen.getByText('Create Vault');
    expect(btn).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Master Password'), 'abc');
    await user.type(screen.getByPlaceholderText('Confirm Password'), 'xyz');
    expect(btn).toBeDisabled();

    await user.clear(screen.getByPlaceholderText('Confirm Password'));
    await user.type(screen.getByPlaceholderText('Confirm Password'), 'abc');
    expect(btn).toBeEnabled();
  });

  it('initializes vault and shows identity tab', async () => {
    render(<VaultWrapper />);
    await user.type(screen.getByPlaceholderText('Master Password'), 'pass-1234');
    await user.type(screen.getByPlaceholderText('Confirm Password'), 'pass-1234');
    await user.click(screen.getByText('Create Vault'));

    await waitFor(() =>
      expect(screen.getByText('Add New Identity')).toBeInTheDocument()
    );
    expect(screen.getByText('Get started in 3 steps')).toBeInTheDocument();
  });

  it('shows locked state when vault exists in localStorage', async () => {
    // Initialize first
    const { unmount } = render(<VaultWrapper />);
    await user.type(screen.getByPlaceholderText('Master Password'), 'my-pass');
    await user.type(screen.getByPlaceholderText('Confirm Password'), 'my-pass');
    await user.click(screen.getByText('Create Vault'));
    await waitFor(() => screen.getByText('Add New Identity'));
    unmount();

    // Reload (localStorage persists, state resets)
    render(<VaultWrapper />);
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Master Password')).toBeInTheDocument()
    );
    expect(screen.getByText('Unlock Vault')).toBeInTheDocument();
  });

  it('shows error on wrong unlock password', async () => {
    // Init vault
    const { unmount } = render(<VaultWrapper />);
    await user.type(screen.getByPlaceholderText('Master Password'), 'correct-pass');
    await user.type(screen.getByPlaceholderText('Confirm Password'), 'correct-pass');
    await user.click(screen.getByText('Create Vault'));
    await waitFor(() => screen.getByText('Add New Identity'));
    unmount();

    // Try wrong password
    render(<VaultWrapper />);
    await waitFor(() => screen.getByText('Unlock Vault'));
    await user.type(screen.getByPlaceholderText('Master Password'), 'wrong-pass');
    await user.click(screen.getByText('Unlock Vault'));

    await waitFor(() =>
      expect(screen.getByText('Invalid password.')).toBeInTheDocument()
    );
  });

  it('creates an identity and shows the post-creation callout', async () => {
    render(<VaultWrapper />);
    await user.type(screen.getByPlaceholderText('Master Password'), 'pass-123');
    await user.type(screen.getByPlaceholderText('Confirm Password'), 'pass-123');
    await user.click(screen.getByText('Create Vault'));

    await waitFor(() => screen.getByText('Add New Identity'));
    await user.click(screen.getByText('Add New Identity'));
    await user.type(screen.getByPlaceholderText('e.g. Work, Personal'), 'Alice');
    await user.click(screen.getByRole('button', { name: '' })); // ✓ button

    await waitFor(() =>
      expect(screen.getByText('Alice')).toBeInTheDocument()
    );
    expect(screen.getByText(/copy your/i)).toBeInTheDocument();
  });
});

// ── EncryptTab UI ─────────────────────────────────────────────────────────────

describe('EncryptTab', () => {
  it('renders without an active identity', () => {
    render(<EncryptTab keys={null} />);
    expect(screen.getByText("Recipient's Public Address")).toBeInTheDocument();
    expect(screen.queryByText('Encrypt to Myself')).not.toBeInTheDocument();
  });

  it('shows "Encrypt to Myself" when an identity is active', () => {
    render(<EncryptTab keys={generateKeyPair()} />);
    expect(screen.getByText('Encrypt to Myself')).toBeInTheDocument();
  });

  it('"Encrypt to Myself" fills in the recipient key', async () => {
    const kp = generateKeyPair();
    render(<EncryptTab keys={kp} />);
    await user.click(screen.getByText('Encrypt to Myself'));
    const textarea = screen.getByPlaceholderText(/Public Address/i);
    expect((textarea as HTMLTextAreaElement).value).toBe(kp.publicKey);
  });

  it('Encrypt button is disabled until key is valid and message exists', async () => {
    const kp = generateKeyPair();
    render(<EncryptTab keys={kp} />);

    const btn = screen.getByText('Encrypt');
    expect(btn).toBeDisabled();

    // Fill valid key only — still disabled (no message)
    await user.click(screen.getByText('Encrypt to Myself'));
    expect(btn).toBeDisabled();

    // Add message — now enabled
    await user.type(screen.getByPlaceholderText(/secret message/i), 'hi');
    expect(btn).toBeEnabled();
  });

  it('switches between Text and File modes', async () => {
    render(<EncryptTab keys={null} />);
    expect(screen.getByPlaceholderText(/secret message/i)).toBeInTheDocument();

    await user.click(screen.getByText('File'));
    expect(screen.queryByPlaceholderText(/secret message/i)).not.toBeInTheDocument();
    expect(screen.getByText(/click or drag a file/i)).toBeInTheDocument();
  });

  it('encrypts a message and shows the success panel', async () => {
    const kp = generateKeyPair();
    render(<EncryptTab keys={kp} />);

    await user.click(screen.getByText('Encrypt to Myself'));
    await user.type(screen.getByPlaceholderText(/secret message/i), 'test message');
    await user.click(screen.getByText('Encrypt'));

    await waitFor(() =>
      expect(screen.getByText('Encrypted successfully')).toBeInTheDocument()
    , { timeout: 5000 });
    expect(screen.getByText('Copy Encrypted Bundle')).toBeInTheDocument();
  });
});

// ── DecryptTab UI ─────────────────────────────────────────────────────────────

describe('DecryptTab', () => {
  it('shows vault hint when no identity is active', () => {
    render(<DecryptTab keys={null} onGoToVault={vi.fn()} />);
    expect(screen.getByText(/Vault tab/i)).toBeInTheDocument();
    expect(screen.queryByText('Use Stored Key')).not.toBeInTheDocument();
  });

  it('shows "Use Stored Key" when an identity is active', () => {
    render(<DecryptTab keys={generateKeyPair()} onGoToVault={vi.fn()} />);
    expect(screen.getByText('Use Stored Key')).toBeInTheDocument();
  });

  it('"Use Stored Key" fills in the private key', async () => {
    const kp = generateKeyPair();
    render(<DecryptTab keys={kp} onGoToVault={vi.fn()} />);
    await user.click(screen.getByText('Use Stored Key'));
    const textarea = screen.getByPlaceholderText(/Private Key/i);
    expect((textarea as HTMLTextAreaElement).value).toBe(kp.privateKey);
  });

  it('Decrypt button is disabled until key and bundle are present', async () => {
    const kp = generateKeyPair();
    render(<DecryptTab keys={kp} onGoToVault={vi.fn()} />);
    const btn = screen.getByText('Decrypt');

    // No key, no bundle
    expect(btn).toBeDisabled();

    // Add key only — still disabled
    await user.click(screen.getByText('Use Stored Key'));
    expect(btn).toBeDisabled();
  });

  it('shows error when decrypting with the wrong key', async () => {
    const kp     = generateKeyPair();
    const wrong  = generateKeyPair();
    const bundle = (await import('../src/utils/crypto'))
      .encryptMessage('secret', kp.publicKey);

    render(<DecryptTab keys={wrong} onGoToVault={vi.fn()} />);
    await user.click(screen.getByText('Use Stored Key'));
    await user.type(screen.getByPlaceholderText(/bundle/i), bundle);
    await user.click(screen.getByText('Decrypt'));

    await waitFor(() =>
      expect(screen.getByText(/decryption failed|failed|invalid/i)).toBeInTheDocument()
    );
  });
});

// ── Full encrypt → decrypt cycle ──────────────────────────────────────────────

describe('end-to-end: encrypt then decrypt', () => {
  it('decrypted plaintext matches original message', async () => {
    const kp      = generateKeyPair();
    const message = 'quantum-safe secret 🔐';

    // 1. Encrypt
    const { unmount: unmountEnc } = render(<EncryptTab keys={kp} />);
    await user.click(screen.getByText('Encrypt to Myself'));
    await user.type(screen.getByPlaceholderText(/secret message/i), message);
    await user.click(screen.getByText('Encrypt'));
    await waitFor(() => screen.getByText('Encrypted successfully'), { timeout: 5000 });

    const bundle = document.querySelector('.key-display')?.textContent ?? '';
    expect(bundle.length).toBeGreaterThan(100);
    unmountEnc();

    // 2. Decrypt
    render(<DecryptTab keys={kp} onGoToVault={vi.fn()} />);
    await user.click(screen.getByText('Use Stored Key'));
    await user.type(screen.getByPlaceholderText(/bundle/i), bundle);
    await user.click(screen.getByText('Decrypt'));

    await waitFor(() =>
      expect(screen.getByText(message)).toBeInTheDocument()
    , { timeout: 5000 });
  });

  it('auto-lock timer appears after successful decrypt', async () => {
    const kp     = generateKeyPair();
    const { encryptMessage } = await import('../src/utils/crypto');
    const bundle = encryptMessage('hi', kp.publicKey);

    render(<DecryptTab keys={kp} onGoToVault={vi.fn()} />);
    await user.click(screen.getByText('Use Stored Key'));
    await user.type(screen.getByPlaceholderText(/bundle/i), bundle);
    await user.click(screen.getByText('Decrypt'));

    await waitFor(() =>
      expect(screen.getByText(/Clears in/i)).toBeInTheDocument()
    , { timeout: 5000 });
  });

  it('onGoToVault is called when the vault link is clicked', async () => {
    const onGoToVault = vi.fn();
    render(<DecryptTab keys={null} onGoToVault={onGoToVault} />);
    await user.click(screen.getByText('Vault tab'));
    expect(onGoToVault).toHaveBeenCalledOnce();
  });
});
