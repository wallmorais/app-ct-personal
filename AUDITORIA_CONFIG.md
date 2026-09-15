# Auditoria — Tela Config (ConfigView.tsx)

**Arquivo:** `src/components/ConfigView.tsx`
**Tamanho:** 946 linhas / ~38 KB
**Data da auditoria:** 2026-09-14
**Escopo:** Somente leitura — nenhuma alteração de código foi feita.

---

## 1. Visão geral

`ConfigView` é a maior tela do aplicativo e concentra 8 responsabilidades distintas
em um único arquivo, através de 4 componentes:

| Componente | Linhas | Responsabilidade |
|---|---|---|
| `ConfigView` (default export) | 626–946 | Orquestração geral + 5 seções próprias |
| `FeriasSection` | 68–230 | CRUD de férias do professor |
| `AusenciasSection` | 232–394 | CRUD de ausências do professor (com efeitos em `registros`) |
| `ContaSection` | 396–624 | Perfil, senha, e-mail, logout (Supabase Auth) |

Nenhum desses componentes é exportado nomeadamente (exceto o default), portanto
**não são testáveis isoladamente sem exportá-los** — ver seção 6.

---

## 2. Mapa de seções renderizadas (ordem visual)

1. **Professor**
   - Dados do professor (nome, registro/certificação) — direto em `data.config`
   - `FeriasSection`
   - `AusenciasSection`
2. **Agenda**
   - Lembrete diário (horário + permissão de notificação do navegador + teste)
3. **Sistema**
   - Aparência (claro/escuro/sistema)
   - Backups automáticos (lista, gerar manual, baixar, excluir)
   - Exportar/Importar (arquivo JSON)
4. **Conta** (só quando `isSupabaseConfigured && session`)
   - Perfil (nome/telefone/cidade), alterar senha, alterar e-mail, sair
5. **Sobre** (rodapé estático)

---

## 3. Fluxos críticos e como cada um trata erro/confirmação

| Ação | Confirmação antes de executar? | Reversível? | Observação |
|---|---|---|---|
| Excluir período de férias | ✅ `ConfirmDialog` | Não (mas escopo restrito) | Mensagem correta: "afeta apenas contabilização futura" |
| Salvar férias com sobreposição | ✅ `ConfirmDialog` (substituir) | Sim (idempotente) | `findOverlappingVacation` bloqueia conflito antes de salvar |
| Registrar ausência com aulas já registradas | ✅ `ConfirmDialog` | N/A | Mostra quantas aulas não serão alteradas |
| Cancelar ausência | ✅ `ConfirmDialog`, com bloqueio prévio (`previewAbsenceCancel`) | Sim | Lógica correta e defensiva — `cancelProfessorAbsence` recusa se aulas já foram alteradas |
| **Excluir backup automático** | ✅ `ConfirmDialog` | Não | OK |
| **Importar backup (JSON)** | ❌ **Nenhuma confirmação** | ❌ **Não** | **Sobrescreve TODOS os dados atuais silenciosamente após seleção do arquivo** — ver Risco #1 |
| **Sair da conta** | ❌ **Nenhuma confirmação** | Sim (basta logar de novo) | Clique único desloga — ver Risco #2 |
| Alterar senha | ❌ Nenhuma confirmação de senha atual | Sim | Ver Risco #3 |
| Alterar e-mail | ❌ Nenhuma confirmação de senha atual | Sim (fluxo por e-mail) | Ver Risco #3 |
| Exportar backup | N/A (não destrutivo) | N/A | OK |
| Gerar backup manual | N/A (não destrutivo) | N/A | OK |

---

## 4. Riscos identificados (ordenados por severidade)

### 🔴 Risco 1 — Importar backup sem confirmação
**Local:** `handleImport` (linhas 677–692), botão "Importar backup (JSON)" (linhas 907–913)

O clique em "Importar backup" abre diretamente o seletor de arquivos do sistema
operacional. Assim que o usuário escolhe um arquivo válido, `setData(imported)`
**substitui integralmente o estado atual da aplicação** — sem nenhum diálogo
intermediário do tipo "Isso substituirá todos os seus dados atuais. Deseja continuar?".

- Já existe validação de **formato** (via `parseBackupPayload`, endurecida na M2),
  então um arquivo corrompido é rejeitado.
- Mas um arquivo **válido e antigo** (ex: backup de 3 meses atrás, selecionado por
  engano) é aceito e aplicado imediatamente, sem chance de o usuário reconsiderar.
- Como o Supabase sincroniza em até 500ms após qualquer mudança de `data` (ver
  `App.tsx`), o backup antigo pode ser **persistido no banco antes que o usuário
  perceba o engano**.

**Recomendação:** Adicionar um `ConfirmDialog` entre a leitura do arquivo e o
`setData`, mostrando um resumo básico do conteúdo (ex: quantidade de alunos e
registros do arquivo) para o usuário confirmar que é o backup certo.

---

### 🟡 Risco 2 — "Sair da conta" sem confirmação
**Local:** linhas 613–621

Um único toque no botão desloga imediatamente (`supabase.auth.signOut()`), sem
diálogo de confirmação e sem indicador de carregamento enquanto a chamada está em
andamento. Em um dispositivo móvel, um toque acidental na área do rodapé desloga
o professor no meio do uso.

**Recomendação:** Confirmação leve (`ConfirmDialog`) e desabilitar o botão com
spinner durante a chamada assíncrona, para evitar duplo clique.

---

### 🟡 Risco 3 — Troca de senha/e-mail sem reautenticação
**Local:** `handleChangePassword` (432–451), `handleChangeEmail` (453–474)

