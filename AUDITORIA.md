# Painel de Controle Técnico — Ponto de Controle Personal

> Este documento é o painel de controle técnico vivo do projeto. Ele registra o
> estado real do sistema, o histórico de bugs e melhorias, as pendências em
> aberto e os guardrails que qualquer agente de desenvolvimento (humano ou IA,
> incluindo Codex) deve seguir antes de alterar código em produção.
>
> Auditoria complementar específica da tela de Configurações:
> [`AUDITORIA_CONFIG.md`](./AUDITORIA_CONFIG.md) — mantida como documento
> independente, não duplicada aqui.

---

## 1. Objetivo e Escopo da Auditoria

Este documento cobre o ciclo de vida completo do PT.Control:

- **Estado real do sistema** — resultado da última validação de testes, typecheck, build e CI conhecida.
- **Bugs** — histórico de defeitos identificados, sua correção e a evidência que comprova a correção.
- **Melhorias** — entregas técnicas (performance, infraestrutura, cobertura de testes) e sua evidência de validação.
- **Pendências** — o que ainda não foi decidido ou implementado, com prioridade e risco.
- **Guardrails operacionais** — regras que protegem os dados reais de produção contra alterações destrutivas ou não intencionais.
- **Checklist manual de regressão** — roteiro de verificação por clique/UI para fluxos que os testes automatizados (`src/lib/*.test.ts`, `src/components/*.test.tsx`) não cobrem sozinhos.

Este documento **não substitui** os testes automatizados (`npm test`) nem a auditoria detalhada da `ConfigView` (`AUDITORIA_CONFIG.md`) — ele agrega o panorama geral e aponta para os documentos/testes específicos como evidência.

---

## 2. Estado Atual do Projeto

Última validação conhecida — commit `857b8a2` ("B4.2: testes de integração UI→onSave para AlunoFormModal") e commit imediatamente anterior `0b3c708`, ambos de 2026-09-14:

| Verificação | Resultado |
|---|---|
| Testes (`npm test`) | ✅ 148/148 passando |
| TypeScript (`npx tsc --noEmit`) | ✅ OK, sem erros |
| Build (`npm run build`) | ✅ OK |
| CI `validate` (GitHub Actions, M4) | ✅ success |
| Cloudflare Pages (check de deploy) | ✅ success |
| Workers Builds | ✅ success |
| Supabase Preview (check de CI) | ❌ Falha — observada também no commit imediatamente anterior (`0b3c708`), portanto **pré-existente**, não é uma regressão introduzida por B4.2. Causa raiz **não investigada** nesta tarefa. |

**Observação de infraestrutura:** a falha do `Supabase Preview` é a única anomalia conhecida no pipeline de CI/deploy no momento. Ver seção 6 (Pendências) para o encaminhamento.

---

## 3. Regras Críticas para Agentes de Desenvolvimento

Guardrails obrigatórios para qualquer agente (humano ou IA) que for alterar este projeto:

1. **Preservar dados existentes.** A prioridade absoluta é não perder dados de produção — nenhuma tarefa justifica risco de perda de dados de alunos, registros, pagamentos ou matrículas reais.
2. **Nunca executar `DROP`, `TRUNCATE` ou `DELETE` destrutivo em produção sem autorização explícita** do responsável pelo projeto.
3. **Não alterar migrations já aplicadas** sem análise cuidadosa de impacto — migrations são histórico imutável do schema; correções vão em uma nova migration.
4. **Não alterar políticas de RLS (Row Level Security)** sem revisão explícita — RLS é a única barreira entre os dados de diferentes professores/contas.
5. **Não modificar lógica de persistência** (`localStorage`, Supabase, `persist_app_data`) como efeito colateral de uma tarefa não relacionada a persistência.
6. **Validar testes, typecheck e build** (`npm test`, `npx tsc --noEmit`, `npm run build`) antes de considerar qualquer tarefa de código concluída, quando aplicável ao escopo da tarefa.
7. **Não misturar refatorações não solicitadas** com a tarefa em andamento — mudanças fora de escopo devem ser propostas separadamente, não embutidas.
8. **Preservar compatibilidade com dados existentes** — backups antigos e formatos legados devem continuar funcionando (ver M2); nenhuma migração de dados deve quebrar contas já em produção.
9. **Nunca fazer commit, push ou deploy sem aprovação explícita** do usuário responsável pelo projeto.

