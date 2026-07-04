import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Indica se as variáveis de ambiente do Supabase foram configuradas.
 * Quando false, a tela de login exibe um aviso em vez de quebrar.
 */
export const isSupabaseConfigured =
  !!supabaseUrl &&
  !!supabaseAnonKey &&
  !supabaseUrl.includes('xxxx') &&
  supabaseAnonKey !== 'eyJ...';

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Traduz mensagens de erro do Supabase para PT-BR amigável. */
export function traduzErroAuth(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'Já existe uma conta com este e-mail.';
  if (m.includes('password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.';
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return 'E-mail inválido.';
  if (m.includes('rate limit') || m.includes('too many requests'))
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (m.includes('user not found')) return 'Usuário não encontrado.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Erro de conexão. Verifique sua internet.';
  return 'Ocorreu um erro inesperado. Tente novamente.';
}
