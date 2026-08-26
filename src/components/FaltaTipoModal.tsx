import { X, MessageCircleWarning, PhoneOff } from 'lucide-react';
import type { TipoFalta } from '../types';

interface Props {
  alunoNome: string;
  onChoose: (tipo: TipoFalta) => void;
  onClose: () => void;
}

/**
 * Pergunta dedicada exibida ao marcar falta: distingue se o aluno avisou com
 * antecedência (falta normal — não cobra, gera reposição) ou não avisou
 * (tratada como aula realizada — cobra, sem reposição, mas fica registrado
 * o histórico de ausência sem aviso).
 */
export default function FaltaTipoModal({ alunoNome, onChoose, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-base-card border border-base-border rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Como foi a falta?</h2>
            <p className="text-xs text-base-muted">{alunoNome}</p>
          </div>
          <button onClick={onClose} className="text-base-muted active:text-base-fg">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-2.5">
          <button
            onClick={() => onChoose('avisada')}
            className="w-full flex items-start gap-3 p-4 rounded-2xl border border-base-border bg-base-surface text-left active:bg-base-hover/5 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
              <MessageCircleWarning size={18} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Avisada</p>
              <p className="text-xs text-base-muted mt-0.5">
                Aluno avisou com antecedência. Não cobra e gera direito à reposição.
              </p>
            </div>
          </button>

          <button
            onClick={() => onChoose('nao_avisada')}
            className="w-full flex items-start gap-3 p-4 rounded-2xl border border-base-border bg-base-surface text-left active:bg-base-hover/5 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
              <PhoneOff size={18} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Não avisada</p>
              <p className="text-xs text-base-muted mt-0.5">
                Aluno não avisou e não compareceu. Aula é cobrada normalmente e não gera reposição.
              </p>
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 py-3 rounded-xl bg-base-surface border border-base-border text-sm font-medium active:bg-base-hover/5"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
