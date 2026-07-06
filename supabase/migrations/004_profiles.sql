-- PT.Control — Tabela profiles + trigger de auto-criação no signup

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  telefone text not null default '',
  cidade text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_id on public.profiles(id);

alter table public.profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_select') then
    create policy "profiles_select" on public.profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_insert') then
    create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_update') then
    create policy "profiles_update" on public.profiles for update using (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_profiles_updated') then
    create trigger trg_profiles_updated before update on public.profiles
      for each row execute function public.set_updated_at();
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''));
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created') then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;
