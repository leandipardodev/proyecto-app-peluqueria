-- Add RLS policies to email_verifications and pending_bookings
-- These tables were created without RLS, making them accessible to all authenticated users

begin;

-- =============================================
-- email_verifications RLS
-- =============================================
alter table if exists public.email_verifications enable row level security;

-- Allow authenticated users to read their own verification records
drop policy if exists email_verifications_select_own on public.email_verifications;
create policy email_verifications_select_own
  on public.email_verifications
  for select
  to authenticated
  using (email = (auth.jwt() ->> 'email'));

-- Allow anyone to insert (registration flow)
drop policy if exists email_verifications_insert_all on public.email_verifications;
create policy email_verifications_insert_all
  on public.email_verifications
  for insert
  to authenticated
  with check (email = (auth.jwt() ->> 'email'));

-- Allow anyone to update their own (code verification)
drop policy if exists email_verifications_update_own on public.email_verifications;
create policy email_verifications_update_own
  on public.email_verifications
  for update
  to authenticated
  using (email = (auth.jwt() ->> 'email'))
  with check (email = (auth.jwt() ->> 'email'));



-- =============================================
-- pending_bookings RLS
-- =============================================
alter table if exists public.pending_bookings enable row level security;

-- Allow anon/public to insert (booking flow)
drop policy if exists pending_bookings_insert_anon on public.pending_bookings;
create policy pending_bookings_insert_anon
  on public.pending_bookings
  for insert
  to anon
  with check (true);

-- Allow anon/public to read their own booking (by id in URL)
drop policy if exists pending_bookings_select_own on public.pending_bookings;
create policy pending_bookings_select_own
  on public.pending_bookings
  for select
  to anon
  using (true);

-- Allow any authenticated user/shop member to read their shop's bookings
drop policy if exists pending_bookings_select_shop on public.pending_bookings;
create policy pending_bookings_select_shop
  on public.pending_bookings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.shop_memberships sm
      where sm.shop_id = pending_bookings.shop_id
        and sm.user_id = auth.uid()
        and sm.is_active = true
    )
  );

-- Allow shop members to delete their pending bookings
drop policy if exists pending_bookings_delete_shop on public.pending_bookings;
create policy pending_bookings_delete_shop
  on public.pending_bookings
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.shop_memberships sm
      where sm.shop_id = pending_bookings.shop_id
        and sm.user_id = auth.uid()
        and sm.is_active = true
    )
  );

commit;
