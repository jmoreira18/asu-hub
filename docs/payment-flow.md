# Flujo de pago (Fase 2 — diseño)

> **Estado:** esqueleto implementado (ver `docs/dev-memory/0002`). Funciona
> end-to-end con adapters dev / `fetch` mockeado; **falta enchufar credenciales
> reales de Mercado Pago** y la facturación DGI. El monto se calcula server-side
> (`src/core/domain/pricing.ts`); el webhook valida firma y verifica contra la
> API antes de confirmar.

## Por qué Mercado Pago (y no una tiquetera)

Necesitamos la plata **antes** del evento (remeras, gastos fijos). Las
tiqueteras pagan después del evento. Mercado Pago acredita al momento de la
venta y cubre bien Uruguay + región.

- **Fuera de LATAM:** link de PayPal manual para los pocos casos.
- **Transferencia bancaria:** adapter de **confirmación manual** (sin webhook).

## Máquina de estados

```mermaid
stateDiagram-v2
    [*] --> draft: submit formulario
    draft --> confirmed: validación OK (Fase 1 termina acá)
    confirmed --> paid: webhook pago aprobado (Fase 2)
    confirmed --> cancelled: expira / cancelado
    paid --> cancelled: reembolso
```

Implementada en `src/core/domain/state-machine.ts`. Fase 1 usa `confirm`;
`pay`/`refund` quedan listos para Fase 2.

## Regla de oro del pago

La confirmación real la da el proveedor por **webhook**, verificada contra su
API. **Nunca** se confía en el redirect de "gracias" del navegador.

```mermaid
sequenceDiagram
    participant U as Usuario
    participant W as Web
    participant PP as PaymentProvider (MP)
    participant H as Webhook handler
    U->>W: registra → createPayment()
    W->>PP: crea preferencia
    PP-->>W: checkoutUrl
    U->>PP: paga en checkout
    PP->>H: webhook "hubo pago"
    H->>PP: verifyPayment(id) ¿aprobado?
    PP-->>H: approved
    H->>H: transition(confirmed, "pay") → paid
    H->>H: email + sync emergencia
```

## Pasos para implementar Fase 2

```mermaid
graph LR
    A[1. Adapter MercadoPago<br/>implements PaymentProvider] --> B[2. Route webhook<br/>/api/payments/webhook]
    B --> C[3. Use case confirmPayment<br/>verifica + transition pay]
    C --> D[4. Enchufar en factory]
    D --> E[5. Tests unit + integration]
```

Pasos 1-5: **hechos a nivel esqueleto** (`docs/dev-memory/0002`). Además:
`startPayment` + `POST /api/payments` para iniciar, y `pricing.ts` para el monto.

Pendiente para cobrar de verdad:

- Credenciales **TEST** de Mercado Pago en `.env.local` / hosting (nunca en git
  ni en el chat). `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` son secretos de
  servidor; nunca `NEXT_PUBLIC_`.
- `MP_NOTIFICATION_URL`: **URL pública HTTPS completa** del webhook
  (`https://.../api/payments/webhook`). El adapter la manda como
  `notification_url` en cada preferencia, así MP notifica a esa URL exacta — la
  vía robusta de confirmación, **independiente del modo del webhook del panel**
  (en pruebas se vio que el webhook del panel no entregaba por desajuste de
  `live_mode`). Es **obligatoria junto a token + secret**: el factory lanza si
  falta (no se cobra sin vía de confirmación). Dev = URL de ngrok; prod =
  dominio real, host siempre-encendido. Ver `docs/dev-memory/0005`.
- `MP_RETURN_URL`: **URL pública HTTPS completa** de `/pago/retorno`. El adapter
  la manda como `back_urls` + `auto_return:'approved'`, así MP redirige al pagador
  de vuelta tras pagar. **Obligatoria junto al resto del grupo MP** (mismo
  todo-o-nada + check https que `MP_NOTIFICATION_URL`). Solo UX de retorno; la
  confirmación sigue siendo por webhook. Ver `docs/dev-memory/0006`.
- `NEXT_PUBLIC_PAYMENT_ENABLED=true` para mostrar el paso de pago en la UI
  (decisión de producto: ¿listo para cobrar?).
- `PRICING_CONFIG` real (tandas + precios por categoría) provista por ASU.
- **Facturación DGI** con contador (bloqueante no técnico).

## Paso de pago en la UI (Fase 2 — `docs/dev-memory/0006`)

Tras un registro `confirmed`, la UI ofrece **Pagar ahora** → `POST /api/payments`
(solo `registrationId`; el monto se calcula server-side) → redirige al
`checkoutUrl`. Al volver, **`/pago/retorno`** lee el estado **real** de la DB vía
`GET /api/registrations/:id` (solo `status`, sin PII) y muestra paga/pendiente:
nunca confía en el `?status=` del redirect (regla de oro).

```mermaid
sequenceDiagram
    participant U as Usuario
    participant W as Web (/pago/retorno)
    participant API as /api/registrations/:id
    U->>W: vuelve de MP (back_urls) con external_reference
    W->>API: GET estado real
    API-->>W: { status: paid | confirmed }
    W-->>U: "¡Pago confirmado!" / "en proceso"
```

**Dev/E2E sin MP real:** `MemoryPaymentProvider` apunta el `checkoutUrl` a
`GET /api/payments/dev-checkout` (simulador, solo dev): dispara el webhook real
server-to-server y redirige al retorno con `external_reference`, cerrando el loop
`register → pay → paid` sin credenciales. E2E: `tests/e2e/payment.spec.ts`.