Ambas as ações usam `supabase.auth.updateUser(...)` **sem exigir a senha atual**.
Isso depende inteiramente da sessão estar válida — se um token de sessão vazar ou
o dispositivo for acessado fisicamente por outra pessoa enquanto logado, ela pode
trocar a senha e o e-mail sem confirmar identidade, potencialmente bloqueando o
dono real da conta.

Isso é um padrão comum em apps simples, mas vale registrar como risco de segurança
formal, já que é uma central pessoal de dados de clientes (LGPD).

**Recomendação (opcional, fora do escopo imediato):** pedir a senha atual antes de
qualquer alteração de credenciais, ou usar `reauthenticate` do Supabase se
disponível no plano.

---

### 🟢 Risco 4 — Estado local perdido ao trocar de view
Como `ConfigView` agora é carregada via `React.lazy` (B1) e o React desmonta o
componente ao trocar de aba do `BottomNav`, qualquer formulário aberto e não
salvo (ex: editando perfil, trocando senha) é **descartado silenciosamente** ao
navegar para outra tela e voltar. Isso já era verdade antes do code splitting
(o estado é local ao componente, não ao app), mas fica mais evidente agora que
o componente realmente desmonta/remonta com o lazy loading.

**Recomendação:** Não é um bug introduzido por B1 — comportamento pré-existente.
Se quiser tratar, seria necessário levantar o estado dos formulários para o
`AppData` ou usar um aviso "Você tem alterações não salvas" ao sair.

---

### 🟢 Risco 5 — Sem indicador de carregamento na importação de arquivo
**Local:** `handleImport` (677–692)

Entre o clique em "Importar" e o toast de sucesso/erro, não há spinner. Para
arquivos JSON pequenos isso é imperceptível, mas se o backup crescer muito (anos
de histórico) o app pode parecer travado por um instante.

**Recomendação:** baixa prioridade — cosmético.

---

## 5. Pontos positivos confirmados

- **Migração/validação de backup robusta** (herdada da M2): `parseBackupPayload`
  rejeita tipos inválidos antes de qualquer `setData`.
- **Ausências e férias são operações atômicas e defensivas**: `applyProfessorAbsence`,
  `cancelProfessorAbsence` e `previewAbsenceCancel` bloqueiam cancelamentos que
  desfariam alterações manuais já feitas pelo professor — nenhuma perda de dado
  silenciosa identificada nesse fluxo.
- **Overlap de férias tratado corretamente**: `findOverlappingVacation` impede
  dois períodos sobrepostos sem aviso.
- **Mensagens de erro traduzidas**: `traduzErroAuth` evita expor mensagens cruas
  do Supabase ao usuário final.
- **Acessibilidade básica presente**: `role="radiogroup"`/`aria-checked` no
  seletor de tema; `aria-label` em botões de ícone (editar, excluir, baixar).
- **Toasts e ConfirmDialog usados de forma consistente** na maioria dos fluxos
  destrutivos (exceto os riscos listados acima).
- **`e.target.value = ''` no `finally` do import**: permite reimportar o mesmo
  arquivo duas vezes seguidas sem bug do `<input type="file">`.

---

## 6. Cobertura de testes

**Não existe nenhum arquivo de teste para `ConfigView`** (`ConfigView.test.tsx`
não existe no projeto). Os componentes internos (`FeriasSection`,
`AusenciasSection`, `ContaSection`) não são exportados, o que impede testá-los
isoladamente sem antes exportá-los nomeadamente.

A lógica de negócio por trás das seções mais sensíveis (férias, ausências) já
está coberta indiretamente por `periods.test.ts` (1150 linhas de testes) — o que
reduz o risco real, já que a UI apenas chama essas funções puras já testadas.
O que **não** está coberto é o comportamento da própria tela: fluxos de
confirmação, ordem de exibição, exibição condicional de `ContaSection`, etc.

---

## 7. Acessibilidade — observações adicionais

- Campos de formulário com erro (`erro`, `msg`, `pwMsg`, `emailMsg`) não usam
  `aria-invalid` nem `aria-describedby` para associar a mensagem de erro ao
  campo — leitores de tela não anunciam automaticamente o motivo do erro.
- Botões de "expandir" (Alterar senha / Alterar e-mail) usam caracteres `▲`/`▼`
  como indicador visual, sem `aria-expanded` no botão — tecnicamente funcional,
  mas não segue o padrão ARIA de disclosure widget.

---

## 8. Performance

Após a implementação de B1 (code splitting), `ConfigView` já é carregada sob
demanda (chunk de ~23 KB / 6 KB gzip), então seu tamanho não afeta mais o
carregamento inicial do app. Não há otimizações adicionais necessárias aqui
neste momento.

---

## 9. Resumo executivo

| Categoria | Status |
|---|---|
| Bugs funcionais encontrados | Nenhum |
| Risco de perda de dado sem aviso | **1 alto** (importar backup) |
| Risco de UX (ação acidental) | 1 médio (sair da conta) |
| Risco de segurança formal | 1 médio (troca de senha/e-mail sem reautenticação) |
| Cobertura de testes da tela | 0% (lógica de negócio subjacente: coberta) |
| Acessibilidade | Boa, com 2 lacunas pontuais (aria-invalid, aria-expanded) |
| Impacto no bundle | Nenhum (já lazy-loaded desde B1) |

**Recomendação de prioridade para próxima ação:** tratar o **Risco 1** (confirmação
antes de importar backup) antes de qualquer outra melhoria nesta tela, por ser o
único caminho identificado que pode sobrescrever dados reais de produção sem
chance de desfazer.

---

*Nenhum arquivo de código foi alterado durante esta auditoria.*
