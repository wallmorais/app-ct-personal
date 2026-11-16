// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import ConfigView from './ConfigView';
import { buildEmptyData } from '../lib/testFixtures';

const signOut = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ configured: true }));

vi.mock('../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/supabase')>();
  return {
    ...actual,
    get isSupabaseConfigured() {
      return state.configured;
    },
    supabase: { auth: { signOut, updateUser: vi.fn() } },
  };
});

const repo = vi.hoisted(() => ({ updateProfile: vi.fn(), fetchProfile: vi.fn() }));
vi.mock('../lib/supabaseRepo', () => repo);

const notif = vi.hoisted(() => ({
  getNotificationPermission: vi.fn(() => 'granted'),
  requestNotificationPermission: vi.fn(),
  sendTestNotification: vi.fn(),
}));
vi.mock('../lib/notifications', () => notif);

const session = { user: { id: 'u1', email: 'ale@example.com' } } as unknown as Session;

const perfil = { id: 'u1', nome: 'Alessandra Alves', telefone: '', cidade: '' };
const onProfileChange = vi.fn();
const onTestNotification = vi.fn();

function renderConfig(withSession: Session | null = session, profile: typeof perfil | null = perfil) {
  return render(
    <ConfigView
      data={buildEmptyData()}
      setData={vi.fn()}
      pendingToday={0}
      onTestNotification={onTestNotification}
      themePref="system"
      onChangeTheme={vi.fn()}
      profile={profile}
      onProfileChange={onProfileChange}
      session={withSession}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  state.configured = true;
  notif.getNotificationPermission.mockReturnValue('granted');
});

describe('ConfigView — Sair da conta', () => {
  it('com sessão: mostra a seção Conta com o botão "Sair da conta"', () => {
    renderConfig();
    expect(screen.getByText('ale@example.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sair da conta' })).toBeTruthy();
  });

  it('sem sessão (modo local, sem Supabase): não há conta, então não há botão de sair', () => {
    state.configured = false;
    renderConfig(null);
    expect(screen.queryByRole('button', { name: 'Sair da conta' })).toBeNull();
  });

  it('clicar em Sair pede confirmação; Cancelar não desloga', () => {
    renderConfig();
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));

    expect(screen.getByText(/precisar entrar de novo/)).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.queryByText(/precisar entrar de novo/)).toBeNull();
  });

  it('confirmar desloga', async () => {
    signOut.mockResolvedValue({ error: null });
    renderConfig();
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it('falha ao sair mostra erro e reabilita o botão', async () => {
    signOut.mockResolvedValue({ error: { message: 'Failed to fetch' } });
    renderConfig();
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await screen.findByText(/Não foi possível sair/);
    expect((screen.getByRole('button', { name: 'Sair da conta' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('ConfigView — Testar notificação', () => {
  const testar = () => fireEvent.click(screen.getByRole('button', { name: 'Testar notificação agora' }));

  it('com permissão: dispara a notificação do sistema mesmo sem aulas pendentes e confirma', async () => {
    notif.sendTestNotification.mockResolvedValue(true);
    renderConfig();
    testar();

    await screen.findByText(/Notificação de teste enviada/);
    expect(notif.sendTestNotification).toHaveBeenCalledTimes(1);
    expect(onTestNotification).toHaveBeenCalledTimes(1);
  });

  it('aparelho recusa a notificação: avisa o erro', async () => {
    notif.sendTestNotification.mockResolvedValue(false);
    renderConfig();
    testar();

    await screen.findByText(/recusou a notificação/);
  });

  it('sem permissão: orienta a ativar e não tenta enviar', async () => {
    notif.getNotificationPermission.mockReturnValue('default');
    renderConfig();
    testar();

    await screen.findByText(/não estão ativadas/);
    expect(notif.sendTestNotification).not.toHaveBeenCalled();
  });

  it('navegador sem suporte: explica que o lembrete é só dentro do app', async () => {
    notif.getNotificationPermission.mockReturnValue('unsupported');
    renderConfig();
    testar();

    await screen.findByText(/não mostra notificações do sistema/);
    expect(notif.sendTestNotification).not.toHaveBeenCalled();
  });
});

describe('ConfigView — Editar perfil', () => {
  const editar = () => fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

  it('perfil carregado: abre o formulário preenchido e salva', async () => {
    repo.updateProfile.mockResolvedValue(undefined);
    renderConfig();
    editar();

    const nome = screen.getByLabelText('Nome', { selector: '#profile-nome' }) as HTMLInputElement;
    expect(nome.value).toBe('Alessandra Alves');
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Recife' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await screen.findByText('Perfil atualizado.');
    expect(repo.updateProfile).toHaveBeenCalledWith({ id: 'u1', nome: 'Alessandra Alves', telefone: '', cidade: 'Recife' });
    expect(onProfileChange).toHaveBeenCalledWith({ id: 'u1', nome: 'Alessandra Alves', telefone: '', cidade: 'Recife' });
  });

  it('perfil não carregado, mas existe no servidor: busca e abre preenchido', async () => {
    repo.fetchProfile.mockResolvedValue({ id: 'u1', nome: 'Wal', telefone: '11', cidade: '' });
    renderConfig(session, null);
    editar();

    await waitFor(() =>
      expect((screen.getByLabelText('Nome', { selector: '#profile-nome' }) as HTMLInputElement).value).toBe('Wal'),
    );
    expect(repo.fetchProfile).toHaveBeenCalledWith('u1');
    expect(onProfileChange).toHaveBeenCalledWith({ id: 'u1', nome: 'Wal', telefone: '11', cidade: '' });
  });

  it('conta sem linha de perfil: abre em branco e o salvamento cria o perfil', async () => {
    repo.fetchProfile.mockResolvedValue(null);
    repo.updateProfile.mockResolvedValue(undefined);
    renderConfig(session, null);
    editar();

    const nome = (await screen.findByLabelText('Nome', { selector: '#profile-nome' })) as HTMLInputElement;
    expect(nome.value).toBe('');
    fireEvent.change(nome, { target: { value: 'Novo Nome' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await screen.findByText('Perfil atualizado.');
    expect(repo.updateProfile).toHaveBeenCalledWith({ id: 'u1', nome: 'Novo Nome', telefone: '', cidade: '' });
  });

  it('falha ao buscar o perfil: avisa em vez de não reagir', async () => {
    repo.fetchProfile.mockRejectedValue(new Error('Failed to fetch'));
    renderConfig(session, null);
    editar();

    await screen.findByText(/Não foi possível carregar seu perfil/);
    expect(screen.queryByLabelText('Nome', { selector: '#profile-nome' })).toBeNull();
  });
});
