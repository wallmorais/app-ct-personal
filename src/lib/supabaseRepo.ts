import { supabase } from './supabase';
import type { AppData, Profile } from '../types';
import { buildSeedData } from './seed';

export interface RemoteCollectionCounts {
  alunos: number;
  slots: number;
  schedules: number;
  registros: number;
  pagamentos: number;
  ferias: number;
  matriculas: number;
  ausencias: number;
  hasConfig: boolean;
}

export function isRemoteEmpty(counts: RemoteCollectionCounts): boolean {
  return (
    counts.alunos === 0 &&
    counts.slots === 0 &&
    counts.schedules === 0 &&
    counts.registros === 0 &&
    counts.pagamentos === 0 &&
    counts.ferias === 0 &&
    counts.matriculas === 0 &&
    counts.ausencias === 0 &&
    !counts.hasConfig
  );
}

/** Tamanho de cada página pedida ao Supabase (igual ao teto padrão do PostgREST). */
export const PAGE_SIZE = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: unknown;
  count: number | null;
}

/**
 * Lê TODAS as linhas de uma consulta, página a página.
 *
 * O PostgREST devolve no máximo `max_rows` linhas por requisição (1000 por
 * padrão) e trunca o resto em silêncio. Como `persist_app_data` apaga e
 * reinsere tudo, um carregamento truncado seria gravado de volta e apagaria o
 * excedente de forma definitiva — por isso a leitura nunca pode ser parcial.
 *
 * O critério de parada é o total exato informado pelo servidor (`count`), e não
 * o tamanho da página: assim funciona mesmo que o teto do servidor seja menor
 * que `pageSize`. Se, ao final, vierem menos linhas que o total, lança erro em
 * vez de devolver dados incompletos.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;

  for (;;) {
    const { data, error, count } = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (count != null) total = count;

    if (page.length === 0) break;
    if (total != null ? rows.length >= total : page.length < pageSize) break;
  }

  if (total != null && rows.length < total) {
    throw new Error(`Leitura incompleta do Supabase: ${rows.length} de ${total} linhas.`);
  }
  return rows;
}

/** Todas as linhas do usuário em uma tabela, em ordem estável (por id) para paginar. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fetchAllRows(table: string, userId: string): Promise<any[]> {
  return fetchAllPages((from, to) =>
    supabase
      .from(table)
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(from, to),
  );
}

/** Retorna null se o Supabase estiver vazio para este usuário (primeiro acesso). */
export async function fetchAppData(userId: string): Promise<AppData | null> {
  const [alunosRows, slotsRows, schedulesRows, registrosRows, pagamentosRows, feriasRows, matriculasRows, ausenciasRows, configRes] =
    await Promise.all([
      fetchAllRows('alunos', userId),
      fetchAllRows('aula_slots', userId),
      fetchAllRows('student_schedules', userId),
      fetchAllRows('registros', userId),
      fetchAllRows('pagamentos', userId),
      fetchAllRows('ferias_professor', userId),
      fetchAllRows('matriculas', userId),
      fetchAllRows('ausencias_professor', userId),
      supabase.from('config').select('*').eq('user_id', userId).maybeSingle(),
    ]);

  if (configRes.error) throw configRes.error;

  const isEmpty = isRemoteEmpty({
    alunos: alunosRows.length,
    slots: slotsRows.length,
    schedules: schedulesRows.length,
    registros: registrosRows.length,
    pagamentos: pagamentosRows.length,
    ferias: feriasRows.length,
    matriculas: matriculasRows.length,
    ausencias: ausenciasRows.length,
    hasConfig: !!configRes.data,
  });

  if (isEmpty) {
    console.info('[PT.Control] 📭 Supabase vazio para este usuário.');
    return null;
  }

  console.info('[PT.Control] 📥 Dados carregados do Supabase:', {
    alunos: alunosRows.length,
    registros: registrosRows.length,
    slots: slotsRows.length,
  });

  const cfg = configRes.data;

  return {
    alunos: alunosRows.map((a) => ({
      id: a.id,
      nome: a.nome,
      telefone: a.telefone,
      plano: a.plano,
      valorAula: Number(a.valor_aula),
      observacoes: a.observacoes,
      aniversario: a.aniversario ?? undefined,
      objetivo: a.objetivo ?? undefined,
      restricoes: a.restricoes ?? undefined,
      dataAdesao: a.data_adesao ?? undefined,
      dataEncerramento: a.data_encerramento ?? undefined,
      diaCobranca: a.dia_cobranca ?? undefined,
    })),
    slots: slotsRows.map((s) => ({
      id: s.id,
      horario: s.horario,
      horarioFim: s.horario_fim ?? undefined,
    })),
    schedules: schedulesRows.map((s) => ({
      id: s.id,
      alunoId: s.aluno_id,
      slotId: s.slot_id,
      dias: s.dias ?? [],
    })),
    registros: registrosRows.map((r) => ({
      id: r.id,
      alunoId: r.aluno_id,
      slotId: r.slot_id,
      data: r.data,
      horario: r.horario,
      status: r.status,
      reposicaoData: r.reposicao_data ?? undefined,
      reposicaoHorario: r.reposicao_horario ?? undefined,
      reposicaoStatus: r.reposicao_status ?? undefined,
      faltaObservacao: r.falta_observacao ?? undefined,
      reposicaoExcecao: r.reposicao_excecao ?? undefined,
      dataOriginalAntecipacao: r.data_original_antecipacao ?? undefined,
      faltaTipo: r.falta_tipo ?? undefined,
      faltaProfessor: r.falta_professor ?? undefined,
    })),
    pagamentos: pagamentosRows.map((p) => ({
      alunoId: p.aluno_id,
      mes: p.mes,
      status: p.status,
      dataPagamento: p.data_pagamento ?? undefined,
      valor: Number(p.valor),
    })),
    feriasProfessor: feriasRows.map((f) => ({
      id: f.id,
      dataInicio: f.data_inicio,
      dataFim: f.data_fim,
      observacao: f.observacao ?? undefined,
      createdAt: f.created_at,
    })),
    matriculas: matriculasRows.map((m) => ({
      id: m.id,
      alunoId: m.aluno_id,
      dataInicio: m.data_inicio,
      dataFim: m.data_fim ?? undefined,
      tipo: m.tipo,
      observacao: m.observacao ?? undefined,
      createdAt: m.created_at,
    })),
    ausenciasProfessor: ausenciasRows.map((a) => ({
      id: a.id,
      data: a.data,
      motivo: a.motivo,
      observacao: a.observacao ?? undefined,
      createdAt: a.created_at,
    })),
    config: {
      notificationTime: cfg?.notification_time ?? '21:00',
      nomeProfissional: cfg?.nome_profissional ?? '',
      registroProfissional: cfg?.registro_profissional ?? 'Personal Trainer',
    },
  };
}

/** Persist atômico via RPC — tudo numa única transaction no Postgres. */
export async function persistAppData(_userId: string, data: AppData): Promise<void> {
  console.info('[PT.Control] ⏳ Persistindo no Supabase…', {
    alunos: data.alunos.length,
    registros: data.registros.length,
    slots: data.slots.length,
  });
  const { error } = await supabase.rpc('persist_app_data', {
    payload: data,
  });
  if (error) {
    console.error('[PT.Control] ❌ RPC persist_app_data falhou:', error.message, error);
    throw error;
  }
  console.info('[PT.Control] ✅ Dados persistidos no Supabase.');
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    nome: data.nome ?? '',
    telefone: data.telefone ?? '',
    cidade: data.cidade ?? '',
  };
}

export async function updateProfile(profile: Profile): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      nome: profile.nome,
      telefone: profile.telefone,
      cidade: profile.cidade,
    })
    .eq('id', profile.id);
  if (error) throw error;
}
