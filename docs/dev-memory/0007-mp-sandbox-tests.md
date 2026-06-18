# 0007 — Tests de round-trip contra MP sandbox (API + navegador)

**PR:** feat/activate-payment · **Fecha:** 2026-06-16

## Qué cambió

Hasta ahora todo el pago se probaba contra el **adapter en memoria**: MP real
solo se había tocado a mano (0005). No había prueba automatizada de que el
adapter de MercadoPago hable de verdad con la API ni de que un pago real vuelva.
Este PR agrega dos suites **opt-in que skipean por defecto**, así `npm test` y el
pipeline de PR siguen herméticos y verdes.

- **`tests/sandbox/mp-sandbox.test.ts`** — smoke de API contra MP sandbox real,
  sin navegador ni túnel. `describe.skipIf(!MP_ACCESS_TOKEN)`. `createPayment`
  crea una preferencia real (assert `paymentId` + `checkoutUrl` https);
  `verifyPayment` (gate extra `MP_TEST_PAYMENT_ID`) lee un pago aprobado y valida
  el mapeo de la respuesta real. Vive fuera del `include` de vitest
  (`src/**`, `tests/integration/**`), así no corre en `npm test` ni toca el gate
  100%. Script: `npm run test:mp`.
- **`tests/e2e-sandbox/payment-sandbox.spec.ts`** + **`playwright.sandbox.config.ts`**
  — el round-trip de verdad: registro → checkout REAL de MP → tarjeta de prueba
  → pago aprobado → webhook firmado con el `payment_id` REAL → `confirmPayment`
  verifica el pago **contra la API real de MP** y hace `confirmed→paid` →
  `/pago/retorno` muestra "¡Pago confirmado!". Guardado con
  `test.skip(!TUNNEL_URL)`. El config sandbox, a diferencia del hermético por
  defecto, **pasa credenciales MP reales desde `process.env`** y apunta
  `notification/return` al `TUNNEL_URL`. Dir separado para que el E2E normal
  nunca lo levante. Script: `npm run test:e2e:sandbox`.

## Por qué así

- **Opt-in / skip por defecto:** el gate de privacidad del proyecto es que el CI
  corre sin servicios reales. Las dos suites auto-skipean sin credenciales, así
  no rompen el pipeline ni filtran secretos.
- **Túnel manual (ngrok), no auto-spawn:** el ciclo de vida del túnel es del
  operador; automatizarlo agrega frágil sin valor. El E2E exige `TUNNEL_URL`.
- **El push del webhook de MP en sandbox no es fiable** (a veces no llega, tarda
  minutos, o MP frena la entrega tras fallos 401/502). Para que el E2E sea
  determinista, el test dispara la notificación con el `payment_id` REAL del
  redirect, firmada con `MP_WEBHOOK_SECRET` igual que MP. Lo único "simulado" es
  el transporte del POST; el pago es real y `confirmPayment` lo verifica contra
  la API real. La firma con payload real de MP se validó aparte (ver abajo).
- **Selectores del checkout de MP = punto frágil** (su DOM cambia). Lecciones que
  costaron: los campos número/vencimiento/CVV viven en **iframes** (usar
  `frameLocator` + `pressSequentially`, no `.fill()` — el CVV no valida con
  fill); el documento necesita **CI uruguaya con dígito verificador válido**
  (`1234567`→`2`) y un **blur** (Tab) para habilitar Continuar; el header
  `ngrok-skip-browser-warning` debe ir **solo** a requests del túnel (mandarlo a
  mercadopago.com rompe su checkout por preflight CORS).

## Validación de la firma con payload real

El secreto de webhook se verificó con un payload **firmado por MP de verdad**
(botón "Simular notificación" del panel): HMAC `id:<dataId>;request-id:<reqId>;
ts:<ts>;` con `MP_WEBHOOK_SECRET` coincide → la ruta devuelve 200/500 según el
pago, nunca 401. Trampa que costó horas: un 401 persistente era el secreto del
`.env.local` que no era el del panel (app/entorno equivocado), no un bug del
manifest.

Sin bloqueos previos: el schema ya tenía `locked_amount_cents`/`locked_currency`
(`supabase/schema.sql`). Solo faltaban credenciales de sandbox (las pone el dev).

## Cómo correrlo

Runbook completo en [`docs/mp-sandbox-testing.md`](../mp-sandbox-testing.md):
credenciales, ngrok, tarjetas de prueba (APRO), y los dos comandos.

## Archivos

- `tests/sandbox/mp-sandbox.test.ts` (nuevo)
- `tests/e2e-sandbox/payment-sandbox.spec.ts` (nuevo)
- `playwright.sandbox.config.ts` (nuevo)
- `package.json` — scripts `test:mp`, `test:e2e:sandbox`
- `docs/mp-sandbox-testing.md` (nuevo), `.env.example` (+`MP_TEST_PAYMENT_ID`)
