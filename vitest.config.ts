import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '#agent': resolve(__dirname, 'engine/src/agent'),
      '#observability': resolve(__dirname, 'engine/src/observability'),
      '#reporter': resolve(__dirname, 'engine/src/reporter'),
      '#service': resolve(__dirname, 'engine/src/service'),
      '#sourcemap': resolve(__dirname, 'engine/src/sourcemap'),
    },
  },
  test: {
    globals: true,
    root: '.',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['engine/src/**', 'shared/**', 'api/**'],
    },
  },
});
