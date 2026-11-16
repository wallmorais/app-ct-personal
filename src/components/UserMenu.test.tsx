// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import UserMenu, { initialsOf, syncStatusLabel, type SyncStatus } from './UserMenu';

const signOut = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut } },
}));

const onNavigate = vi.fn();
const onChangeTheme = vi.fn();

function renderMenu(props: { variant?: 'sidebar' | 'header'; syncStatus?: SyncStatus; lastSavedAt?: string | null } = {}) {
  return render(
    <UserMenu
      variant={props.variant ?? 'sidebar'}
      profile={{ id: 'u1', nome: 'Alessandra Alves', telefone: '', cidade: '' }}
      email="ale@example.com"
      onNavigate={onNavigate}
      themePref="system"
      onChangeTheme={onChangeTheme}
      syncStatus={props.syncStatus ?? 'idle'}
      lastSavedAt={props.lastSavedAt ?? null}
    />,
  );
}

const trigger = () => screen.getByRole('button', { name: /Menu da conta de Alessandra Alves/ });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('UserMenu — helpers', () => {
  it('iniciais: primeiro e último nome, nome único, ou e-mail', () => {
    expect(initialsOf('Alessandra Alves', 'x@y.z')).toBe('AA');
    expect(initialsOf('Maria da Silva Souza', 'x@y.z')).toBe('MS');
    expect(initialsOf('Wal', 'x@y.z')).toBe('WA');
    expect(initialsOf('', 'joao@y.z')).toBe('JO');
    expect(initialsOf(undefined, 'joao@y.z')).toBe('JO');
  });

  it('texto do estado de sincronização', () => {
    expect(syncStatusLabel('idle', null)).toBe('Tudo salvo');
    expect(syncStatusLabel('saved', '2026-11-16T14:32:00')).toMatch(/^Tudo salvo · 14:32$/);
    expect(syncStatusLabel('syncing', null)).toBe('Salvando…');
    expect(syncStatusLabel('error', null)).toBe('Erro ao salvar');
    expect(syncStatusLabel('offline', null)).toBe('Sem conexão com o servidor');
  });
});

describe('UserMenu — abrir e fechar', () => {
  it('fechado por padrão; abre no clique com nome, e-mail e ações', () => {
    renderMenu();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger());

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('ale@example.com')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Configurações e perfil' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Sair da conta' })).toBeTruthy();
  });

  it('ao abrir, o foco vai para o primeiro item', () => {
    renderMenu();
    fireEvent.click(trigger());
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Claro' }));
  });

  it('Escape fecha e devolve o foco ao botão', () => {
    renderMenu();
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('clique fora fecha', () => {
    renderMenu();
    fireEvent.click(trigger());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('seta para baixo no botão abre o menu', () => {
    renderMenu();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('setas navegam entre os itens, em ciclo; Home/End vão às pontas', () => {
    renderMenu();
    fireEvent.click(trigger());
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Escuro' }));

    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Sair da conta' }));

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Claro' }));

    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Sair da conta' }));

    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Claro' }));
  });

  it('variante celular: abre como painel com botão de fechar', () => {
    renderMenu({ variant: 'header' });
    fireEvent.click(trigger());

    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar menu' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('UserMenu — ações', () => {
  it('Configurações navega e fecha', () => {
    renderMenu();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Configurações e perfil' }));

    expect(onNavigate).toHaveBeenCalledWith('config');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('tema: marca o atual e troca ao clicar, sem fechar o menu', () => {
    renderMenu();
    fireEvent.click(trigger());

    expect(screen.getByRole('menuitemradio', { name: 'Sistema' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitemradio', { name: 'Escuro' }).getAttribute('aria-checked')).toBe('false');

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Escuro' }));
    expect(onChangeTheme).toHaveBeenCalledWith('dark');
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('Sair pede confirmação; Cancelar não desloga', () => {
    renderMenu();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sair da conta' }));

    expect(screen.getByText('Sair da conta neste aparelho?')).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar' }));
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('menuitem', { name: 'Sair da conta' })).toBeTruthy();
  });

  it('Sair + confirmar desloga', async () => {
    renderMenu();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sair da conta' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sair' }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it('copiar registro de sincronização envia o texto para a área de transferência', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    localStorage.setItem(
      'pt-control:sync-log',
      JSON.stringify([{ at: '2026-11-16T14:00:00.000Z', event: 'gravacao_falhou', detail: 'timeout' }]),
    );
    renderMenu();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitem', { name: /Copiar registro de sincronização/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('gravacao_falhou  timeout');
    await screen.findByText('Registro copiado.');
  });
});

describe('UserMenu — estado de sincronização', () => {
  it('estado normal não aparece no botão, só dentro do menu aberto', () => {
    renderMenu({ syncStatus: 'saved', lastSavedAt: '2026-11-16T14:32:00' });
    expect(screen.queryByText(/Tudo salvo/)).toBeNull();
    expect(trigger().getAttribute('aria-label')).toBe('Menu da conta de Alessandra Alves');

    fireEvent.click(trigger());
    expect(screen.getByText('Tudo salvo · 14:32')).toBeTruthy();
  });

  it('com problema, o botão informa o estado ao leitor de tela', () => {
    renderMenu({ syncStatus: 'offline' });
    expect(trigger().getAttribute('aria-label')).toContain('Sem conexão com o servidor');
  });

  it('sem conexão: explica que as alterações ficam no aparelho', () => {
    renderMenu({ syncStatus: 'offline' });
    fireEvent.click(trigger());
    expect(screen.getByText(/ficam guardadas neste aparelho/)).toBeTruthy();
  });

  it('erro ao salvar: orienta a tentar de novo', () => {
    renderMenu({ syncStatus: 'error' });
    fireEvent.click(trigger());
    expect(screen.getByText(/não chegou ao servidor/)).toBeTruthy();
  });
});
