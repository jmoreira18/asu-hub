import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Config aparte para los tests de sandbox (red real, opt-in). Separado del
// `vitest.config.ts` hermético a propósito: el `npm test` de PR no debe tocar
// MP. Mismos alias. Corre vía `npm run test:mp` (y skipea sin credenciales).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@adapters': path.resolve(__dirname, './src/adapters'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/sandbox/**/*.{test,spec}.ts'],
  },
});
