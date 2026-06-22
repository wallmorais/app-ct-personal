import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  alunoNome: string;
  initialObservacao?: string;
  onConfirm: (observacao: string) => void;
  onClose: () => void;
}

export default function FaltaModal({ alunoNome, initialObservacao, onConfirm, onClose }: Props) {
  const [observacao, setObservacao] = useState(initialObservacao ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-base-card border border-base-border rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center">
              <X size={18} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Marcar falta</h2>
              <p className="text-xs text-base-muted">{alunoNome}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-base-muted active:text-white">
            <X size={20} />
          </button>
        </div>

        <div>
          <label htmlFor="falta-observacao">Observação (opcional)</label>
          <textarea
            id="falta-observacao"
            rows={3}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: avisou com antecedência, doente, etc."
          />
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-base-surface border border-base-border text-sm font-medium active:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(observacao)}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-semibold active:bg-red-500/80"
          >
            Confirmar falta
          </button>
        </div>
      </div>
    </div>
  );
}
