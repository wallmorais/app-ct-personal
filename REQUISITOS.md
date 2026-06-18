# Documento de Requisitos — PT.Control (Wal Morais Personal Trainer)

**Versão:** 1.0
**Data:** 12/06/2026
**Responsável:** Wal Morais (Personal Trainer)
**Tipo de produto:** Single Page Application (SPA) responsiva, mobile-first, 100% client-side.

---

## 1. Visão Geral

O **PT.Control** é um aplicativo web para uso pessoal de um Personal Trainer, focado no
controle de **agenda**, **presença**, **reposições** e **faturamento** dos alunos. Funciona
inteiramente no navegador (sem back-end), com persistência local via `localStorage`, sendo
otimizado para uso no smartphone.

### 1.1 Objetivos
- Centralizar a agenda de aulas recorrentes por dia da semana.
- Registrar rapidamente o status de cada aula (presença, falta, reposição).
- Calcular automaticamente o faturamento mensal com base nas aulas realizadas.
- Gerar relatórios (geral e por aluno) exportáveis em PDF como evidência.
- Funcionar offline-first, sem depender de servidor.

### 1.2 Fora de escopo (MVP atual)
- Autenticação / múltiplos usuários.
- Sincronização em nuvem entre dispositivos (feita manualmente via backup JSON).
- Pagamentos online / integração financeira.
- Notificações push nativas (a notificação é simulada via banner).

---

## 2. Stakeholders e Perfis

| Perfil | Descrição | Necessidades |
|---|---|---|
| Personal Trainer (usuário único) | Opera o app no celular durante/entre as aulas | Registro rápido, visão de agenda, faturamento, evidências |
| Aluno (indireto) | Não acessa o app | É beneficiado pelo controle de reposições e histórico |

---

## 3. Requisitos Funcionais (RF)

### 3.1 Agenda / Dashboard
- **RF01** — Exibir a agenda em **visão diária (micro)** com navegação por semana (anterior/próxima/hoje) e seleção de dia.
- **RF02** — Exibir a agenda em **visão mensal (macro)**, com calendário (Seg–Dom) e indicador visual nos dias que possuem aulas/reposições; ao tocar um dia, abrir a visão diária correspondente.
- **RF03** — Agrupar as aulas do dia por **horário**, listando os alunos de cada sessão.
- **RF04** — Para cada aluno na aula, oferecer ações rápidas de status:
  - ✓ **Presente** (verde)
  - ✗ **Falta** (vermelho)
  - ⟳ **Reposição** (amarelo)
- **RF05** — Ao marcar **Reposição**, abrir modal para informar **Data** e **Horário** da reposição.
- **RF06** — Atualizar contadores do aluno imediatamente ao registrar o status.
- **RF07** — Permitir **desmarcar** um status (clicar novamente volta para "pendente").

### 3.2 Reposições (sincronização de agenda)
- **RF08** — Ao salvar uma reposição, **replicar automaticamente** a aula para a data/horário de destino, exibindo-a na agenda daquele dia.
- **RF09** — Sinalizar visualmente a aula reagendada (badge "Reposição") com a informação de origem (data/horário original).
- **RF10** — Na data da reposição, permitir **confirmar se a aula foi realizada** (✓) ou **não compareceu** (✗).
- **RF11** — Permitir **reagendar novamente** ou **remover** a reposição.

### 3.3 Gerenciamento de Alunos
- **RF12** — Listar todos os alunos com indicador de progresso de presença do mês (ex.: "5 / 12 aulas").
- **RF13** — Cadastrar/editar aluno com os campos: **Nome**, **Telefone**, **Plano** (nº de aulas/mês), **Valor por aula**, **Observações**.
- **RF14** — Excluir aluno (removendo-o também das aulas e registros associados).

