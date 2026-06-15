# 0001 — Scaffold + Fase 1 (registro sin pago)

**PR:** inicial · **Fecha:** 2026-06-14

## Qué cambió

Primera versión: web de registro para evento de highline (ASU). Fase 1 =
registro **sin pago** (Mercado Pago y facturación DGI quedan para Fase 2).

- Scaffold Next.js (App Router) + TS + Vitest + Playwright + ESLint/Prettier.
- Arquitectura hexagonal: `src/core` (dominio puro) + `src/adapters` + `src/app`.
- Dominio: entidades, schemas zod (deslinde obligatorio), máquina de estados.
- Ports: `StoragePort`, `EmailPort`, `EmergencyExportPort`, `PaymentProvider`
  (este último definido pero sin implementar — Fase 2).
- Use case `registerAttendees`: valida → guarda `confirmed` → sync emergencia
  → email (best-effort).
- Adapters: Supabase / Resend / Google Sheets (vía Apps Script), todos con
  `fetch` inyectable; + adapters en memoria/consola para dev y E2E.
- UI: formulario dinámico (N asistentes) + `POST /api/register`.
- CI: `pr.yml` (lint+types+unit+integration, gate 100% core) y `release.yml`
  (E2E + Allure → Pages en tag).
- Docs con mermaids + este dev-memory.

## Por qué (decisiones)

- **Fase 1 sin pago:** desacopla el lanzamiento de bloqueantes externos (cuenta
  MP, DGI). El `PaymentProvider` ya definido permite enchufar pago sin reescribir.
- **Hexagonal:** portabilidad (mover a otro repo) + cambiar de proveedor sin
  tocar el dominio.
- **Supabase + sync a Google Sheet:** DB como fuente de verdad; Sheet read-only
  para acceso de emergencia **offline** en el spot (puede no haber señal).
- **Cobertura 100% solo en `src/core`:** máximo valor donde está el negocio;
  pragmático en UI/adapters (integration + E2E).
- **Allure solo en E2E/funcional, en release:** unit/integration corren rápido
  en cada PR sin publicar reportes.
- **Deslinde:** el texto lo provee ASU (existe de años anteriores); solo se
  guarda el flag `waiverAccepted` + un link.

## Hardening (review, 2026-06-15)

Correcciones sobre el registro dentro de esta misma PR:

- **Fallback de memoria solo fuera de producción.** `pickGroup` (factory) recibe
  `allowDev`. Con un grupo SIN configurar: en dev cae al adapter en memoria; en
  producción **lanza**. Antes, un deploy sin credenciales devolvía `201` y perdía
  los registros en el siguiente reinicio del proceso.
- **Tope de asistentes (`MAX_ATTENDEES = 20`).** Schema (`.max`) + UI (`min/max`
  y clamp en `setQuantity`). Evita payloads abusivos en el endpoint público.
- **Escape de HTML en el email de confirmación.** Campos del usuario
  (`buyerName`, nombres, código) se escapan antes de interpolarse en el `html`.
- **`quantity` deja de ser entrada.** Se deriva de `attendees.length` (se quitó
  del input/schema/`refine`/form). La columna `quantity` de Supabase se sigue
  poblando desde `attendees.length`.
- **Adapters perezosos en la API route.** `buildDeps()` se invoca en el primer
  request (memoizado por proceso), no al importar el módulo: `next build` evalúa
  rutas sin variables de entorno y con el throw nuevo el build fallaba.

Verificación: `typecheck`, `lint`, `build` OK · 49 tests · 100% en `src/core`.

## Pendiente / próximo

- Fase 2: adapter Mercado Pago + webhook + estado `paid`; PayPal y transferencia.
- Persistir adapter de Supabase con RLS real + migración SQL.
- Reintento durable de la sync de emergencia (hoy best-effort + `console.error`).
- Idempotencia de `save` para evitar duplicados ante reintento del cliente.
- i18n (inglés) si se confirma.
- Resolver hosting + facturación DGI antes de abrir venta real.
