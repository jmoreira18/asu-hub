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
      // Gate de 100% sobre la lógica testeable en unit/integration: dominio
      // portable (core) + adapters + rutas API. La UI (.tsx) queda fuera: vitest
      // no la mide sin setup JSX y ya la cubre el E2E (Playwright).
      include: ['src/core/**/*.ts', 'src/adapters/**/*.ts', 'src/app/api/**/*.ts'],
      exclude: [
        'src/**/*.{test,spec}.ts',
        'src/**/index.ts',
        // Puertos = interfaces puras (sin runtime); nada que cubrir.
        'src/core/ports/**',
        // dev-checkout: tooling SOLO de dev (en prod devuelve 404). Lo ejercita
        // el E2E hermético sobre el adapter en memoria, no el unit/integration.
        'src/app/api/payments/dev-checkout/**',
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
