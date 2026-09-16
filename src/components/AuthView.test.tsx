// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthView from './AuthView';

const authMocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  resend: vi.fn(),
}));

const authState = vi.hoisted(() => ({ configured: true }));

vi.mock('../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/supabase')>();
  return {
    ...actual,
    get isSupabaseConfigured() {
      return authState.configured;
    },
    supabase: {
      auth: authMocks,
    },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authState.configured = true;
});

describe('AuthView — validação de formulário', () => {
  it('e-mail vazio bloqueia o envio e não chama signInWithPassword', () => {
    render(<AuthView />);

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByText('Informe seu e-mail.')).toBeTruthy();
    expect(authMocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('e-mail inválido bloqueia o envio e não chama signInWithPassword', () => {
    render(<AuthView />);

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'nao-e-email' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByText('E-mail inválido.')).toBeTruthy();
    expect(authMocks.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('AuthView — login', () => {
  it('exibe a mensagem traduzida por traduzErroAuth quando signInWithPassword retorna erro', async () => {
    authMocks.signInWithPassword.mockResolvedValueOnce({
      error: { message: 'Invalid login credentials' },
    });

    render(<AuthView />);

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'rodrigo@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(screen.getByText('E-mail ou senha incorretos.')).toBeTruthy();
    });
    expect(authMocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'rodrigo@example.com',
      password: 'senha123',
    });
  });
});

describe('AuthView — cadastro', () => {
  function irParaCadastro() {
    render(<AuthView />);
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  }

  it('senha com menos de 6 caracteres bloqueia o envio e não chama signUp', () => {
    irParaCadastro();

    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Rodrigo' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'rodrigo@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(screen.getByText('A senha deve ter pelo menos 6 caracteres.')).toBeTruthy();
    expect(authMocks.signUp).not.toHaveBeenCalled();
  });

  it('confirmação de senha diferente bloqueia o envio e não chama signUp', () => {
    irParaCadastro();

    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Rodrigo' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'rodrigo@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha123' } });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'outrasenha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(screen.getByText('As senhas não coincidem.')).toBeTruthy();
    expect(authMocks.signUp).not.toHaveBeenCalled();
  });

  it('cadastro bem-sucedido exibe mensagem de sucesso e permite reenviar confirmação', async () => {
    authMocks.signUp.mockResolvedValueOnce({ error: null });
    authMocks.resend.mockResolvedValueOnce({ error: null });

    irParaCadastro();

    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Rodrigo' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'rodrigo@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha123' } });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'senha123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => {
      expect(
        screen.getByText('Conta criada! Verifique seu e-mail e clique no link de confirmação para ativar sua conta.'),
      ).toBeTruthy();
    });
    expect(authMocks.signUp).toHaveBeenCalledWith({
      email: 'rodrigo@example.com',
      password: 'senha123',
      options: {
        data: { nome: 'Rodrigo' },
        emailRedirectTo: window.location.origin,
      },
    });

    const botaoReenviar = screen.getByRole('button', { name: 'Reenviar e-mail de confirmação' });
    fireEvent.click(botaoReenviar);

    await waitFor(() => {
      expect(authMocks.resend).toHaveBeenCalledWith({ type: 'signup', email: 'rodrigo@example.com' });
    });
  });
});

describe('AuthView — recuperação de senha', () => {
  it('fluxo "Esqueci minha senha" chama resetPasswordForEmail com o e-mail informado', async () => {
    authMocks.resetPasswordForEmail.mockResolvedValueOnce({ error: null });

    render(<AuthView />);

    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'rodrigo@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de redefinição' }));

    await waitFor(() => {
      expect(authMocks.resetPasswordForEmail).toHaveBeenCalledWith('rodrigo@example.com', {
        redirectTo: window.location.origin,
      });
    });
    await waitFor(() => {
      expect(
        screen.getByText('E-mail enviado! Verifique sua caixa de entrada e clique no link para redefinir a senha.'),
      ).toBeTruthy();
    });
  });
});

describe('AuthView — Supabase não configurado', () => {
  it('exibe o aviso de configuração e não realiza chamadas de autenticação', () => {
    authState.configured = false;

    render(<AuthView />);

    expect(screen.getByText(/Supabase ainda não configurado/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'rodrigo@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      screen.getByText('Supabase não configurado. Preencha o arquivo .env com a URL e a anon key do seu projeto.'),
    ).toBeTruthy();
    expect(authMocks.signInWithPassword).not.toHaveBeenCalled();
    expect(authMocks.signUp).not.toHaveBeenCalled();
    expect(authMocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
