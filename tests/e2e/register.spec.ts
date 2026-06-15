import { test, expect } from '@playwright/test';

test('registro de un asistente de punta a punta', async ({ page }) => {
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
});

test('registro de dos asistentes despliega dos fieldsets', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Cantidad de personas').fill('2');
  await expect(page.locator('[data-attendee="1"]')).toBeVisible();
});
