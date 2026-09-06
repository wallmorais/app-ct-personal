import { useState } from 'react';
import { X, Trash2, CalendarClock, FileText, Palmtree, Plus, RotateCcw, Pencil, History } from 'lucide-react';
import type { Aluno, AulaSlot, DiaSemana, Registro, StudentEnrollment, StudentSchedule } from '../types';
import { findOverlappingVacation, validarEtapas, aulasDoAlunoNoPeriodo, type EtapaInput } from '../lib/periods';
import { todayISO } from '../lib/date';
import ConfirmDialog from './ConfirmDialog';

interface StudentVacation {
  id: string;
  dataInicio: string;
  dataFim: string;
}

/** Etapas do aluno vindas do formulário: correções das anteriores + reativação explícita. */
export interface EtapasForm {
  anteriores: EtapaInput[];
  reativacao?: { dataInicio: string };
}

interface Props {
  aluno: Aluno | null;
  slots: AulaSlot[];
  schedules: StudentSchedule[];
  studentVacations: StudentVacation[];
  /** Etapas ATIVO do aluno em ordem cronológica; a última é a corrente. Vazio para aluno novo. */
  etapasAtivas: StudentEnrollment[];
  /** Todos os registros do app — usado só para bloquear exclusão de etapa com aulas no período. */
  registros: Registro[];
  onSave: (aluno: Aluno, agenda: AgendaDia[], vacations: StudentVacation[], etapas: EtapasForm) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

function fmtBR(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('pt-BR');
}

export interface AgendaDia {
  dia: DiaSemana;
  inicio: string;
  fim: string;
}

const DIAS: { value: DiaSemana; label: string }[] = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

type AgendaState = Record<number, { ativo: boolean; inicio: string; fim: string }>;

function addOneHour(horario: string): string {
  const [h, m] = horario.split(':').map(Number);
  const next = (h + 1) % 24;
  return `${String(next).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function buildInitialAgenda(aluno: Aluno | null, slots: AulaSlot[], schedules: StudentSchedule[]): AgendaState {
  const base: AgendaState = {};
  for (let d = 0; d <= 6; d++) base[d] = { ativo: false, inicio: '07:00', fim: '08:00' };

  if (!aluno) return base;

  const slotMap = new Map(slots.map((s) => [s.id, s]));
  for (const sched of schedules) {
    if (sched.alunoId !== aluno.id) continue;
    const slot = slotMap.get(sched.slotId);
    if (!slot) continue;
    for (const dia of sched.dias) {
      base[dia] = {
        ativo: true,
        inicio: slot.horario,
        fim: slot.horarioFim ?? addOneHour(slot.horario),
      };
    }
  }

  return base;
}

export default function AlunoFormModal({ aluno, slots, schedules, studentVacations, etapasAtivas, registros, onSave, onDelete, onClose }: Props) {
  // Etapa corrente = ATIVO de maior dataInicio; anteriores = as demais (todas fechadas).
  const etapaCorrente = etapasAtivas[etapasAtivas.length - 1];
  const etapaCorrenteFechada = !!etapaCorrente?.dataFim;

  const [nome, setNome] = useState(aluno?.nome ?? '');
  const [telefone, setTelefone] = useState(aluno?.telefone ?? '');
  const [plano, setPlano] = useState(aluno?.plano ?? 8);
  // String durante a digitação (não number): um input controlado por número
  // reformata o valor a cada tecla e apaga o separador decimal antes do
  // usuário terminar de digitar os centavos (ex.: "100." vira 100 → "100").
  const [valorAula, setValorAula] = useState(String(aluno?.valorAula ?? 100));
  const [observacoes, setObservacoes] = useState(aluno?.observacoes ?? '');
  const [aniversario, setAniversario] = useState(aluno?.aniversario ?? '');
  const [objetivo, setObjetivo] = useState(aluno?.objetivo ?? '');
  const [restricoes, setRestricoes] = useState(aluno?.restricoes ?? '');
  // A matrícula é a fonte de verdade; os escalares do aluno são só o espelho dela.
  const [dataAdesao, setDataAdesao] = useState(etapaCorrente?.dataInicio ?? aluno?.dataAdesao ?? '');
  const [dataEncerramento, setDataEncerramento] = useState(etapaCorrente?.dataFim ?? aluno?.dataEncerramento ?? '');
  const [etapasAnteriores, setEtapasAnteriores] = useState<EtapaInput[]>(() =>
    etapasAtivas.slice(0, -1).map((e) => ({ id: e.id, dataInicio: e.dataInicio, dataFim: e.dataFim })),
  );
  const [editandoEtapaId, setEditandoEtapaId] = useState<string | null>(null);
  const [confirmExcluirEtapa, setConfirmExcluirEtapa] = useState<EtapaInput | null>(null);
  const [reativando, setReativando] = useState(false);
  const [novaEtapaInicio, setNovaEtapaInicio] = useState('');
  const [etapaErro, setEtapaErro] = useState('');
  const [diaCobranca, setDiaCobranca] = useState<string>(aluno?.diaCobranca ? String(aluno.diaCobranca) : '');
  const [vacations, setVacations] = useState<StudentVacation[]>(studentVacations);
  const [newVacInicio, setNewVacInicio] = useState('');
  const [newVacFim, setNewVacFim] = useState('');
  const [vacFormOpen, setVacFormOpen] = useState(false);
  const [vacConflito, setVacConflito] = useState<StudentVacation | null>(null);
  const [agenda, setAgenda] = useState<AgendaState>(() => buildInitialAgenda(aluno, slots, schedules));
  const [nomeErro, setNomeErro] = useState(false);
  const [horarioErro, setHorarioErro] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const isEdit = !!aluno;

  function horarioInvalido(dia: DiaSemana): boolean {
    const item = agenda[dia];
    return item.ativo && item.fim <= item.inicio;
  }

  function toggleDia(dia: DiaSemana) {
    setAgenda((prev) => ({
      ...prev,
      [dia]: { ...prev[dia], ativo: !prev[dia].ativo },
    }));
  }

  function updateHorario(dia: DiaSemana, campo: 'inicio' | 'fim', valor: string) {
    setAgenda((prev) => ({
      ...prev,
      [dia]: { ...prev[dia], [campo]: valor },
    }));
    if (horarioErro) setHorarioErro(false);
  }

  function handleSubmit() {
    if (!nome.trim()) {
      setNomeErro(true);
      return;
    }

    const temHorarioInvalido = DIAS.some((d) => horarioInvalido(d.value));
    if (temHorarioInvalido) {
      setHorarioErro(true);
      return;
    }

    // Etapas: reabrir uma etapa encerrada só via "Reativar aluno" (nunca limpando a data).
    if (etapaCorrenteFechada && !reativando && !dataEncerramento) {
      setEtapaErro('Este aluno está encerrado. Para voltar a ativá-lo, use "Reativar aluno".');
      return;
    }
    if (etapasAnteriores.length > 0 && !dataAdesao) {
      setEtapaErro('Informe a data de adesão da etapa atual.');
      return;
    }
    const reativacao = reativando ? { dataInicio: novaEtapaInicio } : undefined;
    // Mesmo fallback que AlunosView aplica: aluno sem data de adesão começa hoje.
    const erroEtapas = validarEtapas({
      anteriores: etapasAnteriores,
      corrente: {
        id: etapaCorrente?.id,
        dataInicio: dataAdesao || etapaCorrente?.dataInicio || todayISO(),
        dataFim: dataEncerramento || undefined,
      },
      reativacao,
    });
    if (erroEtapas) {
      setEtapaErro(erroEtapas);
      return;
    }

    const agendaSelecionada: AgendaDia[] = DIAS.filter((d) => agenda[d.value].ativo).map((d) => ({
      dia: d.value,
      inicio: agenda[d.value].inicio,
      fim: agenda[d.value].fim,
    }));

    // Inclui período de férias pendente (preenchido mas não confirmado com "Salvar" da seção),
    // desde que não sobreponha um período já existente — nesse caso o usuário precisa
    // resolver o conflito explicitamente pelo botão "Salvar" da seção de férias.
    const pendingVacValido =
      vacFormOpen &&
      newVacInicio &&
      newVacFim &&
      newVacFim >= newVacInicio &&
      !findOverlappingVacation(vacations, newVacInicio, newVacFim);
    const vacationsFinal = pendingVacValido
      ? [...vacations, { id: crypto.randomUUID(), dataInicio: newVacInicio, dataFim: newVacFim }]
      : vacations;

    onSave(
      {
        id: aluno?.id ?? crypto.randomUUID(),
        nome: nome.trim(),
        telefone: telefone.trim(),
        plano: Number(plano) || 0,
        valorAula: Number(valorAula.replace(',', '.')) || 0,
        observacoes: observacoes.trim(),
        aniversario: aniversario || undefined,
        objetivo: objetivo.trim() || undefined,
        restricoes: restricoes.trim() || undefined,
        dataAdesao: dataAdesao || undefined,
        dataEncerramento: dataEncerramento || undefined,
        diaCobranca: diaCobranca ? Number(diaCobranca) : undefined,
      },
      agendaSelecionada,
      vacationsFinal,
      { anteriores: etapasAnteriores, reativacao },
    );
  }

  function updateEtapaAnterior(id: string, campo: 'dataInicio' | 'dataFim', valor: string) {
    setEtapasAnteriores((prev) => prev.map((e) => (e.id === id ? { ...e, [campo]: valor } : e)));
    setEtapaErro('');
  }

  function handleExcluirEtapaClick(etapa: EtapaInput) {
    if (!aluno) return;
    const aulas = aulasDoAlunoNoPeriodo(registros, aluno.id, etapa.dataInicio, etapa.dataFim);
    if (aulas.length > 0) {
      setEtapaErro(
        `Esta etapa não pode ser excluída: há ${aulas.length} aula${aulas.length > 1 ? 's' : ''} registrada${aulas.length > 1 ? 's' : ''} no período (${fmtBR(etapa.dataInicio)} a ${etapa.dataFim ? fmtBR(etapa.dataFim) : '—'}). Corrija as datas em vez de excluir.`,
      );
      return;
    }
    setConfirmExcluirEtapa(etapa);
  }

  function commitExcluirEtapa() {
    if (!confirmExcluirEtapa) return;
    setEtapasAnteriores((prev) => prev.filter((e) => e.id !== confirmExcluirEtapa.id));
    setConfirmExcluirEtapa(null);
    setEtapaErro('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-base-card border border-base-border rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{isEdit ? 'Editar aluno' : 'Novo aluno'}</h2>
          <button onClick={onClose} className="text-base-muted active:text-base-fg">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="aluno-nome">Nome</label>
            <input
              id="aluno-nome"
              type="text"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (nomeErro) setNomeErro(false);
              }}
              placeholder="Nome do aluno"
              className={nomeErro ? '!border-red-500 focus:!border-red-500' : ''}
              aria-invalid={nomeErro}
              aria-describedby={nomeErro ? 'aluno-nome-erro' : undefined}
            />
            {nomeErro && (
              <p id="aluno-nome-erro" className="text-xs text-red-600 dark:text-red-400 mt-1">
                Informe o nome do aluno.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="aluno-telefone">Telefone</label>
            <input
              id="aluno-telefone"
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(11) 90000-0000"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="aluno-plano">Plano (aulas/mês)</label>
              <input
                id="aluno-plano"
                type="number"
                min={0}
                value={plano}
                onChange={(e) => setPlano(Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor="aluno-valor">Valor/aula (R$)</label>
              <input
                id="aluno-valor"
                type="text"
                inputMode="decimal"
                value={valorAula}
                onChange={(e) => {
                  const raw = e.target.value;
                  // aceita dígitos e um único separador decimal (vírgula ou ponto)
                  if (/^\d*[.,]?\d*$/.test(raw)) setValorAula(raw);
                }}
                placeholder="100,00"
              />
            </div>
          </div>
          <div>
            <label htmlFor="aluno-aniversario">Aniversário</label>
            <input
              id="aluno-aniversario"
              type="date"
              value={aniversario}
              onChange={(e) => setAniversario(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="aluno-objetivo">Objetivo</label>
            <input
              id="aluno-objetivo"
              type="text"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              placeholder="Ex: Emagrecimento, Hipertrofia, Condicionamento"
            />
          </div>
          <div>
            <label htmlFor="aluno-restricoes">Restrições médicas</label>
            <textarea
              id="aluno-restricoes"
              rows={2}
              value={restricoes}
              onChange={(e) => setRestricoes(e.target.value)}
              placeholder="Lesões, condições médicas, limitações..."
            />
          </div>
          <div>
            <label htmlFor="aluno-obs">Observações</label>
            <textarea
              id="aluno-obs"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Notas gerais sobre o aluno"
            />
          </div>

          {/* ── Contrato ── */}
          <div className="pt-1">
            <div className="flex items-center gap-2 text-electric mb-2">
              <FileText size={16} />
              <span className="text-xs font-semibold uppercase tracking-wide">Contrato</span>
            </div>
            {(etapasAnteriores.length > 0 || etapaCorrenteFechada) && (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-base-muted mb-1">
                Etapa atual
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="aluno-adesao">Data de adesão</label>
                <input
                  id="aluno-adesao"
                  type="date"
                  value={dataAdesao}
                  onChange={(e) => { setDataAdesao(e.target.value); setEtapaErro(''); }}
                />
              </div>
              <div>
                <label htmlFor="aluno-encerramento">Data de encerramento</label>
                <input
                  id="aluno-encerramento"
                  type="date"
                  value={dataEncerramento}
                  min={dataAdesao}
                  onChange={(e) => { setDataEncerramento(e.target.value); setEtapaErro(''); }}
                />
              </div>
            </div>
            <p className="text-[11px] text-base-muted mt-1">
              O aluno aparece na agenda somente entre estas datas.
            </p>

            {/* Reativação explícita — só quando a etapa corrente está encerrada */}
            {etapaCorrenteFechada && !reativando && (
              <div className="mt-3 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5 space-y-2">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Aluno encerrado em <span className="font-semibold">{fmtBR(etapaCorrente!.dataFim!)}</span>.
                  Para voltar a atendê-lo, inicie uma nova etapa — a etapa anterior é preservada no histórico.
                </p>
                <button
                  type="button"
                  onClick={() => { setReativando(true); setNovaEtapaInicio(''); setEtapaErro(''); }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald text-black text-xs font-semibold active:bg-emerald/80"
                >
                  <RotateCcw size={13} /> Reativar aluno
                </button>
              </div>
            )}
            {reativando && (
              <div className="mt-3 bg-emerald/10 border border-emerald/30 rounded-xl px-3 py-2.5 space-y-2">
                <p className="text-xs font-semibold text-emerald">Nova etapa</p>
                <div>
                  <label htmlFor="aluno-nova-etapa">Data de início da nova etapa</label>
                  <input
                    id="aluno-nova-etapa"
                    type="date"
                    value={novaEtapaInicio}
                    min={dataEncerramento}
                    onChange={(e) => { setNovaEtapaInicio(e.target.value); setEtapaErro(''); }}
                  />
                </div>
                <p className="text-[11px] text-base-muted">
                  Entre {dataEncerramento ? fmtBR(dataEncerramento) : 'o encerramento'} e esta data o aluno fica inativo. A etapa anterior não é alterada.
                </p>
                <button
                  type="button"
                  onClick={() => { setReativando(false); setNovaEtapaInicio(''); setEtapaErro(''); }}
                  className="w-full py-1.5 rounded-lg bg-base-card border border-base-border text-xs font-semibold active:bg-base-hover/5"
                >
                  Cancelar reativação
                </button>
              </div>
            )}

            {/* Etapas anteriores — correção explícita, uma por vez */}
            {etapasAnteriores.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-1.5 text-base-muted mb-1.5">
                  <History size={13} />
                  <span className="text-[11px] font-semibold uppercase tracking-wide">Etapas anteriores</span>
                </div>
                <div className="space-y-1.5">
                  {etapasAnteriores.map((e) => {
                    const editando = editandoEtapaId === e.id;
                    return (
                      <div key={e.id} className="bg-base-surface border border-base-border rounded-xl px-3 py-2">
                        {editando ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label htmlFor={`etapa-inicio-${e.id}`} className="!mb-1">Adesão</label>
                                <input
                                  id={`etapa-inicio-${e.id}`}
                                  type="date"
                                  value={e.dataInicio}
                                  onChange={(ev) => updateEtapaAnterior(e.id!, 'dataInicio', ev.target.value)}
                                />
                              </div>
                              <div>
                                <label htmlFor={`etapa-fim-${e.id}`} className="!mb-1">Encerramento</label>
                                <input
                                  id={`etapa-fim-${e.id}`}
                                  type="date"
                                  value={e.dataFim ?? ''}
                                  min={e.dataInicio}
                                  onChange={(ev) => updateEtapaAnterior(e.id!, 'dataFim', ev.target.value)}
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditandoEtapaId(null)}
                              className="w-full py-1.5 rounded-lg bg-base-card border border-base-border text-xs font-semibold active:bg-base-hover/5"
                            >
                              Concluir correção
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-base-fg">
                              {fmtBR(e.dataInicio)} a {e.dataFim ? fmtBR(e.dataFim) : '—'}
                            </p>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setEditandoEtapaId(e.id!)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-base-muted active:bg-base-hover/10"
                                aria-label="Corrigir etapa"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExcluirEtapaClick(e)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-red-500 active:bg-red-500/20"
                                aria-label="Excluir etapa"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-base-muted mt-1">
                  Corrigir uma etapa anterior não altera a etapa atual nem cria etapa nova.
                </p>
              </div>
            )}

            {etapaErro && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2" role="alert">{etapaErro}</p>
            )}
            <div className="mt-3">
              <label htmlFor="aluno-dia-cobranca">Dia de cobrança</label>
              <div className="flex items-center gap-2">
                <select
                  id="aluno-dia-cobranca"
                  value={diaCobranca}
                  onChange={(e) => setDiaCobranca(e.target.value)}
                  className="w-20"
                >
                  <option value="">—</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <span className="text-sm text-base-muted">de cada mês</span>
              </div>
              <p className="text-[11px] text-base-muted mt-1">
                Dia do mês em que ocorre a cobrança recorrente.
              </p>
            </div>
          </div>

          {/* ── Férias do aluno ── */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-electric">
                <Palmtree size={16} />
                <span className="text-xs font-semibold uppercase tracking-wide">Férias</span>
              </div>
              <button
                type="button"
                onClick={() => { setVacFormOpen(true); setNewVacInicio(''); setNewVacFim(''); }}
                className="flex items-center gap-1 text-xs font-semibold text-emerald active:opacity-70"
              >
                <Plus size={13} /> Adicionar
              </button>
            </div>

            {vacFormOpen && (
              <div className="bg-base-surface border border-base-border rounded-xl p-3 space-y-2 mb-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="vac-inicio">Início</label>
                    <input id="vac-inicio" type="date" value={newVacInicio} onChange={(e) => setNewVacInicio(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="vac-fim">Término</label>
                    <input id="vac-fim" type="date" value={newVacFim} min={newVacInicio} onChange={(e) => setNewVacFim(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setVacFormOpen(false)} className="flex-1 py-1.5 rounded-lg bg-base-card border border-base-border text-xs font-semibold active:bg-base-hover/5">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (newVacInicio && newVacFim && newVacFim >= newVacInicio) {
                        const overlap = findOverlappingVacation(vacations, newVacInicio, newVacFim);
                        if (overlap) {
                          setVacConflito(overlap);
                          return;
                        }
                        setVacations((prev) => [...prev, { id: crypto.randomUUID(), dataInicio: newVacInicio, dataFim: newVacFim }]);
                        setVacFormOpen(false);
                      }
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-emerald text-black text-xs font-semibold active:bg-emerald/80"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            )}

            {vacations.length === 0 && !vacFormOpen && (
              <p className="text-xs text-base-muted text-center py-2">Nenhum período de férias.</p>
            )}

            {vacations
              .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio))
              .map((v) => (
                <div key={v.id} className="flex items-center justify-between bg-blue-500/10 border border-blue-500/25 rounded-xl px-3 py-2 mb-1.5">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                    {new Date(v.dataInicio + 'T12:00').toLocaleDateString('pt-BR')} a {new Date(v.dataFim + 'T12:00').toLocaleDateString('pt-BR')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setVacations((prev) => prev.filter((x) => x.id !== v.id))}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-red-500 active:bg-red-500/20 shrink-0 ml-2"
                    aria-label="Remover férias"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
          </div>

          <div className="pt-1">
            <div className="flex items-center gap-2 text-electric mb-2">
              <CalendarClock size={16} />
              <span className="text-xs font-semibold uppercase tracking-wide">Agendamento recorrente</span>
            </div>

            <div className="space-y-2">
              {DIAS.map((d) => {
                const item = agenda[d.value];
                const invalido = horarioErro && horarioInvalido(d.value);
                return (
                  <div
                    key={d.value}
                    className={`rounded-xl border px-3 py-2.5 transition-colors ${
                      invalido
                        ? 'border-red-500/60 bg-red-500/5'
                        : item.ativo
                          ? 'border-electric/50 bg-electric/5'
                          : 'border-base-border bg-base-surface'
                    }`}
                  >
                    <label className="flex items-center gap-2.5 !mb-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.ativo}
                        onChange={() => toggleDia(d.value)}
                        className="accent-electric"
                      />
                      <span className="text-sm font-semibold text-base-fg">{d.label}</span>
                    </label>

                    {item.ativo && (
                      <>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <label htmlFor={`inicio-${d.value}`} className="!mb-1">Início</label>
                            <input
                              id={`inicio-${d.value}`}
                              type="time"
                              value={item.inicio}
                              onChange={(e) => updateHorario(d.value, 'inicio', e.target.value)}
                              className={invalido ? '!border-red-500 focus:!border-red-500' : ''}
                            />
                          </div>
                          <div>
                            <label htmlFor={`fim-${d.value}`} className="!mb-1">Término</label>
                            <input
                              id={`fim-${d.value}`}
                              type="time"
                              value={item.fim}
                              onChange={(e) => updateHorario(d.value, 'fim', e.target.value)}
                              className={invalido ? '!border-red-500 focus:!border-red-500' : ''}
                            />
                          </div>
                        </div>
                        {invalido && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">
                            O término deve ser depois do início.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          {isEdit && onDelete && (
            <button
              onClick={() => setConfirmandoExclusao(true)}
              aria-label="Excluir aluno"
              className="w-12 h-12 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center active:bg-red-500/20"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            onClick={handleSubmit}
            className="flex-1 py-3 rounded-xl bg-emerald text-black text-sm font-semibold active:bg-emerald/80"
          >
            Salvar
          </button>
        </div>
      </div>

      {confirmandoExclusao && isEdit && onDelete && (
        <ConfirmDialog
          title="Excluir aluno"
          message={`Excluir ${aluno!.nome}? Esta ação não pode ser desfeita.`}
          onCancel={() => setConfirmandoExclusao(false)}
          onConfirm={() => {
            setConfirmandoExclusao(false);
            onDelete(aluno!.id);
          }}
        />
      )}

      {vacConflito && (
        <ConfirmDialog
          title="Período sobreposto"
          message="Já existe um período de férias que coincide com as datas informadas. Deseja substituir o período existente?"
          confirmLabel="Substituir"
          onCancel={() => setVacConflito(null)}
          onConfirm={() => {
            setVacations((prev) => [
              ...prev.filter((v) => v.id !== vacConflito.id),
              { id: crypto.randomUUID(), dataInicio: newVacInicio, dataFim: newVacFim },
            ]);
            setVacConflito(null);
            setVacFormOpen(false);
          }}
        />
      )}

      {confirmExcluirEtapa && (
        <ConfirmDialog
          title="Excluir etapa"
          message={`Excluir a etapa ${fmtBR(confirmExcluirEtapa.dataInicio)} a ${confirmExcluirEtapa.dataFim ? fmtBR(confirmExcluirEtapa.dataFim) : '—'}? Não há aulas registradas neste período, então a exclusão é segura. Esta ação só é aplicada ao clicar em Salvar.`}
          confirmLabel="Excluir etapa"
          onCancel={() => setConfirmExcluirEtapa(null)}
          onConfirm={commitExcluirEtapa}
        />
      )}
    </div>
  );
}
