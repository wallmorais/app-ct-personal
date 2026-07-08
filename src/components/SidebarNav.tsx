import type { Profile, ViewName } from '../types';
import { NAV_ITEMS } from '../lib/navItems';
import { Logo } from './Logo';
import UserMenu from './UserMenu';

interface Props {
  view: ViewName;
  onChange: (view: ViewName) => void;
  profile?: Profile | null;
  email?: string;
}

export default function SidebarNav({ view, onChange, profile, email }: Props) {
  const mainItems = NAV_ITEMS.filter((i) => i.key !== 'config');
  const configItem = NAV_ITEMS.find((i) => i.key === 'config');

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 bg-base-surface/60 border-r border-base-border">
      <div className="px-5 py-5 border-b border-base-border">
        <Logo variant="light" height={36} />
      </div>

      <nav className="flex-1 flex flex-col p-3">
        <div className="flex flex-col gap-0.5">
          {mainItems.map(({ key, label, icon: Icon }) => {
            const active = view === key;
            return (
              <button
                key={key}
                onClick={() => onChange(key)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative ${
                  active
                    ? 'bg-emerald/10 text-emerald'
                    : 'text-base-muted hover:bg-base-hover/5 hover:text-base-fg'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-emerald rounded-r-full" />
                )}
                <Icon size={19} strokeWidth={active ? 2.5 : 2} />
                {label}
              </button>
            );
          })}
        </div>

        <div className="my-3 mx-2 border-t border-base-border/50" />

        {configItem && (
          <button
            onClick={() => onChange(configItem.key)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative ${
              view === 'config'
                ? 'bg-emerald/10 text-emerald'
                : 'text-base-muted hover:bg-base-hover/5 hover:text-base-fg'
            }`}
          >
            {view === 'config' && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-emerald rounded-r-full" />
            )}
            <configItem.icon size={19} strokeWidth={view === 'config' ? 2.5 : 2} />
            {configItem.label}
          </button>
        )}

        <div className="mt-auto" />
      </nav>

      {email && (
        <div className="border-t border-base-border p-3">
          <UserMenu profile={profile ?? null} email={email} onNavigate={onChange} />
        </div>
      )}
    </aside>
  );
}
