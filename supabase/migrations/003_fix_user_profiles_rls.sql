-- Migration 003: Fix RLS policies for user_profiles to allow:
-- 1. Users to read their own profile (even with null shop_id)
-- 2. New users to create their own profile during signup

-- Allow users to read their own profile regardless of shop_id
drop policy if exists read_own_profile on user_profiles;
create policy read_own_profile on user_profiles for select
  using (auth.uid() = user_id);

-- Allow new users to insert their own profile (needed for OAuth signup)
-- This avoids the chicken-and-egg problem where get_user_shop_id() returns null
drop policy if exists insert_own_profile on user_profiles;
create policy insert_own_profile on user_profiles for insert
  with check (auth.uid() = user_id);

-- Allow users to update their own profile
drop policy if exists update_own_profile on user_profiles;
create policy update_own_profile on user_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
