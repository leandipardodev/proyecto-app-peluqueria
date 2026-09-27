-- WhatsApp: automatizacion por local (Embedded Signup + Cloud API)
-- La llave de acceso (wa_token) se guarda CIFRADA por la aplicacion (AES-256-GCM,
-- clave en env META_WA_STATE_SECRET, server-only) en shops.wa_token.
-- No usa la extension vault: no esta disponible en planes Free.

-- shops: estado del conector + toggles de mensajes por local
alter table shops add column if not exists wa_waba_id text;
alter table shops add column if not exists wa_phone_number_id text;
alter table shops add column if not exists wa_connected_at timestamptz;
alter table shops add column if not exists wa_remind_enabled boolean not null default false;
alter table shops add column if not exists wa_feedback_enabled boolean not null default false;
alter table shops add column if not exists wa_birthday_enabled boolean not null default false;
alter table shops add column if not exists wa_remind_hours_before integer not null default 3;
alter table shops add column if not exists wa_token text;

-- customers: consentimiento marketing y honor de opt-out
alter table customers add column if not exists wa_opt_in boolean not null default false;
alter table customers add column if not exists wa_opt_out boolean not null default false;

-- appointments: marcas de envio (dedupe)
alter table appointments add column if not exists wa_reminder_sent_at timestamptz;
alter table appointments add column if not exists wa_feedback_sent_at timestamptz;

-- log de mensajes: auditoria para el panel de costos por local
create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  message_type text not null,
  template_name text not null,
  to_phone text not null,
  category text not null,
  meta_message_id text,
  status text not null default 'sent',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_shop_created_idx on whatsapp_messages (shop_id, created_at desc);
create index if not exists appointments_wa_reminder_pending_idx on appointments (shop_id, start_time) where wa_reminder_sent_at is null;
create index if not exists appointments_wa_feedback_pending_idx on appointments (shop_id, end_time) where wa_feedback_sent_at is null;

alter table whatsapp_messages enable row level security;

create policy "whatsapp_messages_shop_read" on whatsapp_messages
  for select
  using (
    exists (
      select 1 from shop_memberships sm
      where sm.shop_id = whatsapp_messages.shop_id
        and sm.user_id = auth.uid()
        and sm.is_active = true
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_messages'
  ) then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
end $$;