---

## 4. Bugs Conhecidos

### Corrigidos

| ID | Problema | Solução Aplicada | Evidência | Status |
|---|---|---|---|---|
| BUG-04 | Reativação de aluno sem atualizar `dataAdesao` preenchia retroativamente o "gap" de inatividade como ATIVO | Reativação agora cria uma **nova etapa (matrícula)** explícita a partir da data informada, em vez de sobrescrever `dataAdesao`; o período entre o encerramento e a nova etapa permanece corretamente inativo | Fluxo "Reativar aluno" em `AlunoFormModal.tsx` + suíte de testes "BUG-04" em `periods.test.ts` | ✅ Corrigido |
| BUG-05 | Falta na aula de reposição não era contabilizada em nenhuma métrica | Novo campo `reposicaoStatus` (`pendente`/`concluida`/`cancelada`/`nao_compareceu`) no `Registro`; `billing.ts` conta falta quando `reposicaoStatus === 'nao_compareceu'` | `billing.test.ts` | ✅ Corrigido |
| BUG-06 | Sem validação de sobreposição de férias do aluno | `vacationsOverlap`/`findOverlappingVacation` generalizadas em `periods.ts` e reaplicadas em `AlunoFormModal.tsx`, com diálogo "Substituir" (mesmo padrão já usado em férias do professor) | `periods.test.ts` | ✅ Corrigido |
| BUG-07 | Schema SQL do Supabase desatualizado | 3 migrations (001 schema completo, 002 tabelas faltantes, 003 `ALTER TABLE` + RPC atômico `persist_app_data`). Sincronização ativa via `supabaseRepo.ts` com migração automática localStorage→Supabase no primeiro login | Migrations aplicadas + `supabaseRepo.ts` | ✅ Corrigido |

### Abertos

Nenhum bug aberto registrado na auditoria atual.

> Riscos de UX/segurança específicos da tela `ConfigView` (ex.: importação de backup sem confirmação, troca de senha/e-mail sem reautenticação) **não são bugs de código** — são riscos de design já catalogados separadamente em [`AUDITORIA_CONFIG.md`](./AUDITORIA_CONFIG.md) (Riscos 1–5) e não são duplicados aqui.

---

## 5. Melhorias Implementadas

| ID | Melhoria / Descrição Técnica | Evidência de Validação | Status |
|---|---|---|---|
| M1 | `fetchAppData` / `isRemoteEmpty` — heurística de conta vazia corrigida para cobrir as 9 coleções do `AppData` (antes verificava só 4, causando falso "vazio" e risco de sobrescrita de dados remotos) | 11 testes em `supabaseRepo.test.ts` | ✅ Concluído |
| M2 | `importData` — validação estrita de tipo (array/objeto, não só truthiness) nas 9 chaves do backup, com migração automática de backups legados (`normalizeAppData` compartilhado com `loadData`) | 15 testes em `storage.test.ts` | ✅ Concluído |
| M4 | CI via GitHub Actions (`.github/workflows/ci.yml`): instala dependências, roda testes, typecheck e build a cada `push`/`pull_request` para `main` | Job `validate` = success no commit `857b8a2` | ✅ Concluído |
| A1 | Exclusão segura de aluno — `removeAlunoData` remove `schedules`, `slots` órfãos, `registros`, `pagamentos` e `matriculas` associados, evitando violação de FK no Supabase | Suíte "A1" em `periods.test.ts` | ✅ Concluído |
| A3 | Preservação de `faltaTipo` — `computeUpdatedRegistro` não apaga mais o campo em atualizações subsequentes que não o informam explicitamente | Suíte "A3" (`computeUpdatedRegistro`) em `periods.test.ts` | ✅ Concluído |
| B1 | Code splitting das 5 views principais via `React.lazy` + `Suspense` em `App.tsx` (AuthView permanece estática, necessária antes da autenticação) | Bundle inicial reduzido de 518.82 kB → 398.63 kB (-23%); warning de chunk >500 kB eliminado; 16 chunks no build | ✅ Concluído |
| B4.1 | Testes de componente — `AgendaView` (marcar presença, falta avisada/não avisada, abrir modal de reposição); ambiente `jsdom` isolado por arquivo via `// @vitest-environment jsdom`, ambiente padrão (`node`) preservado para os testes de `lib/` | 7 testes em `AgendaView.test.tsx`; suíte total subiu de 135 → 142 testes | ✅ Concluído |
| B4.2 | Testes de componente — `AlunoFormModal` (criação com agenda, edição reconstruindo agenda via `buildInitialAgenda`, bloqueio de nome vazio/horário inválido, bloqueio de exclusão de etapa com aula registrada, fluxo de reativação) | 6 testes em `AlunoFormModal.test.tsx`; suíte total subiu de 142 → 148 testes; CI `validate` = success | ✅ Concluído |

