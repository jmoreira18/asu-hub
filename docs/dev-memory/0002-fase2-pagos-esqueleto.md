# 0002 — Fase 2 (pagos): esqueleto seguro + tests

**PR:** feat/fase2-pagos-esqueleto · **Fecha:** 2026-06-15

## Qué cambió

Esqueleto end-to-end de pagos (Mercado Pago) **sin tocar credenciales reales ni
cobrar plata**: todo corre con adapters dev / `fetch` mockeado. Foco: que sea
imposible leakear secretos y que ningún cobro dependa del navegador.

- **Dominio (puro):**
  - `domain/pricing.ts` — `computePrice(registration, config, now)`. Precio por
    **categoría** (`socio` / `no-socio`) y por **tanda** según fecha (rango
    semiabierto `[from, to)`). Montos en **centavos enteros**.
  - `domain/types.ts` — `PRICE_CATEGORIES`/`PriceCategory` + campo opcional
    `category` en `Attendee` (default `no-socio`; el form aún no lo recolecta).
  - `domain/errors.ts` — `PricingError` (no hay tanda vigente).
  - `domain/schemas.ts` — `pricingConfigSchema` + `parsePricingConfig`; loop de
    issues extraído a helper `issuesByPath` (DRY con `parseRegistrationInput`).
- **Puerto `PaymentProvider`** refinado: `createPayment` recibe `amountCents`
  (lo calcula el dominio, no el cliente); `verifyPayment` devuelve
  `VerifiedPayment` (status + `registrationId` + monto + moneda) para chequeo
  server-side; nuevo `verifyWebhook` (validación de firma).
- **Use cases:** `startPayment` (confirmed → calcula precio → crea preferencia →
  `checkoutUrl`) y `confirmPayment` (verifica contra proveedor → compara monto →
  `pay` → email/sync best-effort; idempotente).
- **Adapters de pago:** `MercadoPagoPayment` (REST, `fetch` inyectable, firma
  HMAC `x-signature`) y `MemoryPaymentProvider` (dev, aprueba al instante).
  `default-pricing.ts` con `DEV_PRICING` + `loadPricingConfig(env)`.
- **Factory:** `buildPaymentDeps` agrega grupo `MP_ACCESS_TOKEN` /
  `MP_WEBHOOK_SECRET` (mismo fail-fast en prod) + pricing.
- **Routes:** `POST /api/payments` (iniciar) y `POST /api/payments/webhook`
  (valida firma → 401, idempotente, no loguea payload/secretos).
- **Tests:** gate 100% en `src/core` + integración de adapters/factory (88 tests).
- `.env.example`: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `PRICING_CONFIG`.

## Por qué (decisiones)

- **Monto server-side.** El navegador nunca manda el precio: `createPayment`
  recibe `amountCents` desde `computePrice`. Evita pagar $1 manipulando el body.
- **Webhook no es fuente de verdad.** Tras validar firma se llama
  `verifyPayment` contra la API; se compara monto y moneda esperados. Mismatch →
  no se confirma (anti-manipulación / cambio de tanda).
- **Idempotencia con la máquina de estados.** Si ya está `paid`, el webhook
  reentregado es no-op exitoso (no se re-cobra ni re-emite).
- **Secretos solo server-side.** `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET` se leen
  solo en el factory; nunca `NEXT_PUBLIC_`, nunca en `src/core`/cliente. Con
  redirect a `init_point` no hace falta ningún secreto en el front.
- **Precios config-driven.** El dominio no decide de dónde salen los números:
  `PricingConfig` se inyecta (env `PRICING_CONFIG` JSON validado, o `DEV_PRICING`).

## Decisiones de producto abiertas (no bloquean el esqueleto)

- **Cómo se identifica un socio:** hoy solo el campo `category` en el attendee
  (default `no-socio`); falta decidir form vs lista de socios.
- **Dónde vive la `PricingConfig`:** env JSON por ahora; modelar "evento" en DB
  con su precio queda para después.
- **Monto bloqueado:** hoy `confirmPayment` recalcula con el reloj; si cambia la
  tanda entre crear y pagar, da mismatch. TODO: persistir el monto al crear.

## Próximo

Enchufar sandbox real de MP (credenciales TEST, configurar webhook con URL
pública HTTPS), adapter de transferencia bancaria, PayPal, modelar evento+precio
en DB, persistir monto bloqueado, **facturación DGI** (bloqueante no técnico).
