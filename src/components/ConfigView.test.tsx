// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import ConfigView from './ConfigView';
import { buildAluno, buildEmptyData } from '../lib/testFixtures';
import type { AppData, Registro } from '../types';

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

const setData = vi.fn();

function renderConfig(
  withSession: Session | null = session,
  profile: typeof perfil | null = perfil,
  data: AppData = buildEmptyData(),
) {
  return render(
    <ConfigView
      data={data}
      setData={setData}
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

describe('ConfigView — Importar backup', () => {
  const aula = (data: string): Registro => ({
    id: `r-${data}`,
    alunoId: 'a1',
    slotId: 's1',
    data,
    horario: '07:00',
    status: 'presente',
  });

  function escolherArquivo(conteudo: string, nome = 'pt-control-backup-2026-08-01.json') {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([conteudo], nome, { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
  }

  const atual = () =>
    buildEmptyData({
      alunos: [buildAluno(), buildAluno(), buildAluno()],
      registros: [aula('2026-11-10'), aula('2026-11-16')],
    });
  const antigo = () => buildEmptyData({ alunos: [buildAluno()], registros: [aula('2026-08-01')] });

  it('mostra o resumo do arquivo ao lado dos dados atuais e não importa antes de confirmar', async () => {
    renderConfig(session, perfil, atual());
    escolherArquivo(JSON.stringify(antigo()));

    await screen.findByText('Importar backup?');
    expect(screen.getByText('pt-control-backup-2026-08-01.json')).toBeTruthy();
    const linha = (rotulo: string) =>
      Array.from(screen.getByText(rotulo).closest('tr')!.querySelectorAll('td')).map((td) => td.textContent);
    expect(linha('Alunos')).toEqual(['1', '3']);
    expect(linha('Aulas registradas')).toEqual(['1', '2']);
    expect(linha('Aula mais recente')).toEqual(['01/08/2026', '16/11/2026']);
    expect(setData).not.toHaveBeenCalled();
  });

  it('arquivo mais antigo que os dados atuais: avisa quais aulas serão perdidas', async () => {
    renderConfig(session, perfil, atual());
    escolherArquivo(JSON.stringify(antigo()));

    const aviso = await screen.findByText(/mais antigo que os dados atuais/);
    expect(aviso.textContent).toContain('depois de 01/08/2026 serão perdidas');
  });

  it('arquivo igual ou mais novo: sem aviso de arquivo antigo', async () => {
    renderConfig(session, perfil, antigo());
    escolherArquivo(JSON.stringify(atual()));

    await screen.findByText('Importar backup?');
    expect(screen.queryByText(/mais antigo que os dados atuais/)).toBeNull();
  });

  it('Cancelar não altera nada', async () => {
    renderConfig(session, perfil, atual());
    escolherArquivo(JSON.stringify(antigo()));
    await screen.findByText('Importar backup?');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(setData).not.toHaveBeenCalled();
    expect(localStorage.getItem('pt-control:app-backups')).not.toContain('antes_da_importacao');
  });

  it('confirmar: guarda cópia dos dados atuais e só então substitui', async () => {
    const dadosAtuais = atual();
    renderConfig(session, perfil, dadosAtuais);
    escolherArquivo(JSON.stringify(antigo()));
    await screen.findByText('Importar backup?');

    fireEvent.click(screen.getByRole('button', { name: 'Substituir dados' }));

    expect(setData).toHaveBeenCalledTimes(1);
    expect((setData.mock.calls[0][0] as AppData).registros.map((r) => r.data)).toEqual(['2026-08-01']);

    const backups = JSON.parse(localStorage.getItem('pt-control:app-backups')!);
    expect(backups[0].name).toMatch(/^antes_da_importacao_/);
    expect(backups[0].data.registros).toHaveLength(2);
    await screen.findByText(/dados anteriores ficaram guardados/);
  });

  it('arquivo inválido: mostra erro e não abre a confirmação', async () => {
    renderConfig(session, perfil, atual());
    escolherArquivo('{"alunos": "não é lista"}');

    await screen.findByText(/Não foi possível importar o arquivo/);
    expect(screen.queryByText('Importar backup?')).toBeNull();
    expect(setData).not.toHaveBeenCalled();
  });
});
