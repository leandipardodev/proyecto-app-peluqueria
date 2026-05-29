-- Add a meaningful unique constraint to leads_global so ON CONFLICT works
-- Using (email, shop_id) because the same person shouldn't be a lead twice for the same shop

begin;

-- Remove duplicates before adding constraint (keep the earliest entry per email+shop)
delete from public.leads_global
where ctid in (
  select a.ctid
  from public.leads_global a
  inner join public.leads_global b
    on a.email = b.email
    and (a.shop_id = b.shop_id or (a.shop_id is null and b.shop_id is null))
    and a.ctid > b.ctid
  where a.email is not null
);

-- Add unique partial index (only for non-null emails)
drop index if exists idx_leads_global_email_shop;
create unique index if not exists idx_leads_global_email_shop
  on public.leads_global (email, shop_id)
  where email is not null;

commit;
