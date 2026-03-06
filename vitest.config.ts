import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '#agent': resolve(__dirname, 'mcp-client/src/agent'),
      '#observability': resolve(__dirname, 'mcp-client/src/observability'),
      '#reporter': resolve(__dirname, 'mcp-client/src/reporter'),
      '#service': resolve(__dirname, 'mcp-client/src/service'),
    },
  },
  test: {
    globals: true,
    root: '.',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['mcp-server/src/**', 'mcp-client/src/**', 'shared/**', 'api/**'],
    },
  },
});
