// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AppData } from './types';
import { buildAluno, buildEmptyData } from './lib/testFixtures';

const USER_ID = 'user-1';
const STORAGE_KEY = 'pt-control:data';
const OFFLINE_KEY = 'pt-control:offline-edits';

const repo = vi.hoisted(() => ({
  fetchAppData: vi.fn(),
  persistAppData: vi.fn(),
  fetchProfile: vi.fn(),
}));

vi.mock('./lib/supabaseRepo', () => repo);

vi.mock('./lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: 'user-1', email: 'a@b.c' }, access_token: 't' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve(),
    },
  },
}));

// View enxuta: mostra quantos alunos o App tem em memória e permite uma edição.
vi.mock('./components/AgendaView', () => ({
  default: ({ data, onUpdateRegistro }: { data: AppData; onUpdateRegistro: (...args: unknown[]) => void }) => (
    <div>
      <span data-testid="alunos">{data.alunos.map((a) => a.nome).join(',')}</span>
      <span data-testid="registros">{data.registros.length}</span>
      <button onClick={() => onUpdateRegistro('aluno-x', 'slot-x', '2026-11-16', '07:00', 'presente')}>editar</button>
    </div>
  ),
}));

import App from './App';

const local = () => buildEmptyData({ alunos: [buildAluno({ nome: 'Local' })] });
const remote = () => buildEmptyData({ alunos: [buildAluno({ nome: 'Servidor' })] });

/** Espera além do debounce de 500 ms da persistência. */
const passDebounce = () => act(() => new Promise<void>((r) => setTimeout(r, 700)));

