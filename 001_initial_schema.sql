do $ begin
    create type user_role as enum ('superadmin', 'owner', 'staff', 'customer');
exception when duplicate_object then null;
end $;

do $ begin
    create type appointment_status as enum ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null;
end $;

create table if not exists shops (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    plan_expiry timestamp with time zone not null,
    payment_status boolean default false,
    is_active boolean default true,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);