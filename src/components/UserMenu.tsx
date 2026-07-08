import { useEffect, useRef, useState } from 'react';
import { LogOut, Settings, ChevronDown } from 'lucide-react';
import type { Profile, ViewName } from '../types';
import { supabase } from '../lib/supabase';

interface Props {
  profile: Profile | null;
  email: string;
  onNavigate: (view: ViewName) => void;
}

export default function UserMenu({ profile, email, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const displayName = profile?.nome?.trim() || email.split('@')[0];
  const initials = (profile?.nome || email).slice(0, 2).toUpperCase();

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-base-hover/10 transition-colors"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Menu do usuário"
      >
        <div className="w-8 h-8 rounded-full bg-emerald/20 flex items-center justify-center text-emerald text-xs font-bold shrink-0">
          {initials}
        </div>
        <span className="text-sm font-medium text-base-fg truncate max-w-[140px] hidden lg:inline">
          {displayName}
        </span>
        <ChevronDown
          size={14}
          className={`text-base-muted transition-transform hidden lg:block ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-56 bg-base-card border border-base-border rounded-xl shadow-xl shadow-black/20 py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="px-3.5 py-2.5 border-b border-base-border">
            <p className="text-sm font-semibold text-base-fg truncate">{displayName}</p>
            <p className="text-xs text-base-muted truncate">{email}</p>
          </div>

          <div className="py-1">
            <button
              role="menuitem"
              onClick={() => { onNavigate('config'); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-base-fg hover:bg-base-hover/10 transition-colors"
            >
              <Settings size={16} className="text-base-muted" />
              Configurações
            </button>
          </div>

          <div className="border-t border-base-border pt-1">
            <button
              role="menuitem"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
