import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';

// Round-trip REAL contra MP sandbox: registro -> Pagar ahora -> checkout REAL de
// MP -> pago con tarjeta de prueba (APRO=aprobado) -> webhook firmado con el
// payment_id REAL -> confirmPayment verifica el pago CONTRA LA API de MP y hace
// confirmed->paid -> el retorno lee el estado REAL de la DB y muestra
// "¡Pago confirmado!".
//
// Nota sobre la entrega del webhook: el push de MP en sandbox es poco fiable
// (a veces no llega, o tarda minutos, o MP frena tras fallos). Para que el test
// sea determinista, disparamos nosotros la notificación con el payment_id REAL
// del redirect, firmada con MP_WEBHOOK_SECRET igual que la manda MP. Lo único
// "simulado" es el transporte del POST; el pago es real y confirmPayment lo
// verifica contra la API real de MP. La firma/entrega real ya se cubre aparte
// (firma validada con payload real de MP; ver docs/mp-sandbox-testing.md).
//
// Frágil a propósito: el DOM del checkout de MP cambia y requiere tarjeta de
// prueba. Opt-in (gate TUNNEL_URL) y fuera del E2E hermético.
// Gate en TUNNEL_URL: el operador lo exporta en su shell (presente en el proceso
// del runner). MP_SANDBOX_E2E vive en webServer.env y solo llega al `next dev`.
test.skip(
  !process.env.TUNNEL_URL,
  'E2E de MP sandbox: solo con `npm run test:e2e:sandbox` + TUNNEL_URL (requiere creds + túnel)',
);

