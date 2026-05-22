import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    setupFiles: ['./test/setup.ts'],
    globals: true,
    testTimeout: 30000,
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      include: ['src/utils/crypto.ts', 'src/utils/nostr.ts'],
      thresholds: {
        lines:     75,
        functions: 75,
        branches:  60, // network-only functions (fetchProfile, lookupContact, publishEvent, subscribeToGiftWraps)
                       // cannot hit branch targets without live relay connections
      },
    },
  },
});
