import { defineConfig, devices } from '@playwright/test';

// E2E contra MP sandbox REAL — el round-trip de verdad: checkout real + webhook
// que vuelve por un túnel público. Opt-in (`npm run test:e2e:sandbox`), separado
// del config hermético por defecto (`playwright.config.ts`) para que el E2E
// normal nunca toque MP real ni este directorio.
//
// Requiere en el entorno: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET y TUNNEL_URL (ngrok
// https a localhost:3000). MP notifica al túnel y redirige al retorno por él.
const tunnel = process.env.TUNNEL_URL ?? '';

export default defineConfig({
  testDir: './tests/e2e-sandbox',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // MP sandbox (checkout real) es inherentemente flaky; reintentos absorben la
  // variabilidad de su UI. Es opt-in/manual, así que reintentar no molesta a CI.
  retries: 2,
  reporter: [['line']],
  // El checkout de MP carga recursos externos; damos margen amplio.
  expect: { timeout: 30_000 },
  timeout: 180_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // A diferencia del config hermético, acá SÍ pasamos credenciales MP reales
  // desde process.env para que el factory monte el adapter de MercadoPago.
  // notification/return apuntan al túnel para que MP pueda alcanzarnos.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_PAYMENT_ENABLED: 'true',
      MP_SANDBOX_E2E: '1',
      MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN ?? '',
      MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET ?? '',
      MP_NOTIFICATION_URL: `${tunnel}/api/payments/webhook`,
      MP_RETURN_URL: `${tunnel}/pago/retorno`,
      APP_URL: tunnel,
    },
  },
});
