-- Esquema de Supabase para asu-hub (Fase 1 + columnas de pago Fase 2).
-- Ejecutar en el SQL Editor del proyecto Supabase.
-- Fuente: docs/data-model.md. El adapter SupabaseStorage usa PostgREST
-- contra esta tabla con el service_role key (server-side only).

create table if not exists public.registrations (
  id                  uuid primary key default gen_random_uuid(),
  buyer_name          text        not null,
  buyer_email         text        not null,
  quantity            int         not null,
  attendees           jsonb       not null,
  status              text        not null default 'draft'
    check (status in ('draft', 'confirmed', 'paid', 'cancelled')),
  created_at          timestamptz not null default now(),
  -- Fase 2 (pago): monto bloqueado al iniciar startPayment. Nullables.
  locked_amount_cents int,
  locked_currency     text
);

-- Privacidad (Ley 18.331): datos sensibles. RLS activado y SIN policies
-- publicas => solo el service_role (server-side) accede. Nada de acceso
-- anonimo/cliente.
alter table public.registrations enable row level security;

-- El service_role (server-side, bypassa RLS) necesita privilegios explicitos
-- sobre la tabla. Sin esto PostgREST devuelve 403 "permission denied".
-- Minimo privilegio: StoragePort no borra filas, asi que no se otorga delete.
grant select, insert, update on public.registrations to service_role;
