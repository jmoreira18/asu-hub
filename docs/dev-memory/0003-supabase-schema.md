# 0003 — Esquema SQL de Supabase + E2E negativos/maliciosos

**PR:** feat/supabase-schema · **Fecha:** 2026-06-15

## Qué cambió

1. **`supabase/schema.sql`**: el DDL para la tabla `registrations` que el
   adapter `SupabaseStorage` espera. Antes el adapter existía y estaba testeado,
   pero no había forma versionada de crear la tabla en un proyecto Supabase real
   — había que adivinar columnas desde `docs/data-model.md`. Ahora es copy-paste
   en el SQL Editor.
2. **`tests/e2e/register-negative.spec.ts`**: batería de casos negativos y
   maliciosos sobre `/api/register` (ver más abajo).

## Por qué

- **Fuente de verdad versionada.** El esquema vivía solo en prosa
  (`data-model.md`). Conectar Supabase real requería traducir esa tabla a SQL a
  mano. El `.sql` elimina ese paso y queda en el repo.
- **Reproducible.** Levantar otro entorno (staging, otro organizador) = correr
  un archivo, no reconstruir columnas de memoria.

## Contenido del esquema

- Tabla `public.registrations` con las columnas de `data-model.md`: `id` (uuid
  pk, `gen_random_uuid()`), `buyer_name`, `buyer_email`, `quantity`,
  `attendees` (jsonb), `status` (default `draft`), `created_at` (timestamptz),
  más las nullables de Fase 2 `locked_amount_cents` / `locked_currency`.
- **RLS activado, sin policies públicas.** Privacidad (Ley 18.331): datos
  sensibles. Solo el `service_role` (server-side, bypassa RLS) accede. Nada de
  acceso anónimo/cliente.
- **`grant ... to service_role` explícito.** Con el formato nuevo de API keys
  de Supabase (`sb_secret_*`, no JWT), el `service_role` **no** recibe los
  privilegios por default: PostgREST devuelve `403 permission denied for table`.
  El grant explícito lo arregla.

## Notas operativas (no es código, pero cuesta encontrarlo)

- El adapter usa **PostgREST vía `fetch`**, no `@supabase/supabase-js`. No hay
  dependencia npm que instalar para storage.
- `SUPABASE_SERVICE_KEY` debe ser la **service_role** key (secreta), no la anon.
  Con la anon, PostgREST corre como rol `anon` → `permission denied`.

## E2E negativos y maliciosos

`register-negative.spec.ts` ataca `/api/register` **directo por HTTP**
(fixture `request` de Playwright), saltando el navegador: la UI ya bloquea
inputs inválidos con validación HTML5 (`required`, `type=email`, checkbox
`required`), así que el valor está en probar el **servidor** contra un cliente
que no usa el form. Cubre:

- **Negativos de validación:** JSON malformado → `400 "JSON inválido"` (no 500);
  body vacío reporta campos requeridos; email inválido; lista de asistentes
  vacía; más de `MAX_ATTENDEES` (21 > 20); nivel de experiencia inválido.
- **Maliciosos:**
  - `waiverAccepted=false` forzado se rechaza en el servidor (el deslinde no
    depende solo del checkbox del navegador).
  - **Inyección de campos privilegiados:** el cliente manda `id`, `status:paid`,
    `category:socio`, `isAdmin`; el schema zod descarta claves desconocidas y el
    servidor crea el registro con su propio uuid/estado. Se verifica que el `id`
    devuelto NO es el inyectado.
  - **XSS / SQLi en strings** (`<script>`, `'); DROP TABLE`) → `201`, se guardan
    como texto inerte; no cuelga ni 500ea. El escape en render lo hace React.
- **UI:** sin marcar el deslinde, el submit queda bloqueado por HTML5 y nunca
  aparece la confirmación.

> Nota técnica: para JSON malformado hay que mandar un `Buffer` crudo; si se pasa
> un string, Playwright lo re-serializa a JSON válido. Y `toHaveProperty` con
> claves que tienen puntos (`attendees.0.experience`) necesita la forma de array
> `toHaveProperty([clave])`, si no lee el punto como ruta anidada.

## Gotcha E2E: modo producción vs adapters de dev

`playwright.config.ts` levanta el server con `npm run build && npm run start`,
es decir **producción** (`NODE_ENV=production`). En producción el `factory`
**lanza** si un grupo de adapters no está configurado (ver `pickGroup`,
`allowDev=false`): es a propósito, evita degradar a memoria y perder registros.

Consecuencia: correr E2E contra `next start` exige **todos** los grupos
configurados (incluido emergencia/Sheets) o devuelve `500`. Para una corrida
funcional local se corrió el E2E contra `next dev` (development → adapters en
memoria permitidos), sin tocar servicios reales. Queda pendiente decidir si CI
provee credenciales completas o si el `webServer` del E2E debería usar dev.