test('pago real MP sandbox: registro -> checkout MP -> webhook -> paid', async ({ page }) => {
  // ngrok free intercala una interstitial salvo que se mande este header. Se
  // inyecta SOLO en requests al túnel (retorno + su fetch a la API): mandarlo a
  // mercadopago.com rompería su checkout (header custom -> preflight CORS).
  await page.route('**/*ngrok-free.dev/**', async (route) => {
    await route.continue({
      headers: { ...route.request().headers(), 'ngrok-skip-browser-warning': 'true' },
    });
  });

  // 1) Registro (idéntico al flujo hermético hasta "¡Registro confirmado!").
  await page.goto('/');

  await page.getByLabel('Nombre', { exact: true }).fill('Ana Pérez');
  await page.getByLabel('Email').fill('test_user@testuser.com');

  const fs = page.locator('[data-attendee="0"]');
  await fs.getByLabel('Nombre completo').fill('Ana Pérez');
  await fs.getByLabel('País de origen').fill('Uruguay');
  await fs.getByLabel('Número de documento').fill('1234567-8');
  await fs.getByLabel('Mutualista / seguro médico').fill('CASMU');
  await fs.getByLabel('Contacto de emergencia — nombre').fill('Luis');
  await fs.getByLabel('Contacto de emergencia — teléfono').fill('+59899123456');
  await fs.getByLabel('Contacto de emergencia — relación').fill('Hermano');
  await fs.getByRole('checkbox').check();

  await page.getByRole('button', { name: 'Registrarme' }).click();
  await expect(page.getByText('¡Registro confirmado!')).toBeVisible();

  // 2) Pagar ahora redirige al init_point REAL de MP (no al simulador).
  await page.getByRole('button', { name: 'Pagar ahora' }).click();
  await page.waitForURL(/mercadopago|mercadolibre/, { timeout: 30_000 });

  // 3) Checkout de MP con tarjeta de prueba (APRO=aprobado). El DOM de MP cambia
  // seguido; este bloque es el punto frágil y puede que haya que ajustarlo.
  // A veces MP muestra una pantalla de métodos (botón tarjeta), a veces va
  // directo al formulario. Si el botón aparece, click; si no, seguimos.
  const methodBtn = page
    .getByRole('button', { name: /tarjeta|nueva tarjeta|débito|crédito/i })
    .first();
  try {
    await methodBtn.click({ timeout: 4_000 });
  } catch {
    // Ya estamos en "Completa los datos de tu tarjeta".
  }
  // Número/Vencimiento/CVV viven en iframes seguros de MP (secure-fields), no se
  // cruzan con getByLabel. Se apuntan por id ESTABLE (no por nth(): MP además
  // monta iframes de reCAPTCHA/tracking que desordenan los índices y cuelgan el
  // test). Se tipean con pressSequentially (keystrokes reales): el CVV no valida
  // con .fill(). Titular y documento son textboxes del frame principal.
  // click({force}): el secure-field cross-origin nunca pasa el chequeo de
  // "stable" de Playwright y el click normal se cuelga sin tipear; force lo
  // saltea y enfoca el input para pressSequentially.
  await page.getByText('Completa los datos de tu tarjeta').waitFor({ timeout: 30_000 });
  const cardNumber = page.frameLocator('#iframe-sf-cardNumber').getByRole('textbox');
  await cardNumber.click({ force: true });
  await cardNumber.pressSequentially('5031755734530604');
  await page.getByRole('textbox', { name: 'Nombre del titular' }).fill('APRO');
  const expiry = page.frameLocator('#iframe-sf-expirationDate').getByRole('textbox');
  await expiry.click({ force: true });
  await expiry.pressSequentially('1130');
  const cvv = page.frameLocator('#iframe-sf-securityCode').getByRole('textbox');
  await cvv.click({ force: true });
  await cvv.pressSequentially('123');
  // CI uruguaya con dígito verificador VÁLIDO (1234567 -> 2); MP valida el
  // checksum y deja Continuar deshabilitado si no cierra, sin marcar el campo.
  await page.getByRole('textbox', { name: 'Documento del titular' }).fill('12345672');
  // Blur: MP valida el documento al perder foco y recién ahí habilita Continuar.
  await page.keyboard.press('Tab');

  // Continuar -> (cuotas/confirmación) -> pagar. Botón final varía: pagar/confirmar.
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page
    .getByRole('button', { name: /pagar|confirmar/i })
    .first()
    .click();

  // 4) auto_return de MP redirige a MP_RETURN_URL (/pago/retorno) con el pago
  // real. Extraemos payment_id + external_reference del redirect.
  await page.waitForURL(/\/pago\/retorno/, { timeout: 60_000 });
  const params = new URL(page.url()).searchParams;
  const paymentId = params.get('payment_id') ?? params.get('collection_id') ?? '';
  const registrationId = params.get('external_reference') ?? '';
  expect(paymentId, 'payment_id en el redirect de MP').toBeTruthy();
  expect(registrationId, 'external_reference en el redirect de MP').toBeTruthy();

  // 5) Disparamos el webhook firmado con el payment_id REAL (MP en sandbox no lo
  // entrega de forma fiable). confirmPayment verifica el pago contra la API real.
  const secret = process.env.MP_WEBHOOK_SECRET ?? '';
  const ts = Math.floor(Date.now() / 1000).toString();
  const requestId = `e2e-${ts}`;
  const v1 = createHmac('sha256', secret)
    .update(`id:${paymentId};request-id:${requestId};ts:${ts};`)
    .digest('hex');
  const res = await page.request.post(
    `http://localhost:3000/api/payments/webhook?data.id=${paymentId}&type=payment`,
    {
      headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
      data: { data: { id: paymentId }, type: 'payment' },
    },
  );
  expect(res.status(), 'webhook firmado debe confirmar (200)').toBe(200);

  // 6) El retorno consulta el estado real en la DB: paid solo si confirmPayment
  // verificó el pago contra MP y aplicó confirmed->paid.
  await page.reload();
  await expect(page.getByRole('heading', { name: '¡Pago confirmado!' })).toBeVisible({
    timeout: 15_000,
  });
});
