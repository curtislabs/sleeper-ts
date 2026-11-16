import { afterEach, vi } from 'vitest';

// A test that fails before restoring real timers must not leak fake ones.
afterEach(() => {
  vi.useRealTimers();
});
