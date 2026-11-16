import { defineConfig } from 'tsup';

// ESM only: a single copy of every class, so `instanceof` checks on errors
// always work. CommonJS consumers on Node >= 22.12 can still `require()` it.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
});
