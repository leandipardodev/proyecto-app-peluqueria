-- Add pay_at_shop column to services and shops tables
alter table services add column pay_at_shop boolean not null default false;
alter table shops add column pay_at_shop boolean not null default false;
