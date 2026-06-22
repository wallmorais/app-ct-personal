import { useEffect } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

export interface ToastState {
  message: string;
  type: 'success' | 'error';
}

interface Props {
  toast: ToastState;
  onDismiss: () => void;
}

export default function Toast({ toast, onDismiss }: Props) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(id);
  }, [toast, onDismiss]);

  const isError = toast.type === 'error';

  return (
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 no-print">
      <div
        role="status"
        className={`flex items-center gap-2 max-w-sm w-full rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur ${
          isError
            ? 'bg-red-500/15 border-red-500/30 text-red-300'
            : 'bg-emerald/15 border-emerald/30 text-emerald'
        }`}
      >
        {isError ? (
          <XCircle size={18} className="shrink-0" />
        ) : (
          <CheckCircle2 size={18} className="shrink-0" />
        )}
        <span className="flex-1">{toast.message}</span>
      </div>
    </div>
  );
}
