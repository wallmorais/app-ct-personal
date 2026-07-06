# Checklist de Auditoria — PT.Control

Roteiro manual para reexecutar a auditoria de regressão antes de cada publicação. Cobre os fluxos que dependem de clique/UI (não cobertos pelos testes automatizados em `src/lib/*.test.ts`).

> Testes automatizados equivalentes (lógica pura): rode `npm test`.
> Smoke-test rápido no navegador: veja `scripts/smoke-test.js`.

---

## 1. Preparação

- [ ] `npm test` passa sem falhas inesperadas (os testes marcados "BUG conhecido" devem continuar passando — se algum deles **falhar**, significa que o bug foi corrigido; atualize o teste).
- [ ] `npx tsc --noEmit` sem erros.
- [ ] Abrir o app com `localStorage` limpo (`localStorage.removeItem('pt-control:data')` + reload) para validar o seed inicial.

## 2. Ciclo de vida do aluno

Para cada cenário, verificar Agenda (Hoje), Mês, Alunos e Relatório mostrando os mesmos dados:

- [ ] Aluno novo, sem `dataAdesao` — aparece na agenda imediatamente.
- [ ] Aluno com um período de férias — some da agenda durante o período, some do relatório de presença mas aparece em "Férias dos Alunos".
- [ ] Aluno com múltiplos períodos de férias não contíguos — cada período respeitado isoladamente.
- [ ] Aluno com contrato encerrado (`dataEncerramento` no passado) — some da agenda a partir dessa data.
- [ ] Aluno reativado depois de encerrado (limpar `dataEncerramento`) — **atenção ao BUG-04**: se `dataAdesao` não for atualizada, o período em que deveria estar inativo volta a contar como ativo. Verificar manualmente a data do "gap" na agenda (navegar para um mês/dia dentro do período que deveria estar inativo).
- [ ] Aluno compartilhando horário com outro(s) aluno(s), com dias da semana diferentes — editar um não deve alterar os dias do outro.
- [ ] Cadastrar 2 períodos de férias sobrepostos para o mesmo aluno (BUG-06, corrigido) — deve abrir o diálogo "Período sobreposto" com opções Cancelar/Substituir; "Substituir" remove o período antigo e mantém só o novo.
- [ ] Cadastrar férias sobrepostas para alunos **diferentes** — deve permitir livremente (a validação é por aluno).

## 3. Financeiro / Relatórios

- [ ] Dois alunos com `valorAula` diferentes no mesmo horário — faturamento calculado corretamente para cada um.
- [ ] Falta simples — conta em "Faltas", não conta em faturamento.
- [ ] Reposição marcada "Concluída" — conta em "Presenças" e no faturamento pela data da reposição, não pela data original.
- [ ] Reposição marcada "Não Compareceu" (BUG-05, corrigido) — conta como falta em "Faltas" no relatório do aluno e na visão geral.
- [ ] Reposição "Cancelada" — não conta como presença nem falta em nenhuma métrica, mas permanece visível no histórico/filtro "Canceladas".
- [ ] Alternar entre "Mês" e "Período" no Relatório — números batem com a Agenda para o mesmo intervalo.
- [ ] Números de Agenda, Relatório e Financeiro sempre idênticos para o mesmo período/aluno.

## 4. Reposições — regras de validação e ciclo de vida

- [ ] Data de reposição anterior à data da falta — bloqueado, com mensagem clara.
- [ ] Data de reposição anterior à `dataAdesao` do aluno — bloqueado.
- [ ] Data de reposição posterior à `dataEncerramento` do aluno — bloqueado.
- [ ] Data de reposição durante férias do professor — aviso + "Confirmar Exceção"; ao confirmar, `reposicaoExcecao` inclui `ferias_professor`.
- [ ] Data de reposição durante férias do aluno — aviso + "Confirmar Exceção"; ao confirmar, `reposicaoExcecao` inclui `ferias_aluno`.
- [ ] Aluno de férias **no dia da aula original** — botão "Reposição (exceção)" aparece e abre o modal normalmente (regressão do fix desta sessão).
- [ ] Reposição nova nasce com `reposicaoStatus: 'pendente'` e aparece na Agenda do dia marcado e na aba Reposições, filtro "Pendentes".
- [ ] Marcar reposição pendente como "Concluída" — some da Agenda (fica só no histórico/Relatório), aparece no filtro "Concluídas".
- [ ] Marcar reposição pendente como "Não Compareceu" — mesmo comportamento de sumir da Agenda, aparece no filtro "Não Compareceu", conta como falta no Relatório.
- [ ] "Cancelar" uma reposição pendente — some da Agenda, aparece no filtro "Canceladas", não conta em nenhuma métrica financeira.
- [ ] "Reagendar" uma reposição pendente — abre o modal de nova data mantendo a mesma validação de exceções.

## 5. Exclusões

- [ ] Excluir aluno — remove `schedules`, `slots` órfãos, `registros` e `matriculas` (inspecionar `localStorage['pt-control:data']`).
- [ ] Excluir período de férias do professor — não deixa referência quebrada em nenhuma tela.
- [ ] Remover uma reposição agendada (botão de lixeira no modal) — volta o registro para "Pendente", sem sobra de `reposicaoData`/`reposicaoExcecao`.

## 6. Edge cases de data

- [ ] Navegar de dezembro para janeiro (virada de ano) na Agenda e no Relatório.
- [ ] Navegar por fevereiro em ano bissexto (ex: 2028) e não bissexto (ex: 2026) — 29/02 só existe no bissexto.
- [ ] Cadastrar aluno com dias em uma semana que cruza virada de mês/ano.

## 7. Navegação

- [ ] Criar/editar/excluir aluno e navegar para "Hoje" sem recarregar a página — mudança reflete imediatamente.
- [ ] Alternar entre todas as abas (Hoje → Reposições → Alunos → Relatório → Config) sem erros no console.

## 8. UX

- [ ] Nenhum botão ou informação duplicada aparente nas telas revisadas.
- [ ] Fluxo de reposição com exceção é compreensível sem explicação adicional.

---

## Bugs conhecidos em aberto (ver relatório de auditoria completo na conversa)

| ID | Título | Severidade |
|---|---|---|
| BUG-04 | Reativação de aluno sem atualizar `dataAdesao` preenche retroativamente o "gap" de inatividade como ATIVO | Alta |
| ~~BUG-05~~ | ~~Falta na aula de reposição não é contabilizada em nenhuma métrica~~ — **Corrigido**: novo campo `reposicaoStatus` (`pendente`/`concluida`/`cancelada`/`nao_compareceu`) no `Registro`; `billing.ts` conta falta quando `reposicaoStatus === 'nao_compareceu'` | ~~Média-Alta~~ |
| ~~BUG-06~~ | ~~Sem validação de sobreposição de férias do aluno~~ — **Corrigido**: `vacationsOverlap`/`findOverlappingVacation` generalizadas em `periods.ts` e reaplicadas em `AlunoFormModal.tsx`, com diálogo "Substituir" (mesmo padrão já usado em férias do professor) | ~~Baixa-Média~~ |
| ~~BUG-07~~ | ~~Schema SQL do Supabase desatualizado~~ — **Corrigido**: 3 migrations (001 schema completo, 002 tabelas faltantes, 003 ALTER TABLE + RPC atômico `persist_app_data`). Sincronização ativa via `supabaseRepo.ts` com migração automática localStorage→Supabase no primeiro login. | ~~Média~~ |
