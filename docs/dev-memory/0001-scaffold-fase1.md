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

## Pendiente / próximo

- Fase 2: adapter Mercado Pago + webhook + estado `paid`; PayPal y transferencia.
- Persistir adapter de Supabase con RLS real + migración SQL.
- i18n (inglés) si se confirma.
- Resolver hosting + facturación DGI antes de abrir venta real.
