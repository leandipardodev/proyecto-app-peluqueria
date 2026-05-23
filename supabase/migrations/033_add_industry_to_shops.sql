alter table public.shops
add column if not exists industry text;

update public.shops
set industry = 'peluqueria'
where industry is null;

alter table public.shops
alter column industry set default 'peluqueria';

alter table public.shops
alter column industry set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shops_industry_check'
      and conrelid = 'public.shops'::regclass
  ) then
    alter table public.shops
      add constraint shops_industry_check
      check (industry in ('peluqueria', 'psicologo', 'masajista'));
  end if;
end$$;

create index if not exists shops_industry_idx on public.shops (industry);
