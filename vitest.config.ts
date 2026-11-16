import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Undo vi.stubGlobal and reset every mock after each test, so no test can
    // see another test's fetch stub or call history.
    unstubGlobals: true,
    restoreMocks: true,
    clearMocks: true,
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
