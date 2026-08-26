-- Controle Personal — Dia de cobrança recorrente por aluno
-- Regra financeira: dia do mês (1–31) em que a cobrança recorrente ocorre.
-- Não determina vigência (dataAdesao/dataEncerramento), agenda ou faturamento.
-- Alunos existentes permanecem NULL até preenchimento manual pelo professor.
-- Decisão arquitetural: enquanto não houver entidade Contrato independente,
-- o campo vive em alunos. Se o sistema evoluir para múltiplos contratos ou
-- histórico contratual, migrar para a entidade Contrato.

alter table public.alunos add column if not exists dia_cobranca smallint
  check (dia_cobranca is null or dia_cobranca between 1 and 31);

-- ============================================================
-- RPC — persist_app_data: inclui dia_cobranca no insert de alunos, e passa a
-- validar que o payload trouxe todas as chaves esperadas (como array/objeto)
-- ANTES de apagar qualquer linha. Sem essa guarda, um payload incompleto ou
-- malformado (bug de serialização, cliente com versão antiga, estado
-- corrompido) faria o DELETE incondicional rodar e o INSERT seguinte
-- reinserir zero linhas silenciosamente — apagando a tabela inteira do
-- usuário sem erro. Um array vazio "[]" continua válido (professor com zero
-- alunos, por exemplo); o que é rejeitado é a CHAVE ausente ou de tipo errado.
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

  -- Limpa dados existentes (cascade cuida de filhos)
  delete from public.student_schedules where user_id = v_user_id;
  delete from public.registros where user_id = v_user_id;
  delete from public.pagamentos where user_id = v_user_id;
  delete from public.matriculas where user_id = v_user_id;
  delete from public.ferias_professor where user_id = v_user_id;
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

  -- Insere registros
  insert into public.registros (id, user_id, aluno_id, slot_id, data, horario, status, reposicao_data, reposicao_horario, reposicao_status, falta_observacao, reposicao_excecao, data_original_antecipacao, falta_tipo)
  select
    (r->>'id')::uuid, v_user_id,
    (r->>'alunoId')::uuid, (r->>'slotId')::uuid,
    (r->>'data')::date, r->>'horario', r->>'status',
    (r->>'reposicaoData')::date, r->>'reposicaoHorario', r->>'reposicaoStatus',
    r->>'faltaObservacao',
    (select array_agg(e::text) from jsonb_array_elements_text(r->'reposicaoExcecao') as e),
    (r->>'dataOriginalAntecipacao')::date,
    r->>'faltaTipo'
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