---

## 6. Pendências Atuais e Próximos Passos

| ID | Pendência | Prioridade | Risco | Próxima Ação |
|---|---|---|---|---|
| B4.3+ | Próximos componentes de teste de componente (candidatos já identificados em auditoria anterior: `AuthView`, `ReposicoesView`) | Média | Baixo — a lógica de negócio subjacente já está coberta por `periods.test.ts`/`billing.test.ts`; a lacuna é só de integração UI | Aguardar decisão do responsável sobre qual componente priorizar |
| B5 | Escopo ainda não definido | — | — | `PENDENTE / DECIDIR DEPOIS` |
| Supabase Preview | Check de CI falhando de forma consistente (commits `0b3c708` e `857b8a2`) | A definir | A definir — causa raiz não investigada | Validação humana da integração de preview/branching do Supabase; não investigar ou alterar configuração sem autorização explícita |
| Riscos ConfigView | Riscos 1–5 catalogados em `AUDITORIA_CONFIG.md` (destaque: Risco 1 — importar backup sem confirmação, único caminho identificado que pode sobrescrever dados reais sem chance de desfazer) | Risco 1: Alta / Riscos 2–3: Média / Riscos 4–5: Baixa | Ver classificação detalhada no documento | Ver recomendações em `AUDITORIA_CONFIG.md`, seção 9 |

---

## 7. Histórico de Auditorias

Marcos registrados apenas quando a data pôde ser confirmada pelo histórico do Git:

| Data | Marco |
|---|---|
| 2026-07-06 | Checklist manual de regressão (seção 8 abaixo) criado/consolidado, incluindo o registro de BUG-05 e BUG-06 como corrigidos (commits `5d1cd14`, `b296080`) |
| 2026-09-14 | Auditoria detalhada da `ConfigView` publicada em `AUDITORIA_CONFIG.md` |
| 2026-09-14 | Primeira reconciliação de status deste documento: BUG-04 marcado como corrigido, seção de status das melhorias adicionada (commit `0b3c708`) |
| 2026-09-14 | B4.2 (testes de `AlunoFormModal`) concluído e validado em CI (commit `857b8a2`) |
| 2026-09-14 | Reestruturação deste documento como Painel de Controle Técnico (esta tarefa — B3) |

> Não foi possível determinar com segurança a data de criação original do checklist de regressão (seção 8) anterior a 2026-07-06 — os commits mais antigos que tocam este arquivo no histórico disponível são de 2026-07-06.

---

## 8. Checklist Manual de Regressão (Roteiro de QA)

> **Conteúdo preservado integralmente do documento original.** Roteiro manual
> para reexecutar a auditoria de regressão antes de cada publicação — cobre os
> fluxos que dependem de clique/UI e que os testes automatizados
> (`src/lib/*.test.ts`, `src/components/*.test.tsx`) ainda não cobrem sozinhos.
>
> Testes automatizados equivalentes (lógica pura): rode `npm test`.
> Smoke-test rápido no navegador: veja `scripts/smoke-test.js`.

### 8.1. Preparação

