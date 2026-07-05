-- PT.Control — Schema inicial com Row Level Security
-- Execute no SQL Editor do Supabase Dashboard

-- ============================================================
-- TABELAS
-- ============================================================

create table public.alunos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  telefone text not null default '',
  plano integer not null default 8,
  valor_aula numeric(10,2) not null default 100,
  observacoes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.aula_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  horario text not null,           -- "07:00"
  horario_fim text,                -- "08:00"
  dias integer[] not null,         -- {1,3,5} (0=dom..6=sab)
  aluno_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.registros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  slot_id uuid not null references public.aula_slots(id) on delete cascade,
  data date not null,              -- data da aula original
  horario text not null,
  status text not null default 'pendente'
    check (status in ('pendente','presente','falta','reposicao')),
  reposicao_data date,
  reposicao_horario text,
  falta_observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notification_time text not null default '21:00',
  nome_profissional text not null default '',
  registro_profissional text not null default '',
  updated_at timestamptz not null default now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================

create index idx_alunos_user on public.alunos(user_id);
create index idx_slots_user on public.aula_slots(user_id);
create index idx_registros_user on public.registros(user_id);
create index idx_registros_data on public.registros(data);
create index idx_registros_aluno on public.registros(aluno_id);
create index idx_registros_reposicao on public.registros(reposicao_data) where reposicao_data is not null;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Cada usuário só vê e edita seus próprios dados.

alter table public.alunos enable row level security;
alter table public.aula_slots enable row level security;
alter table public.registros enable row level security;
alter table public.config enable row level security;

-- Alunos
create policy "alunos_select" on public.alunos for select using (auth.uid() = user_id);
create policy "alunos_insert" on public.alunos for insert with check (auth.uid() = user_id);
create policy "alunos_update" on public.alunos for update using (auth.uid() = user_id);
create policy "alunos_delete" on public.alunos for delete using (auth.uid() = user_id);

-- Slots
create policy "slots_select" on public.aula_slots for select using (auth.uid() = user_id);
create policy "slots_insert" on public.aula_slots for insert with check (auth.uid() = user_id);
create policy "slots_update" on public.aula_slots for update using (auth.uid() = user_id);
create policy "slots_delete" on public.aula_slots for delete using (auth.uid() = user_id);

-- Registros
create policy "registros_select" on public.registros for select using (auth.uid() = user_id);
create policy "registros_insert" on public.registros for insert with check (auth.uid() = user_id);
create policy "registros_update" on public.registros for update using (auth.uid() = user_id);
create policy "registros_delete" on public.registros for delete using (auth.uid() = user_id);

-- Config
create policy "config_select" on public.config for select using (auth.uid() = user_id);
create policy "config_insert" on public.config for insert with check (auth.uid() = user_id);
create policy "config_update" on public.config for update using (auth.uid() = user_id);

-- ============================================================
-- TRIGGER: atualiza updated_at automaticamente
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_alunos_updated before update on public.alunos
  for each row execute function public.set_updated_at();

create trigger trg_slots_updated before update on public.aula_slots
  for each row execute function public.set_updated_at();

create trigger trg_registros_updated before update on public.registros
  for each row execute function public.set_updated_at();

create trigger trg_config_updated before update on public.config
  for each row execute function public.set_updated_at();
