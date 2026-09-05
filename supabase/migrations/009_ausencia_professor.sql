-- Controle Personal — Ausência do Professor
-- Ausência pontual de DIA INTEIRO (não por horário/slot). Distinta de Férias
-- (período planejado): uma única ausência afeta automaticamente todas as
-- aulas daquele dia, de todos os alunos, sem precisar cadastrar por aluno.
-- Não altera dados existentes: nova tabela isolada + coluna nullable/default.

-- ============================================================
-- 1. Nova tabela: ausencias_professor
-- ============================================================
create table if not exists public.ausencias_professor (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data date not null,
  motivo text not null check (motivo in ('doenca','compromisso_pessoal','imprevisto','outro')),
  observacao text,
  created_at timestamptz default now(),
  unique(user_id, data)
);

alter table public.ausencias_professor enable row level security;

create policy "Users manage own absences"
  on public.ausencias_professor for all
  using (auth.uid() = user_id);

-- ============================================================
-- 2. Nova coluna em registros — falta por ausência do professor
-- ============================================================
alter table public.registros
  add column if not exists falta_professor boolean default false;

-- ============================================================
-- 3. RPC — persist_app_data: adiciona guard + delete/insert de
-- ausencias_professor, e falta_professor no insert de registros.
-- Guards e lógica existentes permanecem inalterados.
-- ============================================================