- [ ] `npm test` passa sem falhas inesperadas (os testes marcados "BUG conhecido" devem continuar passando — se algum deles **falhar**, significa que o bug foi corrigido; atualize o teste).
- [ ] `npx tsc --noEmit` sem erros.
- [ ] Abrir o app com `localStorage` limpo (`localStorage.removeItem('pt-control:data')` + reload) para validar o seed inicial.

### 8.2. Ciclo de vida do aluno

Para cada cenário, verificar Agenda (Hoje), Mês, Alunos e Relatório mostrando os mesmos dados:

- [ ] Aluno novo, sem `dataAdesao` — aparece na agenda imediatamente.
- [ ] Aluno com um período de férias — some da agenda durante o período, some do relatório de presença mas aparece em "Férias dos Alunos".
- [ ] Aluno com múltiplos períodos de férias não contíguos — cada período respeitado isoladamente.
- [ ] Aluno com contrato encerrado (`dataEncerramento` no passado) — some da agenda a partir dessa data.
- [ ] Aluno reativado depois de encerrado (limpar `dataEncerramento`) — **atenção ao BUG-04**: se `dataAdesao` não for atualizada, o período em que deveria estar inativo volta a contar como ativo. Verificar manualmente a data do "gap" na agenda (navegar para um mês/dia dentro do período que deveria estar inativo).
- [ ] Aluno compartilhando horário com outro(s) aluno(s), com dias da semana diferentes — editar um não deve alterar os dias do outro.
- [ ] Cadastrar 2 períodos de férias sobrepostos para o mesmo aluno (BUG-06, corrigido) — deve abrir o diálogo "Período sobreposto" com opções Cancelar/Substituir; "Substituir" remove o período antigo e mantém só o novo.
- [ ] Cadastrar férias sobrepostas para alunos **diferentes** — deve permitir livremente (a validação é por aluno).

### 8.3. Financeiro / Relatórios

- [ ] Dois alunos com `valorAula` diferentes no mesmo horário — faturamento calculado corretamente para cada um.
- [ ] Falta simples — conta em "Faltas", não conta em faturamento.
- [ ] Reposição marcada "Concluída" — conta em "Presenças" e no faturamento pela data da reposição, não pela data original.
- [ ] Reposição marcada "Não Compareceu" (BUG-05, corrigido) — conta como falta em "Faltas" no relatório do aluno e na visão geral.
- [ ] Reposição "Cancelada" — não conta como presença nem falta em nenhuma métrica, mas permanece visível no histórico/filtro "Canceladas".
- [ ] Alternar entre "Mês" e "Período" no Relatório — números batem com a Agenda para o mesmo intervalo.
- [ ] Números de Agenda, Relatório e Financeiro sempre idênticos para o mesmo período/aluno.

### 8.4. Reposições — regras de validação e ciclo de vida

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

### 8.5. Exclusões

- [ ] Excluir aluno — remove `schedules`, `slots` órfãos, `registros` e `matriculas` (inspecionar `localStorage['pt-control:data']`).
- [ ] Excluir período de férias do professor — não deixa referência quebrada em nenhuma tela.
- [ ] Remover uma reposição agendada (botão de lixeira no modal) — volta o registro para "Pendente", sem sobra de `reposicaoData`/`reposicaoExcecao`.

### 8.6. Edge cases de data

- [ ] Navegar de dezembro para janeiro (virada de ano) na Agenda e no Relatório.
- [ ] Navegar por fevereiro em ano bissexto (ex: 2028) e não bissexto (ex: 2026) — 29/02 só existe no bissexto.
- [ ] Cadastrar aluno com dias em uma semana que cruza virada de mês/ano.

### 8.7. Navegação

- [ ] Criar/editar/excluir aluno e navegar para "Hoje" sem recarregar a página — mudança reflete imediatamente.
- [ ] Alternar entre todas as abas (Hoje → Reposições → Alunos → Relatório → Config) sem erros no console.

### 8.8. UX

- [ ] Nenhum botão ou informação duplicada aparente nas telas revisadas.
- [ ] Fluxo de reposição com exceção é compreensível sem explicação adicional.
