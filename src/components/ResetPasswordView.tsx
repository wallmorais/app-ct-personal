import { useState } from 'react';
import { Lock, Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { supabase, traduzErroAuth } from '../lib/supabase';
import { Logo } from './Logo';

export default function ResetPasswordView() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErro('');

    if (password.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setErro('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErro(traduzErroAuth(error.message));
      } else {
        setDone(true);
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch {
      setErro('Erro de conexão. Verifique sua internet.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-base-bg flex items-center justify-center px-5 py-8">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo variant="light" height={44} />
        </div>

        <div className="bg-base-card border border-base-border rounded-2xl p-6 sm:p-7 shadow-xl shadow-black/20">
          <h2 className="text-xl font-bold mb-1">Nova senha</h2>

          {done ? (
            <div className="space-y-4">
              <p className="text-sm text-base-muted">Escolha uma nova senha para sua conta.</p>
              <div
                role="status"
                className="flex items-center gap-2 text-sm text-emerald bg-emerald/10 border border-emerald/20 rounded-xl px-3 py-2.5"
              >
                <CheckCircle2 size={16} className="shrink-0" />
                Senha redefinida com sucesso!
              </div>
              <p className="text-xs text-base-muted">Você já pode usar o app normalmente.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 mt-4" noValidate>
              <p className="text-sm text-base-muted">Escolha uma nova senha para sua conta.</p>

              <div>
                <label htmlFor="new-password">Nova senha</label>
                <div className="relative">
                  <Lock
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    aria-label="Nova senha"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (erro) setErro('');
                    }}
                    disabled={loading}
                    placeholder="Mínimo 6 caracteres"
                    className="pl-9 pr-10 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-base-muted hover:text-base-fg rounded-lg"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password">Confirmar senha</label>
                <div className="relative">
                  <Lock
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    aria-label="Confirmar senha"
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      if (erro) setErro('');
                    }}
                    disabled={loading}
                    placeholder="Repita a nova senha"
                    className="pl-9 disabled:opacity-60"
                  />
                </div>
              </div>

              {erro && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {erro}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald text-black text-sm font-semibold active:bg-emerald/80 hover:bg-emerald/90 transition-colors disabled:opacity-60"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                Salvar nova senha
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