### 3.4 Relatórios e Faturamento
- **RF15** — Exibir **visão geral** do mês: faturamento total, total de presenças, faltas e reposições.
- **RF16** — Exibir detalhamento **por aluno**: taxa de presença (realizadas vs. plano), faltas, reposições e faturamento individual.
- **RF17** — Calcular o **faturamento automaticamente**: `aulas realizadas (presença) × valor por aula`.
- **RF18** — Permitir **filtrar o relatório** por: um único aluno, vários alunos selecionados, ou visão geral.
- **RF19** — Exibir, no relatório por aluno, o **histórico** do mês sinalizando claramente os **reagendamentos** (origem/destino e situação).
- **RF20** — **Exportar o relatório como PDF** (via impressão do navegador), com layout de documento de evidência: logomarca, período, escopo, data de emissão, tabela-resumo com linha de TOTAL e área de assinatura.

### 3.5 Notificação (simulada)
- **RF21** — Permitir definir, em Configurações, o **horário do lembrete diário** (ex.: 21:00).
- **RF22** — Se houver aulas do dia **sem registro de presença** e o horário atual for ≥ ao programado, exibir **banner de alerta** no topo da dashboard.
- **RF23** — Botão **"Testar Notificação Agora"** para forçar a verificação imediatamente.

### 3.6 Persistência e Backup
- **RF24** — Persistir todo o estado no `localStorage` (não perder dados ao fechar a aba).
- **RF25** — **Exportar Backup (JSON)** baixando os dados atuais.
- **RF26** — **Importar Backup (JSON)** restaurando dados de um arquivo.
- **RF27** — Inicializar com **dados-semente** (seed) quando o `localStorage` estiver vazio.

---

## 4. Regras de Negócio (RN)

- **RN01** — Aulas são **recorrentes por dia da semana** (um slot pode ocorrer em vários dias).
- **RN02** — Faturamento considera **apenas aulas com presença confirmada** (`presente`), não faltas nem reposições pendentes.
- **RN03** — Taxa de presença = `presenças ÷ plano (aulas contratadas no mês) × 100`.
- **RN04** — Uma **reposição agendada** conta no indicador "reposições" do aluno, mesmo após ser confirmada como realizada ou não comparecida.
- **RN05** — Reposição confirmada como **realizada** passa a contar como **presença** para fins de faturamento.
- **RN06** — Os relatórios consideram sempre o **mês corrente** (mês civil).
- **RN07** — Cada dispositivo tem seu próprio `localStorage`; a transferência entre aparelhos é feita por **backup/importação manual**.

---

## 5. Requisitos Não-Funcionais (RNF)

| Código | Categoria | Requisito |
|---|---|---|
| RNF01 | Usabilidade | Mobile-first; botões com área de toque confortável para o polegar |
| RNF02 | Usabilidade | Interface em **Português (BR)**; valores em **R$** (pt-BR) |
| RNF03 | Desempenho | Carregamento rápido; sem chamadas de rede em runtime |
| RNF04 | Disponibilidade | Funciona offline (após carregado) |
| RNF05 | Portabilidade | Acessível via navegador (Safari/Chrome) em iOS/Android |
| RNF06 | Identidade visual | Tema escuro com acentos atléticos (Verde Esmeralda, Azul Elétrico) e cor de marca (Teal `#15A9AD`); logomarca "Wal Morais" |
| RNF07 | Manutenibilidade | Código em componentes reutilizáveis (React + TypeScript) |
| RNF08 | Confiabilidade | Validação do JSON na importação de backup |
| RNF09 | Impressão | Layout dedicado de impressão (A4, cores preservadas, quebras de página) |

---

## 6. Modelo de Dados

```
AppData
├── alunos: Aluno[]
├── slots: AulaSlot[]
├── registros: Registro[]
└── config: ConfigData

Aluno { id, nome, telefone, plano (nº aulas/mês), valorAula (R$), observacoes }
AulaSlot { id, horario ("07:00"), dias: DiaSemana[] (0=Dom..6=Sáb), alunoIds[] }
Registro { id, alunoId, slotId, data (YYYY-MM-DD), horario, status,
           reposicaoData?, reposicaoHorario? }
ConfigData { notificationTime ("HH:MM") }

StatusAula = 'pendente' | 'presente' | 'falta' | 'reposicao'
```

