import { AlertTriangle, X } from 'lucide-react';

interface Props {
  pendingCount: number;
  onDismiss: () => void;
}

export default function AlertBanner({ pendingCount, onDismiss }: Props) {
  return (
    <div className="px-4 pt-3">
      <div className="flex items-start gap-3 bg-amber-500/15 border border-amber-500/40 rounded-2xl px-4 py-3">
        <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Lembrete diário</p>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-0.5">
            Você tem {pendingCount} {pendingCount === 1 ? 'aula' : 'aulas'} de hoje sem check-in.
            Atualize a presença na aba Agenda.
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dispensar lembrete"
          className="text-amber-700/70 dark:text-amber-300/70 active:text-amber-900 dark:active:text-amber-100 shrink-0"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
