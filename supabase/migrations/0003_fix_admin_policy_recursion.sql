-- The original "profiles: admins read all" / "profiles: admins update all"
-- policies queried public.profiles from within a policy defined on
-- public.profiles itself, which Postgres can't resolve — it re-applies RLS
-- to the subquery and recurses infinitely ("infinite recursion detected in
-- policy for relation \"profiles\"", 42P17). Every profiles SELECT failed
-- as a result, which the client read as "not approved" -> stuck on the
-- pending screen even for approved/admin accounts.
--
-- Fix: route the admin check through a security definer function (same
-- pattern already used correctly for is_approved() in 0001_init.sql) so its
-- internal query bypasses RLS instead of re-triggering it.
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  );
$$;

drop policy if exists "profiles: admins read all" on public.profiles;
create policy "profiles: admins read all" on public.profiles
  for select using (public.is_admin());

drop policy if exists "profiles: admins update all" on public.profiles;
create policy "profiles: admins update all" on public.profiles
  for update using (public.is_admin());
