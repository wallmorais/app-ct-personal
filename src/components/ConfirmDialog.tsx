import { AlertTriangle } from 'lucide-react';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ title, message, confirmLabel = 'Excluir', onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-5">
      <div className="w-full max-w-sm bg-base-card border border-base-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle size={18} />
          <h2 className="text-base font-semibold text-base-fg">{title}</h2>
        </div>
        <p className="text-sm text-base-muted">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-base-surface border border-base-border text-sm font-semibold active:bg-base-hover/5"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold active:bg-red-500/80"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
