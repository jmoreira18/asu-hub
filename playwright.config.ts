import { defineConfig, devices } from '@playwright/test';

// E2E / funcionales: NO corren en cada PR. Solo en tag/release.
// Reporte Allure se publica a GitHub Pages desde release.yml.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['line'], ['allure-playwright']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // E2E corre contra `next dev` a propósito: en desarrollo el factory permite
  // adapters en memoria/consola (allowDev), así los casos funcionales/negativos
  // (que prueban validación de servidor, no servicios reales) corren sin
  // credenciales. Producción (`next start`) devolvería 500 al no estar
  // configurados los adapters (factory `pickGroup`, allowDev=false). El
  // `next build` se verifica aparte en pr.yml.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
