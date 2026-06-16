# 0005 — `notification_url` en la preferencia de MP (entrega del webhook)

**PR:** feat/mp-notification-url · **Fecha:** 2026-06-16

## Qué cambió

La preferencia de Checkout Pro ahora incluye `notification_url`. Nueva env
`MP_NOTIFICATION_URL` (URL pública **completa** del webhook), **obligatoria junto
a** `MP_ACCESS_TOKEN` + `MP_WEBHOOK_SECRET`.

- `src/adapters/payment/mercadopago.ts`: `MercadoPagoConfig.notificationUrl?`
  (opcional, mismo patrón que `baseUrl`/`fetchImpl`). En `createPayment` se manda
  `notification_url` solo si está configurada (spread; se omite si no).
- `src/adapters/factory.ts`: `MP_NOTIFICATION_URL` entra al `pickGroup` de MP →
  todo-o-nada con las credenciales. Config parcial (creds sin URL) **lanza** al
  construir las deps.
- `.env.example`: documentada la nueva var.
- Tests: `payment.test.ts` (manda / omite `notification_url`),
  `factory.test.ts` (lanza si falta la URL; el test "usa Mercado Pago" ahora pasa
  las tres vars).

## Por qué

Prueba en vivo (sandbox real, token TEST) del flujo Fase 2 de punta a punta:
register → preferencia real → pago aprobado real → webhook firmado →
`confirmPayment` → `verifyPayment` contra MP → `confirmed→paid` en Supabase.
Verificados también rechazo de firma (401) e idempotencia (200 no-op).

**Lo único que fallaba era la *entrega*, no el código:** MP nunca auto-POSTeaba
el webhook. Causa: la preferencia no llevaba `notification_url`, así que MP
dependía del webhook configurado en el panel, que es sensible al modo — los pagos
de usuario de prueba son `live_mode:true`, pero el webhook/simulador del panel
corría `live_mode:false` → desajuste → sin entrega.

Mandar `notification_url` por preferencia es la vía documentada y robusta:
MP notifica a esa URL exacta, sin depender del modo del panel. Se hace
**obligatoria** porque sin vía de confirmación un pago real queda en `confirmed`
para siempre y nunca se sabe quién pagó: mejor que el factory lance a desplegar
un cobro que no puede confirmarse.

## Decisión: URL completa, no base

`MP_NOTIFICATION_URL` guarda la URL completa
(`https://.../api/payments/webhook`), no `APP_BASE_URL` + path hardcodeado: MP
requiere URL completa igual, y así el adapter no se acopla a la ruta de Next
(regla hexagonal — `src/adapters` no asume el framework).

## Verificación

- `npm test` ✓ — 103 tests (2 nuevos).
- `npm run typecheck` ✓.
- `npx eslint` sobre los archivos tocados ✓ (el `npm run lint` global sigue
  ruidoso por artefactos `.next`, ver 0004).
- Manual (dev): `MP_NOTIFICATION_URL` = URL de ngrok, reiniciar server (la env se
  lee al arrancar), pagar de prueba → MP auto-POSTea y el log muestra
  `POST /api/payments/webhook ... 200` sin curl manual; el registro pasa a
  `paid`.

## Pendiente (próximo PR: UI de pago)

El form (`RegistrationForm.tsx`) hoy solo llama `/api/register` y termina en
"¡Registro confirmado!": **no hay paso de pago en la UI** (Fase 1 sin pago). Todo
lo de pago — incluido este fix — está probado solo a nivel API. Para que una
persona real pague hace falta otro PR (`feat/activate-payment`): tras registrar,
llamar `/api/payments` y redirigir a `checkoutUrl`, con página de retorno
(`back_urls`) y manejo de `pending` / `rejected` / abandono. Eso es activar el
cobro de verdad (decisión de producto de ASU: ¿listo para cobrar? ¿facturación
DGI?), no un add-on de este PR.

## Gotchas

- El simulador de webhook del panel manda `data.id: "123456"` (id falso) →
  `verifyPayment` da 404 contra MP → la ruta responde **500**. Es **esperado**:
  una notificación real trae un id real. No es un bug.
- La env se lee al **arrancar** Next; cambiarla exige reiniciar el server.
- Tokenizar tarjetas de prueba (`/v1/card_tokens`) requiere la **Public Key**, no
  el Access Token. Crear pagos por la API directa (`/v1/payments`) da
  `401 Unauthorized use of live credentials` porque la app es integración
  **Checkout Pro**, no Checkout API — usar el checkout (preferencia), no el pago
  directo.
