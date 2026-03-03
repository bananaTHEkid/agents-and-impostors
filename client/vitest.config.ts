import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import * as path from 'path';

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/utils/setup.tsx'],
    include: ['**/__tests__/unit/**/*.test.{ts,tsx}'],
    exclude: ['**/__tests__/e2e/**', '**/*.spec.ts', '**/node_modules/**', '**/dist/**'],
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});