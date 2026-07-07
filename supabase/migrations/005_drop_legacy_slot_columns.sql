-- PT.Control — Remove colunas legadas de aula_slots
--
-- CAUSA RAIZ da perda de dados: a tabela aula_slots foi criada por um schema
-- antigo com as colunas `dias` (integer[] NOT NULL) e `aluno_ids`, herdadas do
-- modelo AulaSlot.dias/alunoIds. Esse modelo foi substituído por
-- student_schedules. Como o RPC persist_app_data insere slots apenas com
-- (id, user_id, horario, horario_fim), a coluna NOT NULL `dias` ficava nula e
-- abortava toda a transação — nenhum dado era persistido.
--
-- Estas colunas não são mais usadas em lugar nenhum; podem ser removidas.

alter table public.aula_slots drop column if exists dias;
alter table public.aula_slots drop column if exists aluno_ids;
alter table public.aula_slots drop column if exists alunoids;

-- Defesa extra: caso alguma coluna legada persista em outra base, garante que
-- não bloqueie inserts. (No-op se a coluna já foi removida acima.)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'aula_slots' and column_name = 'dias'
  ) then
    alter table public.aula_slots alter column dias drop not null;
  end if;
end $$;
