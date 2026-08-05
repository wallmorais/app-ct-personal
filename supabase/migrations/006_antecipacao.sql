-- PT.Control — Suporte a Antecipação de Aula
-- Reutiliza o mesmo campo reposicao_data/reposicao_horario/reposicao_status já
-- existente em `registros`. O tipo (Reposição vs Antecipação) é derivado por
-- comparação de datas em código, nunca persistido. Este migration adiciona
-- apenas a coluna necessária para preservar o histórico de uma tentativa de
-- antecipação que falhou (aluno não compareceu) e foi remarcada para outra data.

alter table public.registros add column if not exists data_original_antecipacao date;

-- ============================================================
-- RPC — persist_app_data: inclui a nova coluna no insert de registros
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

  -- Limpa dados existentes (cascade cuida de filhos)
  delete from public.student_schedules where user_id = v_user_id;
  delete from public.registros where user_id = v_user_id;
  delete from public.pagamentos where user_id = v_user_id;
  delete from public.matriculas where user_id = v_user_id;
  delete from public.ferias_professor where user_id = v_user_id;
  delete from public.aula_slots where user_id = v_user_id;
  delete from public.alunos where user_id = v_user_id;

  -- Insere alunos
  insert into public.alunos (id, user_id, nome, telefone, plano, valor_aula, observacoes, aniversario, objetivo, restricoes, data_adesao, data_encerramento)
  select
    (r->>'id')::uuid, v_user_id,
    r->>'nome', r->>'telefone',
    (r->>'plano')::int, (r->>'valorAula')::numeric,
    coalesce(r->>'observacoes', ''),
    (r->>'aniversario')::date, r->>'objetivo', r->>'restricoes',
    (r->>'dataAdesao')::date, (r->>'dataEncerramento')::date
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

  -- Insere registros
  insert into public.registros (id, user_id, aluno_id, slot_id, data, horario, status, reposicao_data, reposicao_horario, reposicao_status, falta_observacao, reposicao_excecao, data_original_antecipacao)
  select
    (r->>'id')::uuid, v_user_id,
    (r->>'alunoId')::uuid, (r->>'slotId')::uuid,
    (r->>'data')::date, r->>'horario', r->>'status',
    (r->>'reposicaoData')::date, r->>'reposicaoHorario', r->>'reposicaoStatus',
    r->>'faltaObservacao',
    (select array_agg(e::text) from jsonb_array_elements_text(r->'reposicaoExcecao') as e),
    (r->>'dataOriginalAntecipacao')::date
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
