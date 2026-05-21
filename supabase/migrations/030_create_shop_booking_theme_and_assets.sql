begin;

create table if not exists public.shop_booking_theme (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  template_id text not null default 'minimal-glass'
    check (template_id in ('classic-dark', 'minimal-glass', 'editorial-luxury', 'street-bold')),
  logo_url text,
  logo_storage_path text,
  hero_title text,
  hero_subtitle text,
  about_title text,
  about_text text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_shop_booking_theme_template_id
  on public.shop_booking_theme(template_id);

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shop_booking_theme_updated_at on public.shop_booking_theme;
create trigger trg_shop_booking_theme_updated_at
before update on public.shop_booking_theme
for each row execute function public.set_timestamp_updated_at();

alter table public.shop_booking_theme enable row level security;

drop policy if exists shop_booking_theme_select_members on public.shop_booking_theme;
create policy shop_booking_theme_select_members
on public.shop_booking_theme
for select
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = shop_booking_theme.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
  )
);

drop policy if exists shop_booking_theme_insert_admin on public.shop_booking_theme;
create policy shop_booking_theme_insert_admin
on public.shop_booking_theme
for insert
to authenticated
with check (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = shop_booking_theme.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
);

drop policy if exists shop_booking_theme_update_admin on public.shop_booking_theme;
create policy shop_booking_theme_update_admin
on public.shop_booking_theme
for update
to authenticated
using (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = shop_booking_theme.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id = shop_booking_theme.shop_id
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'booking-assets',
  'booking-assets',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists booking_assets_read_public on storage.objects;
create policy booking_assets_read_public
on storage.objects
for select
to public
using (bucket_id = 'booking-assets');

drop policy if exists booking_assets_upload_members on storage.objects;
create policy booking_assets_upload_members
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'booking-assets'
  and split_part(name, '/', 1) = 'shops'
  and exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id::text = split_part(name, '/', 2)
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
);

drop policy if exists booking_assets_update_members on storage.objects;
create policy booking_assets_update_members
on storage.objects
for update
to authenticated
using (
  bucket_id = 'booking-assets'
  and split_part(name, '/', 1) = 'shops'
  and exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id::text = split_part(name, '/', 2)
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
)
with check (
  bucket_id = 'booking-assets'
  and split_part(name, '/', 1) = 'shops'
  and exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id::text = split_part(name, '/', 2)
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
);

drop policy if exists booking_assets_delete_members on storage.objects;
create policy booking_assets_delete_members
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'booking-assets'
  and split_part(name, '/', 1) = 'shops'
  and exists (
    select 1
    from public.shop_memberships sm
    where sm.shop_id::text = split_part(name, '/', 2)
      and sm.user_id = auth.uid()
      and sm.is_active = true
      and sm.role in ('owner', 'admin')
  )
);

alter table public.services
add column if not exists category text not null default 'General';

create index if not exists idx_services_shop_category_name
  on public.services(shop_id, category, name);

commit;
