-- Unified schema with English names matching the codebase

-- =========================================
-- ENUMS
-- =========================================
do $$
begin
    create type user_role as enum ('superadmin', 'owner', 'staff', 'customer');
exception when duplicate_object then null;
end $$;

do $$
begin
    create type appointment_status as enum ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null;
end $$;

-- =========================================
-- TABLES
-- =========================================
create table if not exists shops (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    plan_expiry timestamp with time zone not null,
    payment_status boolean default false,
    is_active boolean default true,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists user_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    shop_id uuid references shops(id) on delete set null,
    name text not null,
    email text not null unique,
    phone text,
    role user_role not null default 'customer',
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists services (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid references shops(id) on delete cascade not null,
    name text not null,
    price numeric(10,2) not null check (price >= 0),
    duration_minutes integer not null check (duration_minutes > 0),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists appointments (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid references shops(id) on delete cascade not null,
    customer_id uuid references user_profiles(user_id) on delete set null not null,
    staff_id uuid references user_profiles(user_id) on delete set null,
    service_id uuid references services(id) on delete set null not null,
    start_time timestamp with time zone not null,
    end_time timestamp with time zone not null,
    status appointment_status not null default 'scheduled',
    is_paid boolean default false,
    notes text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists stock (
    id uuid primary key default gen_random_uuid(),
    shop_id uuid references shops(id) on delete cascade not null,
    name text not null,
    quantity integer not null default 0 check (quantity >= 0),
    unit_cost numeric(10,2) not null check (unit_cost >= 0),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists leads_global (
    id uuid primary key default gen_random_uuid(),
    name text,
    email text,
    phone text,
    last_service timestamp with time zone,
    interests text,
    shop_origin_id uuid references shops(id) on delete set null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- =========================================
-- ROW LEVEL SECURITY
-- =========================================
alter table shops enable row level security;
alter table user_profiles enable row level security;
alter table services enable row level security;
alter table appointments enable row level security;
alter table stock enable row level security;
alter table leads_global enable row level security;

-- =========================================
-- HELPER FUNCTIONS
-- =========================================
create or replace function is_superadmin()
returns boolean as $$
begin
    return exists (
        select 1 from user_profiles
        where user_id = auth.uid() and role = 'superadmin'
    );
end;
$$ language plpgsql security definer;

create or replace function get_user_shop_id()
returns uuid as $$
declare
    v_shop_id uuid;
begin
    select shop_id into v_shop_id
    from user_profiles
    where user_id = auth.uid();
    return v_shop_id;
end;
$$ language plpgsql security definer;

-- =========================================
-- RLS POLICIES: shops
-- =========================================
drop policy if exists superadmin_shops on shops;
create policy superadmin_shops on shops for all
    using (is_superadmin()) with check (is_superadmin());

drop policy if exists view_own_shop on shops;
create policy view_own_shop on shops for select
    using (id = get_user_shop_id());

-- =========================================
-- RLS POLICIES: user_profiles
-- =========================================
drop policy if exists superadmin_profiles on user_profiles;
create policy superadmin_profiles on user_profiles for all
    using (is_superadmin()) with check (is_superadmin());

drop policy if exists view_shop_users on user_profiles;
create policy view_shop_users on user_profiles for select
    using (shop_id = get_user_shop_id());

drop policy if exists manage_shop_users on user_profiles;
create policy manage_shop_users on user_profiles for all
    using (shop_id = get_user_shop_id() and role != 'superadmin')
    with check (shop_id = get_user_shop_id() and role != 'superadmin');

-- =========================================
-- RLS POLICIES: services
-- =========================================
drop policy if exists superadmin_services on services;
create policy superadmin_services on services for all
    using (is_superadmin()) with check (is_superadmin());

drop policy if exists view_shop_services on services;
create policy view_shop_services on services for select
    using (shop_id = get_user_shop_id());

drop policy if exists manage_shop_services on services;
create policy manage_shop_services on services for all
    using (shop_id = get_user_shop_id()) with check (shop_id = get_user_shop_id());

-- =========================================
-- RLS POLICIES: appointments
-- =========================================
drop policy if exists superadmin_appointments on appointments;
create policy superadmin_appointments on appointments for all
    using (is_superadmin()) with check (is_superadmin());

drop policy if exists view_shop_appointments on appointments;
create policy view_shop_appointments on appointments for select
    using (exists (
        select 1 from services s
        where s.id = appointments.service_id
        and s.shop_id = get_user_shop_id()
    ));

drop policy if exists manage_shop_appointments on appointments;
create policy manage_shop_appointments on appointments for all
    using (exists (
        select 1 from services s
        where s.id = appointments.service_id
        and s.shop_id = get_user_shop_id()
    ))
    with check (exists (
        select 1 from services s
        where s.id = appointments.service_id
        and s.shop_id = get_user_shop_id()
    ));

-- =========================================
-- RLS POLICIES: stock
-- =========================================
drop policy if exists superadmin_stock on stock;
create policy superadmin_stock on stock for all
    using (is_superadmin()) with check (is_superadmin());

drop policy if exists view_shop_stock on stock;
create policy view_shop_stock on stock for select
    using (shop_id = get_user_shop_id());

drop policy if exists manage_shop_stock on stock;
create policy manage_shop_stock on stock for all
    using (shop_id = get_user_shop_id()) with check (shop_id = get_user_shop_id());

-- =========================================
-- RLS POLICIES: leads_global
-- =========================================
drop policy if exists superadmin_leads on leads_global;
create policy superadmin_leads on leads_global for all
    using (is_superadmin()) with check (is_superadmin());

drop policy if exists view_shop_leads on leads_global;
create policy view_shop_leads on leads_global for select
    using (shop_origin_id = get_user_shop_id());

-- =========================================
-- TRIGGER: sync leads_global from appointments
-- =========================================
create or replace function sync_leads_from_appointments()
returns trigger as $$
declare
    v_customer_name text;
    v_customer_email text;
    v_customer_phone text;
    v_shop_id uuid;
begin
    select up.name, up.email, up.phone, up.shop_id
    into v_customer_name, v_customer_email, v_customer_phone, v_shop_id
    from user_profiles up
    where up.user_id = new.customer_id;

    if v_shop_id is not null then
        insert into leads_global (name, email, phone, last_service, shop_origin_id)
        values (v_customer_name, v_customer_email, v_customer_phone, new.start_time, v_shop_id)
        on conflict do nothing;

        update leads_global
        set last_service = new.start_time,
            updated_at = now()
        where email = v_customer_email
        and shop_origin_id = v_shop_id;
    end if;

    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trigger_sync_leads on appointments;
create trigger trigger_sync_leads
    after insert on appointments
    for each row
    execute function sync_leads_from_appointments();

-- =========================================
-- VIEW: active_sessions
-- =========================================
create or replace view active_sessions as
select
    s.id as shop_id,
    s.name,
    s.plan_expiry,
    s.payment_status,
    count(distinct up.user_id) as total_users,
    count(distinct a.id) as total_appointments
from shops s
left join user_profiles up on up.shop_id = s.id
left join services svc on svc.shop_id = s.id
left join appointments a on a.service_id = svc.id
where s.is_active = true
and s.plan_expiry > now()
group by s.id, s.name, s.plan_expiry, s.payment_status;

-- =========================================
-- INDEXES
-- =========================================
create index if not exists idx_user_profiles_shop_id on user_profiles(shop_id);
create index if not exists idx_services_shop_id on services(shop_id);
create index if not exists idx_appointments_customer_id on appointments(customer_id);
create index if not exists idx_appointments_staff_id on appointments(staff_id);
create index if not exists idx_appointments_service_id on appointments(service_id);
create index if not exists idx_appointments_start_time on appointments(start_time);
create index if not exists idx_appointments_shop_id on appointments(shop_id);
create index if not exists idx_stock_shop_id on stock(shop_id);
create index if not exists idx_leads_email on leads_global(email);
create index if not exists idx_leads_shop_origin on leads_global(shop_origin_id);
