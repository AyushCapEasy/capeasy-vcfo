-- 0006_profile_on_signup.sql — vCFO MIS Engine · M2 (auth)
-- Every auth.users row gets a matching public.profiles row automatically, so user creation
-- (the seeded first admin AND future in-app admin-provisioned analysts) is uniform and the app
-- never has to special-case a missing profile. SECURITY DEFINER so it can write profiles
-- regardless of the caller; search_path pinned (no RLS recursion, no shadowing).

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
