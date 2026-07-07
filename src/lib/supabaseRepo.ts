import { supabase } from './supabase';
import type { AppData, Profile } from '../types';
import { buildSeedData } from './seed';

/** Retorna null se o Supabase estiver vazio para este usuário (primeiro acesso). */
export async function fetchAppData(userId: string): Promise<AppData | null> {
  const [alunosRes, slotsRes, schedulesRes, registrosRes, pagamentosRes, feriasRes, matriculasRes, configRes] =
    await Promise.all([
      supabase.from('alunos').select('*').eq('user_id', userId),
      supabase.from('aula_slots').select('*').eq('user_id', userId),
      supabase.from('student_schedules').select('*').eq('user_id', userId),
      supabase.from('registros').select('*').eq('user_id', userId),
      supabase.from('pagamentos').select('*').eq('user_id', userId),
      supabase.from('ferias_professor').select('*').eq('user_id', userId),
      supabase.from('matriculas').select('*').eq('user_id', userId),
      supabase.from('config').select('*').eq('user_id', userId).maybeSingle(),
    ]);

  for (const res of [alunosRes, slotsRes, schedulesRes, registrosRes, pagamentosRes, feriasRes, matriculasRes, configRes]) {
    if (res.error) throw res.error;
  }

  const isEmpty =
    (alunosRes.data?.length ?? 0) === 0 &&
    (slotsRes.data?.length ?? 0) === 0 &&
    (registrosRes.data?.length ?? 0) === 0 &&
    !configRes.data;

  if (isEmpty) {
    console.info('[PT.Control] 📭 Supabase vazio para este usuário.');
    return null;
  }

  console.info('[PT.Control] 📥 Dados carregados do Supabase:', {
    alunos: alunosRes.data?.length ?? 0,
    registros: registrosRes.data?.length ?? 0,
    slots: slotsRes.data?.length ?? 0,
  });

  const cfg = configRes.data;

  return {
    alunos: (alunosRes.data ?? []).map((a) => ({
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
    })),
    slots: (slotsRes.data ?? []).map((s) => ({
      id: s.id,
      horario: s.horario,
      horarioFim: s.horario_fim ?? undefined,
    })),
    schedules: (schedulesRes.data ?? []).map((s) => ({
      id: s.id,
      alunoId: s.aluno_id,
      slotId: s.slot_id,
      dias: s.dias ?? [],
    })),
    registros: (registrosRes.data ?? []).map((r) => ({
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
    })),
    pagamentos: (pagamentosRes.data ?? []).map((p) => ({
      alunoId: p.aluno_id,
      mes: p.mes,
      status: p.status,
      dataPagamento: p.data_pagamento ?? undefined,
      valor: Number(p.valor),
    })),
    feriasProfessor: (feriasRes.data ?? []).map((f) => ({
      id: f.id,
      dataInicio: f.data_inicio,
      dataFim: f.data_fim,
      observacao: f.observacao ?? undefined,
      createdAt: f.created_at,
    })),
    matriculas: (matriculasRes.data ?? []).map((m) => ({
      id: m.id,
      alunoId: m.aluno_id,
      dataInicio: m.data_inicio,
      dataFim: m.data_fim ?? undefined,
      tipo: m.tipo,
      observacao: m.observacao ?? undefined,
      createdAt: m.created_at,
    })),
    config: {
      notificationTime: cfg?.notification_time ?? '21:00',
      nomeProfissional: cfg?.nome_profissional ?? 'Wal Morais',
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
