-- PT.Control — Tabelas faltantes (criadas após execução parcial de 001)

create table if not exists public.student_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  slot_id uuid not null references public.aula_slots(id) on delete cascade,
  dias integer[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pagamentos (
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

create table if not exists public.ferias_professor (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_inicio date not null,
  data_fim date not null,
  observacao text,
  created_at timestamptz not null default now()
);

create table if not exists public.matriculas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  data_inicio date not null,
  data_fim date,
  tipo text not null check (tipo in ('ATIVO', 'FERIAS', 'INATIVO')),
  observacao text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ÍNDICES
-- ============================================================

create index if not exists idx_schedules_user on public.student_schedules(user_id);
create index if not exists idx_schedules_aluno on public.student_schedules(aluno_id);
create index if not exists idx_schedules_slot on public.student_schedules(slot_id);
create index if not exists idx_pagamentos_user on public.pagamentos(user_id);
create index if not exists idx_pagamentos_aluno on public.pagamentos(aluno_id);
create index if not exists idx_pagamentos_mes on public.pagamentos(mes);
create index if not exists idx_ferias_user on public.ferias_professor(user_id);
create index if not exists idx_ferias_periodo on public.ferias_professor(data_inicio, data_fim);
create index if not exists idx_matriculas_user on public.matriculas(user_id);
create index if not exists idx_matriculas_aluno on public.matriculas(aluno_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.student_schedules enable row level security;
alter table public.pagamentos enable row level security;
alter table public.ferias_professor enable row level security;
alter table public.matriculas enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'student_schedules' and policyname = 'schedules_select') then
    create policy "schedules_select" on public.student_schedules for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'student_schedules' and policyname = 'schedules_insert') then
    create policy "schedules_insert" on public.student_schedules for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'student_schedules' and policyname = 'schedules_update') then
    create policy "schedules_update" on public.student_schedules for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'student_schedules' and policyname = 'schedules_delete') then
    create policy "schedules_delete" on public.student_schedules for delete using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'pagamentos' and policyname = 'pagamentos_select') then
    create policy "pagamentos_select" on public.pagamentos for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pagamentos' and policyname = 'pagamentos_insert') then
    create policy "pagamentos_insert" on public.pagamentos for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pagamentos' and policyname = 'pagamentos_update') then
    create policy "pagamentos_update" on public.pagamentos for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pagamentos' and policyname = 'pagamentos_delete') then
    create policy "pagamentos_delete" on public.pagamentos for delete using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ferias_professor' and policyname = 'ferias_select') then
    create policy "ferias_select" on public.ferias_professor for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ferias_professor' and policyname = 'ferias_insert') then
    create policy "ferias_insert" on public.ferias_professor for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ferias_professor' and policyname = 'ferias_update') then
    create policy "ferias_update" on public.ferias_professor for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ferias_professor' and policyname = 'ferias_delete') then
    create policy "ferias_delete" on public.ferias_professor for delete using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'matriculas' and policyname = 'matriculas_select') then
    create policy "matriculas_select" on public.matriculas for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'matriculas' and policyname = 'matriculas_insert') then
    create policy "matriculas_insert" on public.matriculas for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'matriculas' and policyname = 'matriculas_update') then
    create policy "matriculas_update" on public.matriculas for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'matriculas' and policyname = 'matriculas_delete') then
    create policy "matriculas_delete" on public.matriculas for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ============================================================
-- TRIGGERS: updated_at automático
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_schedules_updated') then
    create trigger trg_schedules_updated before update on public.student_schedules
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_pagamentos_updated') then
    create trigger trg_pagamentos_updated before update on public.pagamentos
      for each row execute function public.set_updated_at();
  end if;
end $$;
