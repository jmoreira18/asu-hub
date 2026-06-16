import { test, expect, type APIRequestContext } from '@playwright/test';

// Casos negativos y maliciosos. La UI bloquea inputs invalidos con validacion
// HTML5 (required, type=email, checkbox required), asi que los casos de
// servidor se prueban yendo directo a /api/register (saltando el navegador):
// ahi es donde vive la validacion real (zod en src/core) y donde pega un
// cliente hostil que no usa el form.

const validAttendee = () => ({
  fullName: 'Ana Pérez',
  country: 'Uruguay',
  documentNumber: '1234567-8',
  experience: 'beginner',
  medicalInsurance: 'CASMU',
  waiverAccepted: true,
  emergencyContact: { name: 'Luis', phone: '+59899123456', relation: 'Hermano' },
});

const validBody = () => ({
  buyerName: 'Ana Pérez',
  buyerEmail: 'ana@example.com',
  attendees: [validAttendee()],
});

const post = (request: APIRequestContext, body: unknown) =>
  request.post('/api/register', {
    headers: { 'Content-Type': 'application/json' },
    data: body,
  });

test.describe('registro — casos negativos (validacion de servidor)', () => {
  test('JSON malformado devuelve 400, no 500', async ({ request }) => {
    const res = await request.post('/api/register', {
      headers: { 'Content-Type': 'application/json' },
      // Buffer crudo: evita que Playwright re-serialice el string a JSON valido.
      data: Buffer.from('{ esto no es json'),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('JSON inválido');
  });

  test('body vacio reporta los campos requeridos', async ({ request }) => {
    const res = await post(request, {});
    expect(res.status()).toBe(400);
    const { issues } = await res.json();
    expect(issues).toHaveProperty('buyerName');
    expect(issues).toHaveProperty('buyerEmail');
    expect(issues).toHaveProperty('attendees');
  });

  test('email invalido se rechaza', async ({ request }) => {
    const res = await post(request, { ...validBody(), buyerEmail: 'no-es-un-email' });
    expect(res.status()).toBe(400);
    expect((await res.json()).issues).toHaveProperty('buyerEmail');
  });

  test('lista de asistentes vacia se rechaza', async ({ request }) => {
    const res = await post(request, { ...validBody(), attendees: [] });
    expect(res.status()).toBe(400);
    expect((await res.json()).issues).toHaveProperty('attendees');
  });

  test('mas asistentes que el tope (21 > 20) se rechaza', async ({ request }) => {
    const res = await post(request, {
      ...validBody(),
      attendees: Array.from({ length: 21 }, validAttendee),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).issues).toHaveProperty('attendees');
  });

  test('nivel de experiencia invalido se rechaza', async ({ request }) => {
    const res = await post(request, {
      ...validBody(),
      attendees: [{ ...validAttendee(), experience: 'experto-supremo' }],
    });
    expect(res.status()).toBe(400);
    // Clave literal con puntos: el array evita que toHaveProperty la lea como ruta anidada.
    expect((await res.json()).issues).toHaveProperty(['attendees.0.experience']);
  });
});

test.describe('registro — casos maliciosos', () => {
  test('deslinde no aceptado (waiverAccepted=false) se rechaza', async ({ request }) => {
    // El deslinde es obligatorio: un cliente que fuerza false debe ser rechazado
    // por el servidor, no solo por el checkbox required del navegador.
    const res = await post(request, {
      ...validBody(),
      attendees: [{ ...validAttendee(), waiverAccepted: false }],
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).issues).toHaveProperty(['attendees.0.waiverAccepted']);
  });

  test('campos privilegiados inyectados por el cliente se ignoran', async ({ request }) => {
    // Un cliente hostil intenta pre-setear id/estado/categoria. El schema
    // descarta claves desconocidas: el registro lo crea el servidor con su
    // propio id y estado, no con lo que mande el cliente.
    const res = await post(request, {
      ...validBody(),
      id: 'HACKED-ID',
      status: 'paid',
      attendees: [{ ...validAttendee(), category: 'socio', isAdmin: true }],
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.id).not.toBe('HACKED-ID');
    // id real = uuid v4 generado por el servidor.
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('payload con XSS en el nombre se acepta como dato inerte, no rompe', async ({ request }) => {
    // No debe colgar ni devolver 500: el string se guarda como texto, no se
    // ejecuta. El escape en render es responsabilidad de React en el cliente.
    const res = await post(request, {
      ...validBody(),
      buyerName: '<script>alert(1)</script>',
      attendees: [{ ...validAttendee(), fullName: "'); DROP TABLE registrations;--" }],
    });
    expect(res.status()).toBe(201);
    expect(await res.json()).toHaveProperty('id');
  });
});

test('UI: sin aceptar el deslinde no se confirma el registro', async ({ page }) => {
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
  // No se marca el checkbox del deslinde (required) a proposito.

  await page.getByRole('button', { name: 'Registrarme' }).click();

  // El navegador bloquea el submit: el checkbox queda invalido y nunca aparece
  // la confirmacion.
  const waiver = fs.getByRole('checkbox');
  await expect(waiver).toBeFocused();
  await expect(page.getByText('¡Registro confirmado!')).toBeHidden();
});
