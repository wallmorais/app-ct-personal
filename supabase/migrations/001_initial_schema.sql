-- PT.Control — Schema completo com Row Level Security
-- Aplicado automaticamente via integração Supabase + GitHub

-- ============================================================
-- FUNÇÃO AUXILIAR: updated_at automático
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

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
  aniversario date,
  objetivo text,
  restricoes text,
  data_adesao date,
  data_encerramento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.aula_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  horario text not null,
  horario_fim text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  slot_id uuid not null references public.aula_slots(id) on delete cascade,
  dias integer[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.registros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  slot_id uuid not null references public.aula_slots(id) on delete cascade,
  data date not null,
  horario text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'presente', 'falta', 'reposicao')),
  reposicao_data date,
  reposicao_horario text,
  reposicao_status text
    check (reposicao_status in ('pendente', 'concluida', 'cancelada', 'nao_compareceu')),
  falta_observacao text,
  reposicao_excecao text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  mes text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'pago', 'atrasado')),
  data_pagamento date,
  valor numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ferias_professor (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_inicio date not null,
  data_fim date not null,
  observacao text,
  created_at timestamptz not null default now()
);

create table public.matriculas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  data_inicio date not null,
  data_fim date,
  tipo text not null check (tipo in ('ATIVO', 'FERIAS', 'INATIVO')),
  observacao text,
  created_at timestamptz not null default now()
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
create index idx_schedules_user on public.student_schedules(user_id);
create index idx_schedules_aluno on public.student_schedules(aluno_id);
create index idx_schedules_slot on public.student_schedules(slot_id);
create index idx_registros_user on public.registros(user_id);
create index idx_registros_data on public.registros(data);
create index idx_registros_aluno on public.registros(aluno_id);
create index idx_registros_reposicao on public.registros(reposicao_data) where reposicao_data is not null;
create index idx_pagamentos_user on public.pagamentos(user_id);
create index idx_pagamentos_aluno on public.pagamentos(aluno_id);
create index idx_pagamentos_mes on public.pagamentos(mes);
create index idx_ferias_user on public.ferias_professor(user_id);
create index idx_ferias_periodo on public.ferias_professor(data_inicio, data_fim);
create index idx_matriculas_user on public.matriculas(user_id);
create index idx_matriculas_aluno on public.matriculas(aluno_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table public.alunos enable row level security;
alter table public.aula_slots enable row level security;
alter table public.student_schedules enable row level security;
alter table public.registros enable row level security;
alter table public.pagamentos enable row level security;
alter table public.ferias_professor enable row level security;
alter table public.matriculas enable row level security;
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

-- Student Schedules
create policy "schedules_select" on public.student_schedules for select using (auth.uid() = user_id);
create policy "schedules_insert" on public.student_schedules for insert with check (auth.uid() = user_id);
create policy "schedules_update" on public.student_schedules for update using (auth.uid() = user_id);
create policy "schedules_delete" on public.student_schedules for delete using (auth.uid() = user_id);

-- Registros
create policy "registros_select" on public.registros for select using (auth.uid() = user_id);
create policy "registros_insert" on public.registros for insert with check (auth.uid() = user_id);
create policy "registros_update" on public.registros for update using (auth.uid() = user_id);
create policy "registros_delete" on public.registros for delete using (auth.uid() = user_id);

-- Pagamentos
create policy "pagamentos_select" on public.pagamentos for select using (auth.uid() = user_id);
create policy "pagamentos_insert" on public.pagamentos for insert with check (auth.uid() = user_id);
create policy "pagamentos_update" on public.pagamentos for update using (auth.uid() = user_id);
create policy "pagamentos_delete" on public.pagamentos for delete using (auth.uid() = user_id);

-- Férias Professor
create policy "ferias_select" on public.ferias_professor for select using (auth.uid() = user_id);
create policy "ferias_insert" on public.ferias_professor for insert with check (auth.uid() = user_id);
create policy "ferias_update" on public.ferias_professor for update using (auth.uid() = user_id);
create policy "ferias_delete" on public.ferias_professor for delete using (auth.uid() = user_id);

-- Matrículas
create policy "matriculas_select" on public.matriculas for select using (auth.uid() = user_id);
create policy "matriculas_insert" on public.matriculas for insert with check (auth.uid() = user_id);
create policy "matriculas_update" on public.matriculas for update using (auth.uid() = user_id);
create policy "matriculas_delete" on public.matriculas for delete using (auth.uid() = user_id);

-- Config
create policy "config_select" on public.config for select using (auth.uid() = user_id);
create policy "config_insert" on public.config for insert with check (auth.uid() = user_id);
create policy "config_update" on public.config for update using (auth.uid() = user_id);

-- ============================================================
-- TRIGGERS: updated_at automático
-- ============================================================

create trigger trg_alunos_updated before update on public.alunos
  for each row execute function public.set_updated_at();

create trigger trg_slots_updated before update on public.aula_slots
  for each row execute function public.set_updated_at();

create trigger trg_schedules_updated before update on public.student_schedules
  for each row execute function public.set_updated_at();

create trigger trg_registros_updated before update on public.registros
  for each row execute function public.set_updated_at();

create trigger trg_pagamentos_updated before update on public.pagamentos
  for each row execute function public.set_updated_at();

create trigger trg_config_updated before update on public.config
  for each row execute function public.set_updated_at();
