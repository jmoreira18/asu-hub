import { defineConfig } from 'vitest/config';
import path from 'node:path';

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
    // Solo unit + integration corren en cada PR (Allure se reserva para E2E).
    include: ['src/**/*.{test,spec}.ts', 'tests/integration/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Gate de 100% SOLO sobre el dominio/lógica de negocio portable.
      include: ['src/core/**/*.ts'],
      exclude: [
        'src/core/**/*.{test,spec}.ts',
        'src/core/**/index.ts',
        // Puertos = interfaces puras (sin runtime); nada que cubrir.
        'src/core/ports/**',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
