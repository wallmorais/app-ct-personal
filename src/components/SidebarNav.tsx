import type { ViewName } from '../types';
import { NAV_ITEMS } from '../lib/navItems';
import { Logo } from './Logo';

interface Props {
  view: ViewName;
  onChange: (view: ViewName) => void;
}

export default function SidebarNav({ view, onChange }: Props) {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 bg-base-surface/60 border-r border-base-border">
      <div className="px-5 py-5 border-b border-base-border">
        <Logo variant="light" height={36} />
      </div>

      <nav className="flex-1 flex flex-col gap-1 p-3">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
          const active = view === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-emerald/10 text-emerald'
                  : 'text-base-muted hover:bg-base-hover/5 hover:text-base-fg'
              }`}
            >
              <Icon size={19} strokeWidth={active ? 2.5 : 2} />
              {label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
