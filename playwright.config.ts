import { defineConfig, devices } from '@playwright/test';

// E2E / funcionales: NO corren en cada PR. Solo en tag/release.
// Reporte Allure se publica a GitHub Pages desde release.yml.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['line'], ['allure-playwright']],
  // `next dev` compila cada ruta en el primer request (puede tardar >5s en frío);
  // damos margen a las aserciones para no fallar por compilación, no por la app.
  expect: { timeout: 15_000 },
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
    // E2E hermético: fuerza adapters en memoria sin importar el `.env.local` del
    // dev (que puede tener credenciales reales de prueba). Vacío = grupo ausente
    // (pickGroup) → memoria. Así el flujo de pago usa el checkout simulado y no MP
    // real. NEXT_PUBLIC_PAYMENT_ENABLED activa el botón de pago (se inlinea al
    // arrancar). Estas vars en process.env tienen prioridad sobre `.env.local`.
    env: {
      NEXT_PUBLIC_PAYMENT_ENABLED: 'true',
      MP_ACCESS_TOKEN: '',
      MP_WEBHOOK_SECRET: '',
      MP_NOTIFICATION_URL: '',
      MP_RETURN_URL: '',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_KEY: '',
      RESEND_API_KEY: '',
      RESEND_FROM: '',
      SHEETS_WEBHOOK_URL: '',
      SHEETS_WEBHOOK_SECRET: '',
    },
  },
});
