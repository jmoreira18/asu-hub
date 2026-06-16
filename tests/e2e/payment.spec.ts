import { test, expect } from '@playwright/test';

// Flujo de pago punta a punta sobre adapters en memoria (sin MP real):
// registro -> Pagar ahora -> checkout simulado -> webhook -> retorno muestra
// el estado REAL de la DB (`paid`). Que el retorno diga "¡Pago confirmado!" solo
// es posible si el webhook verificó y la transición confirmed->paid se aplicó.
test('pago de punta a punta: registro -> pago -> paid', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Nombre', { exact: true }).fill('Ana Pérez');
  await page.getByLabel('Email').fill('ana@example.com');

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

  // Paso de pago (flag NEXT_PUBLIC_PAYMENT_ENABLED=true en webServer.env).
  // En memoria el checkout es el simulador (route handler): dispara el webhook
  // y redirige al retorno. Sin botón intermedio.
  await page.getByRole('button', { name: 'Pagar ahora' }).click();

  // Retorno: consulta el estado real en la DB; debe ser paid.
  await expect(page.getByRole('heading', { name: '¡Pago confirmado!' })).toBeVisible();
});