> Observação: o campo de **Localização** foi removido do modelo de slot.

---

## 7. Telas / Navegação

Navegação por estado (`view`), sem rotas de URL, com barra inferior fixa:

| Aba | Função |
|---|---|
| **Agenda** | Visão diária e mensal, registro de status e reposições |
| **Alunos** | Listagem, cadastro/edição/exclusão, progresso de presença |
| **Relatório** | Visão geral e por aluno, filtros, exportação em PDF |
| **Config** | Horário do lembrete, teste de notificação, backup export/import |

---

## 8. Dados-Semente (Seed)

Carregados automaticamente quando não há dados salvos:

| Dias | Horário | Alunos |
|---|---|---|
| Seg, Qua, Sex | 07:00 | Mauricio, Adriana |
| Seg, Qua, Sex | 08:00 | Fernanda |
| Seg, Qua, Sex | 10:00 | Rocilda, Cris |
| Seg, Qua | 09:00 | Maria Luiza |
| Ter, Qui | 07:00 | Rodrigo |

Planos fictícios de **8 ou 12 aulas/mês** e valores entre **R$ 90–120/aula** para teste de faturamento.

---

## 9. Stack Tecnológica

- **Build:** Vite
- **UI:** React 18 + TypeScript
- **Estilo:** Tailwind CSS (tema customizado)
- **Ícones:** lucide-react
- **Persistência:** `localStorage` (client-side)
- **PDF:** `window.print()` + CSS `@media print` (sem dependências externas)

### 9.1 Estrutura de pastas (principais)
```
src/
├── App.tsx                  # shell, estado global, lembrete
├── types.ts                 # modelos de dados
├── lib/
│   ├── seed.ts              # dados iniciais
│   ├── storage.ts          # load/save/export/import
│   ├── date.ts             # utilitários de data/semana/mês
│   └── billing.ts          # estatísticas e faturamento
└── components/
    ├── BottomNav.tsx
    ├── AlertBanner.tsx
    ├── AgendaView.tsx
    ├── MonthlyCalendar.tsx
    ├── ReposicaoModal.tsx
    ├── AlunosView.tsx
    ├── AlunoFormModal.tsx
    ├── RelatoriosView.tsx
    ├── ConfigView.tsx
    └── Logo.tsx             # logomarca vetorial (SVG)
```

---

## 10. Implantação (uso interno)

- **Rede local (Wi-Fi):** `npm run dev` (porta 5173) ou `npm run build && npm run preview` (porta 4173); acessar do celular via `http://<IP-do-Mac>:5173`.
- **Pré-requisito:** Mac ligado, mesma rede Wi-Fi, firewall liberado.
- **Hospedagem opcional (acesso externo):** Vercel / Netlify / GitHub Pages (deploy da pasta `dist/`).

---

## 11. Rastreabilidade — Status de Implementação

| Requisito | Status |
|---|---|
| RF01–RF07 (Agenda/registro) | ✅ Implementado |
| RF08–RF11 (Reposições + sincronização) | ✅ Implementado |
| RF12–RF14 (Alunos) | ✅ Implementado |
| RF15–RF20 (Relatórios/Faturamento/PDF) | ✅ Implementado |
| RF21–RF23 (Notificação simulada) | ✅ Implementado |
| RF24–RF27 (Persistência/Backup) | ✅ Implementado |
| Identidade visual (logo + paleta) | ✅ Implementado |

---

## 12. Evoluções Futuras (Backlog)

- Seletor de **mês** no relatório (emitir evidências de meses anteriores).
- Campo de **nome/dados do personal** configurável no cabeçalho do PDF.
- **Sincronização em nuvem** (opcional) entre dispositivos.
- **PWA** com instalação e notificações push reais.
- Edição de **slots de aula** pela interface (hoje vêm do seed/código).
- Controle de **pagamentos** (status pago/pendente por aluno).

---

*Documento gerado para o projeto PT.Control — Wal Morais Personal Trainer.*