async function renderApp() {
  render(<App />);
  await screen.findByTestId('alunos');
}

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as typeof window.matchMedia;
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  repo.fetchProfile.mockResolvedValue(null);
  repo.persistAppData.mockResolvedValue(undefined);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(local()));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('App — leitura inicial do Supabase', () => {
  it('leitura ok → usa os dados do servidor', async () => {
    repo.fetchAppData.mockResolvedValue(remote());
    await renderApp();

    await waitFor(() => expect(screen.getByTestId('alunos').textContent).toBe('Servidor'));
    expect(screen.queryByText(/alterações ficam só neste aparelho/)).toBeNull();
  });

  it('leitura falha → mantém cache local e NÃO grava no servidor', async () => {
    repo.fetchAppData.mockRejectedValue(new Error('Failed to fetch'));
    await renderApp();

    await screen.findByText(/alterações ficam só neste aparelho/);
    expect(screen.getByTestId('alunos').textContent).toBe('Local');

    await passDebounce();
    expect(repo.persistAppData).not.toHaveBeenCalled();
  });

  it('leitura falha + edição offline → continua sem gravar no servidor e marca alterações offline', async () => {
    repo.fetchAppData.mockRejectedValue(new Error('Failed to fetch'));
    await renderApp();
    await screen.findByText(/alterações ficam só neste aparelho/);

    fireEvent.click(screen.getByText('editar'));
    await waitFor(() => expect(screen.getByTestId('registros').textContent).toBe('1'));

    await passDebounce();
    expect(repo.persistAppData).not.toHaveBeenCalled();
    expect(localStorage.getItem(OFFLINE_KEY)).toBe(USER_ID);
    // A edição fica preservada no cache local.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).registros).toHaveLength(1);
  });

  it('falha, sem edição, nova tentativa ok → usa o servidor sem perguntar', async () => {
    repo.fetchAppData.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue(remote());
    await renderApp();
    await screen.findByText(/alterações ficam só neste aparelho/);

    fireEvent.click(screen.getByText('Tentar de novo'));

    await waitFor(() => expect(screen.getByTestId('alunos').textContent).toBe('Servidor'));
    expect(screen.queryByText('Qual versão dos dados manter?')).toBeNull();
  });

  it('nova tentativa automática quando a rede volta (evento online)', async () => {
    repo.fetchAppData.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue(remote());
    await renderApp();
    await screen.findByText(/alterações ficam só neste aparelho/);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(screen.getByTestId('alunos').textContent).toBe('Servidor'));
  });

  it('falha, edição offline, nova tentativa ok → pergunta; nada é gravado antes da escolha', async () => {
    repo.fetchAppData.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue(remote());
    await renderApp();
    await screen.findByText(/alterações ficam só neste aparelho/);
    fireEvent.click(screen.getByText('editar'));
    fireEvent.click(screen.getByText('Tentar de novo'));

    await screen.findByText('Qual versão dos dados manter?');
    expect(screen.getByTestId('alunos').textContent).toBe('Local');

    await passDebounce();
    expect(repo.persistAppData).not.toHaveBeenCalled();
  });

  it('conflito → "Manter as deste aparelho" envia o estado local', async () => {
    repo.fetchAppData.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue(remote());
    await renderApp();
    await screen.findByText(/alterações ficam só neste aparelho/);
    fireEvent.click(screen.getByText('editar'));
    fireEvent.click(screen.getByText('Tentar de novo'));
    await screen.findByText('Qual versão dos dados manter?');

    fireEvent.click(screen.getByText('Manter as deste aparelho'));

    await waitFor(() => expect(repo.persistAppData).toHaveBeenCalledTimes(1));
    const enviado = repo.persistAppData.mock.calls[0][1] as AppData;
    expect(enviado.alunos.map((a) => a.nome)).toEqual(['Local']);
    expect(enviado.registros).toHaveLength(1);
    expect(screen.queryByText('Qual versão dos dados manter?')).toBeNull();
    expect(localStorage.getItem(OFFLINE_KEY)).toBeNull();
  });

  it('conflito → "Usar as do servidor" descarta o local e nunca o envia', async () => {
    repo.fetchAppData.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue(remote());
    await renderApp();
    await screen.findByText(/alterações ficam só neste aparelho/);
    fireEvent.click(screen.getByText('editar'));
    fireEvent.click(screen.getByText('Tentar de novo'));
    await screen.findByText('Qual versão dos dados manter?');

    fireEvent.click(screen.getByText('Usar as do servidor'));

    await waitFor(() => expect(screen.getByTestId('alunos').textContent).toBe('Servidor'));
    await passDebounce();
    for (const call of repo.persistAppData.mock.calls) {
      expect((call[1] as AppData).alunos.map((a) => a.nome)).toEqual(['Servidor']);
    }
    expect(localStorage.getItem(OFFLINE_KEY)).toBeNull();
  });

  it('alterações offline de uma sessão anterior (app fechado e reaberto) → pergunta mesmo com leitura ok', async () => {
    localStorage.setItem(OFFLINE_KEY, USER_ID);
    repo.fetchAppData.mockResolvedValue(remote());
    await renderApp();

    await screen.findByText('Qual versão dos dados manter?');
    expect(screen.getByTestId('alunos').textContent).toBe('Local');
  });

  it('marca de alterações offline de OUTRO usuário é ignorada', async () => {
    localStorage.setItem(OFFLINE_KEY, 'outro-usuario');
    repo.fetchAppData.mockResolvedValue(remote());
    await renderApp();

    await waitFor(() => expect(screen.getByTestId('alunos').textContent).toBe('Servidor'));
    expect(screen.queryByText('Qual versão dos dados manter?')).toBeNull();
  });

  it('salvamento normal é silencioso: sem aviso de "Salvando" nem "Salvo", mas fica no registro', async () => {
    repo.fetchAppData.mockResolvedValue(remote());
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('alunos').textContent).toBe('Servidor'));

    fireEvent.click(screen.getByText('editar'));
    expect(screen.queryByText('Salvando…')).toBeNull();

    await waitFor(() => expect(repo.persistAppData).toHaveBeenCalled());
    await passDebounce();
    expect(screen.queryByText('Salvando…')).toBeNull();
    expect(screen.queryByText(/Salvo ✓/)).toBeNull();
    expect(localStorage.getItem('pt-control:sync-log')).toContain('gravacao_ok');
  });

  it('erro ao salvar continua aparecendo na hora, com "Tentar de novo", e vai para o registro', async () => {
    repo.fetchAppData.mockResolvedValue(remote());
    repo.persistAppData.mockRejectedValue({ message: 'timeout', code: '57014' });
    await renderApp();
    await waitFor(() => expect(screen.getByTestId('alunos').textContent).toBe('Servidor'));

    fireEvent.click(screen.getByText('editar'));

    const aviso = await screen.findByRole('alert', {}, { timeout: 2000 });
    expect(aviso.textContent).toContain('Erro ao salvar');
    expect(screen.getByText('Tentar de novo')).toBeTruthy();
    expect(localStorage.getItem('pt-control:sync-log')).toContain('gravacao_falhou');
    expect(localStorage.getItem('pt-control:sync-log')).toContain('57014 timeout');
  });

  it('servidor vazio + dados locais (primeiro acesso) → sobe o local, sem perguntar', async () => {
    repo.fetchAppData.mockResolvedValue(null);
    await renderApp();

    await waitFor(() => expect(repo.persistAppData).toHaveBeenCalled());
    expect((repo.persistAppData.mock.calls[0][1] as AppData).alunos.map((a) => a.nome)).toEqual(['Local']);
    expect(screen.queryByText('Qual versão dos dados manter?')).toBeNull();
  });
});
