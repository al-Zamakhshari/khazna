import '@testing-library/jest-dom/vitest';
import { vi, afterEach } from 'vitest';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null }));

// Provide a working localStorage for all modules (vi.stubGlobal patches every scope)
let _store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem:    (k: string) => _store[k] ?? null,
  setItem:    (k: string, v: string) => { _store[k] = String(v); },
  removeItem: (k: string) => { delete _store[k]; },
  clear:      () => { _store = {}; },
  get length() { return Object.keys(_store).length; },
  key:        (i: number) => Object.keys(_store)[i] ?? null,
});

if (typeof window !== 'undefined') {
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = vi.fn();
  global.confirm = vi.fn(() => true);
  HTMLAnchorElement.prototype.click = vi.fn();
}

afterEach(() => {
  _store = {};
  vi.clearAllMocks();
});
