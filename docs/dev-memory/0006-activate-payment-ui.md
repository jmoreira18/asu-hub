# 0006 — Paso de pago en la UI (activar el cobro)

**PR:** feat/activate-payment · **Fecha:** 2026-06-16

## Qué cambió

Tras un registro `confirmed`, la pantalla de confirmación ahora ofrece **Pagar
ahora** → `POST /api/payments` → redirige a `checkoutUrl` del proveedor. Cierra
el hueco del 0005: el flujo de pago estaba probado solo a nivel API; ahora una
persona real puede pagar desde la web.

- `src/app/RegistrationForm.tsx`: estado `paying`/`payError` + handler `onPay`.
  En la vista `done`, si el pago está activo, muestra el botón. Redirige con
  `window.location.href = checkoutUrl`. La confirmación llega por **webhook**, no
  por el retorno del navegador (regla Fase 2).
- Nueva env **`NEXT_PUBLIC_PAYMENT_ENABLED`** (`"true"` = on). Off/ausente =
  Fase 1 sin pago (comportamiento previo intacto). Es la decisión de producto de
  ASU (¿listo para cobrar? ¿facturación DGI?) detrás de un flag, no de un deploy.
- `.env.example`: documentadas `NEXT_PUBLIC_PAYMENT_ENABLED` y `MP_RETURN_URL`.

## Cierre del loop + "¿cómo saber que pagó?"

La única prueba de pago es el estado `paid` en la DB, que `confirmPayment` pone
solo tras verificar contra el proveedor. El redirect del navegador nunca se
confía (regla de oro, `ports/payment.ts`). Para poder testear y mostrar eso:

- **`GET /api/registrations/[id]`** (read-only) devuelve **solo `{ status }`**
  (nunca documento/contacto/mutualista — regla de privacidad). Es la fuente de
  verdad del "¿pagó?".
- **`/pago/retorno`** (back_urls de MP / dev-checkout): lee `external_reference`
  del query, **consulta el endpoint de estado** y muestra paga/pendiente. No
  confía en el `?status=` del redirect. `useSearchParams` va dentro de `Suspense`
  (requisito de build de Next).
- **`GET /api/payments/dev-checkout`** (solo dev): simulador de checkout que
  apunta `MemoryPaymentProvider`. Al visitarlo (como el redirect a MP) dispara el
  webhook real server-to-server y redirige (302) al retorno con
  `external_reference`. Se hizo **route handler con redirect**, no página con
  botón: una página cliente con `useSearchParams` + fetch se rompía en E2E por
  remontajes de Fast Refresh de `next dev`. El handler GET es robusto y más fiel
  a MP (procesa y redirige).

### Singletons de dev por `globalThis` (bug encontrado y arreglado)

`buildDeps` hacía `new MemoryStorage()` / `new MemoryPaymentProvider()` por
llamada. En `next dev` **cada ruta se bundlea por separado**: un `let` a nivel de
módulo NO se comparte entre rutas, así que el registro guardado en `/register`
era invisible para `/payments`, y el pago para `/webhook` → `startPayment` tiraba
"no encontrada". Fix: los adapters de memoria son singletons en `globalThis`
(`factory.ts`), patrón estándar de Next para datastores de dev. Sin esto el flujo
de pago en memoria (dev/E2E) nunca cerraba.

## `back_urls` para prod (incluido)

- Nueva env **`MP_RETURN_URL`** (URL HTTPS completa de `/pago/retorno`), en el
  grupo todo-o-nada de MP + validación https, igual que `MP_NOTIFICATION_URL`.
- `MercadoPagoConfig.returnUrl` → `back_urls` + `auto_return: 'approved'`. Tras
  pagar, MP redirige al pagador a `/pago/retorno?status=&external_reference=`.
- Tests nuevos en `payment.test.ts` (manda/omite `back_urls`) y `factory.test.ts`
  (lanza si falta / si no es https).

## Por qué así

Botón explícito en vez de auto-redirect tras registrar: maneja "abandono" gratis
(reintento) y no sorprende. `registrationId` es lo único que viaja; el monto se
calcula server-side. El retorno muestra el estado real, no el redirect.

## Hardening del webhook (Parte C)

- **Sin ventana anti-replay en `verifyWebhook`** (`mercadopago.ts`): se evaluó una
  ventana `|now - ts| > 5min` pero se descartó. `confirmPayment` ya es idempotente
  (`paid` terminal + `compareAndSetStatus` atómico), así que reenviar un webhook
  válido es inofensivo: la ventana no agregaba defensa real y arriesgaba rechazar
  reentregas legítimas de MP (que reintenta ante 5xx con la firma —y `ts`—
  originales), dejando un pago cobrado varado en `confirmed`. La defensa anti-replay
  es la idempotencia, no el reloj. El `ts` sigue entrando al manifest HMAC (no se
  puede falsificar sin el secreto).
- **Test de integración de la ruta** `tests/integration/webhook-route.test.ts`:
  hasta ahora la ruta del webhook no tenía test propio (sí el use case y el
  adapter). Mockea `buildPaymentDeps` + `confirmPayment` para aislar la lógica de
  la ruta: 400 (JSON inválido, sin validar firma), 401 (firma inválida), 200
  ignored/confirmed-true/confirmed-false (200 a propósito para no gatillar
  reintentos infinitos), 500 (excepción → el proveedor reintenta) y el sourcing de
  `data.id` (query param > body).
- **`eslint.config.mjs`**: el ruido de `npm run lint` global NO era `.next` (ya
  ignorado) sino los **git worktrees** en `.claude/worktrees/*`, cada uno con su
  propio build (`.next`/`coverage`/generados) → 10815 falsos positivos. Se ignora
  `.claude/**`. `eslint .` vuelve a salir limpio (exit 0).

## Verificación

- `npm run typecheck` ✓ · `npx eslint` (archivos tocados) ✓ · `npm test` ✓ **107**
  (3 nuevos: back_urls + 2 de `MP_RETURN_URL`) · `npm run build` ✓.
- **E2E `tests/e2e/payment.spec.ts`** ✓: registro → Pagar ahora → dev-checkout
  (307) → webhook → `/pago/retorno` muestra "¡Pago confirmado!" leyendo `paid` de
  la DB. `playwright.config.ts` fuerza adapters en memoria (env vacías) para un
  E2E hermético sin importar el `.env.local` del dev, y sube el timeout de
  aserción a 15s por la compilación en frío de `next dev`. 12/12 specs verde.
- Manual (curl, memoria): register→`confirmed`, `/api/payments`→checkoutUrl,
  webhook→`confirmed:true`, status→**`paid`**.
