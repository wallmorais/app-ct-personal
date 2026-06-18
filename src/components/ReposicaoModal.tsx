import { useState } from 'react';
import { X, RotateCw, Trash2 } from 'lucide-react';
import { todayISO } from '../lib/date';

interface Props {
  alunoNome: string;
  initialData?: string;
  initialHorario?: string;
  onConfirm: (data: string, horario: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}

export default function ReposicaoModal({
  alunoNome,
  initialData,
  initialHorario,
  onConfirm,
  onRemove,
  onClose,
}: Props) {
  const [data, setData] = useState(initialData ?? todayISO());
  const [horario, setHorario] = useState(initialHorario ?? '07:00');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-base-card border border-base-border rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center">
              <RotateCw size={18} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold">
                {initialData ? 'Reagendar reposição' : 'Agendar reposição'}
              </h2>
              <p className="text-xs text-base-muted">{alunoNome}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-base-muted active:text-white">
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
              onChange={(e) => setData(e.target.value)}
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
        </div>

        <div className="flex gap-3 mt-5">
          {onRemove && (
            <button
              onClick={onRemove}
              aria-label="Remover reposição"
              className="w-12 h-12 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center active:bg-red-500/20"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-base-surface border border-base-border text-sm font-medium active:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(data, horario)}
            className="flex-1 py-3 rounded-xl bg-amber-500 text-black text-sm font-semibold active:bg-amber-400"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
