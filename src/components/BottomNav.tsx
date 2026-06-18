import { CalendarDays, Users, BarChart3, Settings } from 'lucide-react';
import type { ViewName } from '../types';

interface Props {
  view: ViewName;
  onChange: (view: ViewName) => void;
}

const ITEMS: { key: ViewName; label: string; icon: typeof CalendarDays }[] = [
  { key: 'agenda', label: 'Agenda', icon: CalendarDays },
  { key: 'alunos', label: 'Alunos', icon: Users },
  { key: 'relatorios', label: 'Relatório', icon: BarChart3 },
  { key: 'config', label: 'Config', icon: Settings },
];

export default function BottomNav({ view, onChange }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-base-surface/95 backdrop-blur border-t border-base-border pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4 max-w-md sm:max-w-2xl mx-auto">
        {ITEMS.map(({ key, label, icon: Icon }) => {
          const active = view === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className="flex flex-col items-center justify-center gap-1 py-2.5 active:bg-white/5 transition-colors"
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.5 : 2}
                className={active ? 'text-emerald' : 'text-base-muted'}
              />
              <span className={`text-[11px] font-medium ${active ? 'text-emerald' : 'text-base-muted'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
