import { useState } from 'react';
import { Mail, Lock, ArrowLeft, Loader2, CheckCircle2, AlertTriangle, Eye, EyeOff, User } from 'lucide-react';
import { supabase, isSupabaseConfigured, traduzErroAuth } from '../lib/supabase';
import { Logo } from './Logo';

type Mode = 'login' | 'signup' | 'forgot';

function isEmailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AuthView() {
  const [mode, setMode] = useState<Mode>('login');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  function limparMensagens() {
    setErro('');
    setSucesso('');
  }

  function trocarModo(novo: Mode) {
    setMode(novo);
    limparMensagens();
    setPassword('');
    setConfirmPassword('');
  }

  function validar(): string | null {
    if (mode === 'signup' && !nome.trim()) return 'Informe seu nome.';
    if (!email.trim()) return 'Informe seu e-mail.';
    if (!isEmailValido(email.trim())) return 'E-mail inválido.';
    if (mode === 'forgot') return null;
    if (!password) return 'Informe sua senha.';
    if (password.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';
    if (mode === 'signup') {
      if (!confirmPassword) return 'Confirme sua senha.';
      if (password !== confirmPassword) return 'As senhas não coincidem.';
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    limparMensagens();

    const erroValidacao = validar();
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }

    if (!isSupabaseConfigured) {
      setErro('Supabase não configurado. Preencha o arquivo .env com a URL e a anon key do seu projeto.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) setErro(traduzErroAuth(error.message));
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { nome: nome.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) {
          setErro(traduzErroAuth(error.message));
        } else {
          setSucesso('Conta criada! Verifique seu e-mail e clique no link de confirmação para ativar sua conta.');
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (error) {
          setErro(traduzErroAuth(error.message));
        } else {
          setSucesso('E-mail enviado! Verifique sua caixa de entrada e clique no link para redefinir a senha.');
        }
      }
    } catch {
      setErro('Erro de conexão. Verifique sua internet.');
    } finally {
      setLoading(false);
    }
  }

  const titulo = mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Redefinir senha';

  return (
    <div className="min-h-screen min-h-[100dvh] bg-base-bg flex">
      {/* Coluna esquerda — institucional (somente desktop) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden border-r border-base-border">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/20 via-base-bg to-base-bg" aria-hidden="true" />
        <div
          className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-electric/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          <Logo variant="light" height={44} />
          <div className="max-w-md">
            <h1 className="text-3xl xl:text-4xl font-bold leading-tight">
              Controle completo das suas aulas, presenças e faturamento.
            </h1>
            <p className="mt-4 text-base-muted text-base leading-relaxed">
              Agenda, reposições, relatórios em PDF e acompanhamento financeiro — tudo em um só lugar,
              feito para o dia a dia do personal trainer.
            </p>
          </div>
          <p className="text-xs text-base-muted">© {new Date().getFullYear()} PT.Control</p>
        </div>
      </div>

      {/* Coluna direita — formulário */}
      <div className="flex-1 flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm">
          {/* Logo no topo (somente mobile/tablet) */}
          <div className="flex justify-center mb-8 lg:hidden">
            <Logo variant="light" height={44} />
          </div>

          <div className="bg-base-card border border-base-border rounded-2xl p-6 sm:p-7 shadow-xl shadow-black/20">
            {(mode === 'forgot' || mode === 'signup') && (
              <button
                type="button"
                onClick={() => trocarModo('login')}
                className="flex items-center gap-1.5 text-xs text-base-muted hover:text-base-fg mb-4 transition-colors"
              >
                <ArrowLeft size={14} /> Voltar para o login
              </button>
            )}

            <h2 className="text-xl font-bold mb-1">{titulo}</h2>
            <p className="text-sm text-base-muted mb-5">
              {mode === 'login' && 'Acesse sua conta para gerenciar suas aulas.'}
              {mode === 'signup' && 'Crie sua conta para começar a usar o PT.Control.'}
              {mode === 'forgot' && 'Informe seu e-mail e enviaremos um link de redefinição.'}
            </p>

            {!isSupabaseConfigured && (
              <div
                role="alert"
                className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 mb-4"
              >
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>
                  Supabase ainda não configurado. Preencha o arquivo <code className="font-mono">.env</code> com a
                  URL e a anon key do seu projeto para ativar o login.
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {mode === 'signup' && (
                <div>
                  <label htmlFor="auth-nome">Nome completo</label>
                  <div className="relative">
                    <User
                      size={15}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="auth-nome"
                      type="text"
                      autoComplete="name"
                      required
                      aria-label="Nome completo"
                      value={nome}
                      onChange={(e) => {
                        setNome(e.target.value);
                        if (erro) setErro('');
                      }}
                      disabled={loading}
                      placeholder="Seu nome completo"
                      className="pl-9 disabled:opacity-60"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="auth-email">E-mail</label>
                <div className="relative">
                  <Mail
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    aria-label="E-mail"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (erro) setErro('');
                    }}
                    disabled={loading}
                    placeholder="seu@email.com"
                    className="pl-9 disabled:opacity-60"
                  />
                </div>
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label htmlFor="auth-password">Senha</label>
                  <div className="relative">
                    <Lock
                      size={15}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      required
                      aria-label="Senha"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (erro) setErro('');
                      }}
                      disabled={loading}
                      placeholder={mode === 'signup' ? 'Mínimo 6 caracteres' : '••••••••'}
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
              )}

              {mode === 'signup' && (
                <div>
                  <label htmlFor="auth-confirm">Confirmar senha</label>
                  <div className="relative">
                    <Lock
                      size={15}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="auth-confirm"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      aria-label="Confirmar senha"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (erro) setErro('');
                      }}
                      disabled={loading}
                      placeholder="Repita a senha"
                      className="pl-9 disabled:opacity-60"
                    />
                  </div>
                </div>
              )}

              {mode === 'login' && (
                <div className="flex items-center justify-between">
                  <div />
                  <button
                    type="button"
                    onClick={() => trocarModo('forgot')}
                    className="text-xs font-medium text-emerald hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              )}

              {erro && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {erro}
                </p>
              )}
              {sucesso && (
                <div
                  role="status"
                  className="flex items-start gap-2 text-xs text-emerald bg-emerald/10 border border-emerald/20 rounded-xl px-3 py-2.5"
                >
                  <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                  <span>{sucesso}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald text-black text-sm font-semibold active:bg-emerald/80 hover:bg-emerald/90 transition-colors disabled:opacity-60"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link de redefinição'}
              </button>
            </form>

            {mode === 'login' && (
              <p className="text-center text-xs text-base-muted mt-4">
                Ainda não tem conta?{' '}
                <button
                  type="button"
                  onClick={() => trocarModo('signup')}
                  className="font-semibold text-emerald hover:underline"
                >
                  Criar conta
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