create or replace function public.persist_app_data(payload jsonb)
returns void
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not (payload ? 'alunos') or jsonb_typeof(payload->'alunos') <> 'array' then
    raise exception 'Payload inválido: "alunos" ausente ou não é array';
  end if;
  if not (payload ? 'slots') or jsonb_typeof(payload->'slots') <> 'array' then
    raise exception 'Payload inválido: "slots" ausente ou não é array';
  end if;
  if not (payload ? 'schedules') or jsonb_typeof(payload->'schedules') <> 'array' then
    raise exception 'Payload inválido: "schedules" ausente ou não é array';
  end if;
  if not (payload ? 'registros') or jsonb_typeof(payload->'registros') <> 'array' then
    raise exception 'Payload inválido: "registros" ausente ou não é array';
  end if;
  if not (payload ? 'pagamentos') or jsonb_typeof(payload->'pagamentos') <> 'array' then
    raise exception 'Payload inválido: "pagamentos" ausente ou não é array';
  end if;
  if not (payload ? 'feriasProfessor') or jsonb_typeof(payload->'feriasProfessor') <> 'array' then
    raise exception 'Payload inválido: "feriasProfessor" ausente ou não é array';
  end if;
  if not (payload ? 'matriculas') or jsonb_typeof(payload->'matriculas') <> 'array' then
    raise exception 'Payload inválido: "matriculas" ausente ou não é array';
  end if;
  if not (payload ? 'config') or jsonb_typeof(payload->'config') <> 'object' then
    raise exception 'Payload inválido: "config" ausente ou não é objeto';
  end if;
  -- Novo guard: ausenciasProfessor
  if not (payload ? 'ausenciasProfessor') or jsonb_typeof(payload->'ausenciasProfessor') <> 'array' then
    raise exception 'Payload inválido: "ausenciasProfessor" ausente ou não é array';
  end if;

  -- Limpa dados existentes (cascade cuida de filhos)
  delete from public.student_schedules where user_id = v_user_id;
  delete from public.registros where user_id = v_user_id;
  delete from public.pagamentos where user_id = v_user_id;
  delete from public.matriculas where user_id = v_user_id;
  delete from public.ferias_professor where user_id = v_user_id;
  delete from public.ausencias_professor where user_id = v_user_id;
  delete from public.aula_slots where user_id = v_user_id;
  delete from public.alunos where user_id = v_user_id;

  -- Insere alunos
  insert into public.alunos (id, user_id, nome, telefone, plano, valor_aula, observacoes, aniversario, objetivo, restricoes, data_adesao, data_encerramento, dia_cobranca)
  select
    (r->>'id')::uuid, v_user_id,
    r->>'nome', r->>'telefone',
    (r->>'plano')::int, (r->>'valorAula')::numeric,
    coalesce(r->>'observacoes', ''),
    (r->>'aniversario')::date, r->>'objetivo', r->>'restricoes',
    (r->>'dataAdesao')::date, (r->>'dataEncerramento')::date,
    (r->>'diaCobranca')::smallint
  from jsonb_array_elements(payload->'alunos') as r;

  -- Insere slots
  insert into public.aula_slots (id, user_id, horario, horario_fim)
  select
    (r->>'id')::uuid, v_user_id,
    r->>'horario', r->>'horarioFim'
  from jsonb_array_elements(payload->'slots') as r;

  -- Insere schedules
  insert into public.student_schedules (id, user_id, aluno_id, slot_id, dias)
  select
    (r->>'id')::uuid, v_user_id,
    (r->>'alunoId')::uuid, (r->>'slotId')::uuid,
    (select array_agg(d::int) from jsonb_array_elements_text(r->'dias') as d)
  from jsonb_array_elements(payload->'schedules') as r;

  -- Insere registros (+ falta_professor)
  insert into public.registros (id, user_id, aluno_id, slot_id, data, horario, status, reposicao_data, reposicao_horario, reposicao_status, falta_observacao, reposicao_excecao, data_original_antecipacao, falta_tipo, falta_professor)
  select
    (r->>'id')::uuid, v_user_id,
    (r->>'alunoId')::uuid, (r->>'slotId')::uuid,
    (r->>'data')::date, r->>'horario', r->>'status',
    (r->>'reposicaoData')::date, r->>'reposicaoHorario', r->>'reposicaoStatus',
    r->>'faltaObservacao',
    (select array_agg(e::text) from jsonb_array_elements_text(r->'reposicaoExcecao') as e),
    (r->>'dataOriginalAntecipacao')::date,
    r->>'faltaTipo',
    coalesce((r->>'faltaProfessor')::boolean, false)
  from jsonb_array_elements(payload->'registros') as r;

  -- Insere pagamentos
  insert into public.pagamentos (user_id, aluno_id, mes, status, data_pagamento, valor)
  select
    v_user_id,
    (r->>'alunoId')::uuid, r->>'mes', r->>'status',
    (r->>'dataPagamento')::date, (r->>'valor')::numeric
  from jsonb_array_elements(payload->'pagamentos') as r;

  -- Insere férias professor
  insert into public.ferias_professor (id, user_id, data_inicio, data_fim, observacao)
  select
    (r->>'id')::uuid, v_user_id,
    (r->>'dataInicio')::date, (r->>'dataFim')::date, r->>'observacao'
  from jsonb_array_elements(payload->'feriasProfessor') as r;

  -- Insere ausências professor
  insert into public.ausencias_professor (id, user_id, data, motivo, observacao)
  select
    (r->>'id')::uuid, v_user_id,
    (r->>'data')::date, r->>'motivo', r->>'observacao'
  from jsonb_array_elements(payload->'ausenciasProfessor') as r;

  -- Insere matrículas
  insert into public.matriculas (id, user_id, aluno_id, data_inicio, data_fim, tipo, observacao)
  select
    (r->>'id')::uuid, v_user_id,
    (r->>'alunoId')::uuid, (r->>'dataInicio')::date,
    (r->>'dataFim')::date, r->>'tipo', r->>'observacao'
  from jsonb_array_elements(payload->'matriculas') as r;

  -- Upsert config
  insert into public.config (user_id, notification_time, nome_profissional, registro_profissional)
  values (
    v_user_id,
    coalesce(payload->'config'->>'notificationTime', '21:00'),
    coalesce(payload->'config'->>'nomeProfissional', ''),
    coalesce(payload->'config'->>'registroProfissional', '')
  )
  on conflict (user_id) do update set
    notification_time = excluded.notification_time,
    nome_profissional = excluded.nome_profissional,
    registro_profissional = excluded.registro_profissional;
end;
$$;
