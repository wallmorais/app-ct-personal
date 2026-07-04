import { useState } from 'react';
import { X, Trash2, CalendarClock } from 'lucide-react';
import type { Aluno, AulaSlot, DiaSemana, StudentEnrollment } from '../types';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  aluno: Aluno | null;
  slots: AulaSlot[];
  onSave: (aluno: Aluno, agenda: AgendaDia[]) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
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

function buildInitialAgenda(aluno: Aluno | null, slots: AulaSlot[]): AgendaState {
  const base: AgendaState = {};
  for (let d = 0; d <= 6; d++) base[d] = { ativo: false, inicio: '07:00', fim: '08:00' };

  if (!aluno) return base;

  for (const slot of slots) {
    if (!slot.alunoIds.includes(aluno.id)) continue;
    for (const dia of slot.dias) {
      base[dia] = {
        ativo: true,
        inicio: slot.horario,
        fim: slot.horarioFim ?? addOneHour(slot.horario),
      };
    }
  }

  return base;
}

export default function AlunoFormModal({ aluno, slots, onSave, onDelete, onClose }: Props) {
  const [nome, setNome] = useState(aluno?.nome ?? '');
  const [telefone, setTelefone] = useState(aluno?.telefone ?? '');
  const [plano, setPlano] = useState(aluno?.plano ?? 8);
  const [valorAula, setValorAula] = useState(aluno?.valorAula ?? 100);
  const [observacoes, setObservacoes] = useState(aluno?.observacoes ?? '');
  const [aniversario, setAniversario] = useState(aluno?.aniversario ?? '');
  const [objetivo, setObjetivo] = useState(aluno?.objetivo ?? '');
  const [restricoes, setRestricoes] = useState(aluno?.restricoes ?? '');
  const [dataAdesao, setDataAdesao] = useState(aluno?.dataAdesao ?? '');
  const [agenda, setAgenda] = useState<AgendaState>(() => buildInitialAgenda(aluno, slots));
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

    const agendaSelecionada: AgendaDia[] = DIAS.filter((d) => agenda[d.value].ativo).map((d) => ({
      dia: d.value,
      inicio: agenda[d.value].inicio,
      fim: agenda[d.value].fim,
    }));

    onSave(
      {
        id: aluno?.id ?? crypto.randomUUID(),
        nome: nome.trim(),
        telefone: telefone.trim(),
        plano: Number(plano) || 0,
        valorAula: Number(valorAula) || 0,
        observacoes: observacoes.trim(),
        aniversario: aniversario || undefined,
        objetivo: objetivo.trim() || undefined,
        restricoes: restricoes.trim() || undefined,
        dataAdesao: dataAdesao || undefined,
      },
      agendaSelecionada,
    );
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
                type="number"
                min={0}
                step="0.01"
                value={valorAula}
                onChange={(e) => setValorAula(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <label htmlFor="aluno-adesao">Data de adesão</label>
            <input
              id="aluno-adesao"
              type="date"
              value={dataAdesao}
              onChange={(e) => setDataAdesao(e.target.value)}
            />
            <p className="text-[11px] text-base-muted mt-1">
              O aluno aparece na agenda somente a partir desta data.
            </p>
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
    </div>
  );
}
