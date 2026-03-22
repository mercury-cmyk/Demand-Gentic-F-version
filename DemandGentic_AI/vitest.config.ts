import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: [
      'server/**/*.test.ts',
      'server/**/*.spec.ts',
      'client/src/**/*.test.ts',
      'client/src/**/*.spec.ts',
      'client/src/**/*.test.tsx',
      'client/src/**/*.spec.tsx',
    ],
    globals: false,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
});