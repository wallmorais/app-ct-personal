import { useMemo, useState } from 'react';
import { X, RotateCw, Trash2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { todayISO } from '../lib/date';
import { isProfessorOnVacation, isStudentOnVacation } from '../lib/periods';
import type { AppData, Aluno } from '../types';

type Excecao = 'ferias_professor' | 'ferias_aluno';

interface Props {
  alunoNome: string;
  alunoId: string;
  aluno: Aluno;
  data: AppData;
  origData: string;
  origHorario: string;
  initialData?: string;
  initialHorario?: string;
  onConfirm: (data: string, horario: string, excecao?: Excecao[]) => void;
  onRemove?: () => void;
  onClose: () => void;
}

interface ValidationResult {
  blocking: string[];
  warnings: { key: Excecao; message: string }[];
}

function validate(
  reposicaoDate: string,
  origData: string,
  aluno: Aluno,
  appData: AppData,
  alunoId: string,
): ValidationResult {
  const blocking: string[] = [];
  const warnings: { key: Excecao; message: string }[] = [];

  if (reposicaoDate < origData) {
    blocking.push('A data da reposição não pode ser anterior à data da falta.');
  }

  if (aluno.dataAdesao && reposicaoDate < aluno.dataAdesao) {
    blocking.push('Não é possível agendar uma reposição antes da data de adesão do aluno.');
  }

  if (aluno.dataEncerramento && reposicaoDate > aluno.dataEncerramento) {
    blocking.push('Não é possível agendar uma reposição após o encerramento do contrato do aluno.');
  }

  if (isProfessorOnVacation(appData, reposicaoDate)) {
    warnings.push({
      key: 'ferias_professor',
      message: 'A data selecionada está dentro do período de férias do professor.',
    });
  }

  if (isStudentOnVacation(appData, alunoId, reposicaoDate)) {
    warnings.push({
      key: 'ferias_aluno',
      message: 'O aluno está em período de férias nesta data.',
    });
  }

  return { blocking, warnings };
}

export default function ReposicaoModal({
  alunoNome,
  alunoId,
  aluno,
  data: appData,
  origData,
  origHorario,
  initialData,
  initialHorario,
  onConfirm,
  onRemove,
  onClose,
}: Props) {
  const [data, setData] = useState(initialData ?? todayISO());
  const [horario, setHorario] = useState(initialHorario ?? '07:00');
  const [confirmedExceptions, setConfirmedExceptions] = useState<Set<Excecao>>(new Set());

  const mesmaDataHorarioOrigem = data === origData && horario === origHorario;

  const validation = useMemo(
    () => validate(data, origData, aluno, appData, alunoId),
    [data, origData, aluno, appData, alunoId],
  );

  const hasBlocking = validation.blocking.length > 0;
  const pendingWarnings = validation.warnings.filter((w) => !confirmedExceptions.has(w.key));
  const allWarningsConfirmed = pendingWarnings.length === 0;
  const canConfirm = !mesmaDataHorarioOrigem && !hasBlocking && allWarningsConfirmed;

  function handleDateChange(newDate: string) {
    setData(newDate);
    setConfirmedExceptions(new Set());
  }

  function handleConfirmException(key: Excecao) {
    setConfirmedExceptions((prev) => new Set(prev).add(key));
  }

  function handleSubmit() {
    const excecoes = validation.warnings.map((w) => w.key);
    onConfirm(data, horario, excecoes.length > 0 ? excecoes : undefined);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-base-card border border-base-border rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center">
              <RotateCw size={18} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold">
                {initialData ? 'Reagendar reposição' : 'Agendar reposição'}
              </h2>
              <p className="text-xs text-base-muted">{alunoNome}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-base-muted active:text-base-fg">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="reposicao-data">Data da reposição</label>
            <input
              id="reposicao-data"
              type="date"
              value={data}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="reposicao-horario">Horário</label>
            <input
              id="reposicao-horario"
              type="time"
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
            />
          </div>

          {mesmaDataHorarioOrigem && (
            <p className="text-xs text-red-600 dark:text-red-400">
              A reposição precisa ser em uma data ou horário diferente da aula original.
            </p>
          )}

          {/* Blocking errors */}
          {validation.blocking.map((msg, i) => (
            <div key={i} className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2.5">
              <ShieldAlert size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-red-700 dark:text-red-300">{msg}</p>
            </div>
          ))}

          {/* Exception warnings */}
          {!hasBlocking && pendingWarnings.map((w) => (
            <div key={w.key} className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{w.message}</p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                    Deseja manter esta reposição mesmo assim?
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-1.5 rounded-lg bg-base-card border border-base-border text-xs font-semibold active:bg-base-hover/5"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleConfirmException(w.key)}
                  className="flex-1 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold active:bg-amber-400"
                >
                  Confirmar Exceção
                </button>
              </div>
            </div>
          ))}

          {/* Confirmed exceptions summary */}
          {confirmedExceptions.size > 0 && pendingWarnings.length === 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1">Exceções confirmadas</p>
              {confirmedExceptions.has('ferias_professor') && (
                <p className="text-xs text-amber-700 dark:text-amber-300">✓ Professor em férias</p>
              )}
              {confirmedExceptions.has('ferias_aluno') && (
                <p className="text-xs text-amber-700 dark:text-amber-300">✓ Aluno em férias</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          {onRemove && (
            <button
              onClick={onRemove}
              aria-label="Remover reposição"
              className="w-12 h-12 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center active:bg-red-500/20"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-base-surface border border-base-border text-sm font-medium active:bg-base-hover/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canConfirm}
            className="flex-1 py-3 rounded-xl bg-amber-500 text-black text-sm font-semibold active:bg-amber-400 disabled:opacity-40 disabled:active:bg-amber-500"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
