import type {
  Aluno,
  AppData,
  AulaSlot,
  MotivoAusencia,
  Pagamento,
  ProfessorAbsence,
  ProfessorVacation,
  Registro,
  StudentEnrollment,
  StudentSchedule,
  StudentStatus,
  TipoMovimentacao,
} from '../types';
import { addDays, dowOf } from './date';

export function isProfessorOnVacation(data: AppData, date: string): boolean {
  if (!data.feriasProfessor) return false;
  return data.feriasProfessor.some((v) => date >= v.dataInicio && date <= v.dataFim);
}

/** Ausência pontual (dia inteiro) — distinta de férias. Uma ausência por data. */
export function isProfessorAbsent(data: AppData, date: string): boolean {
  if (!data.ausenciasProfessor) return false;
  return data.ausenciasProfessor.some((a) => a.data === date);
}

export function getAbsencesInRange(data: AppData, start: string, end: string): ProfessorAbsence[] {
  if (!data.ausenciasProfessor) return [];
  return data.ausenciasProfessor.filter((a) => a.data >= start && a.data <= end);
}

export function getStudentStatusOnDate(data: AppData, alunoId: string, date: string): StudentStatus | null {
  if (!data.matriculas) return null;
  const enrollments = data.matriculas
    .filter((m) => m.alunoId === alunoId && m.dataInicio <= date)
    .sort((a, b) => b.dataInicio.localeCompare(a.dataInicio) || b.createdAt.localeCompare(a.createdAt));

  for (const e of enrollments) {
    if (!e.dataFim || e.dataFim >= date) return e.tipo;
  }

  return null;
}

export function isStudentActiveOnDate(data: AppData, alunoId: string, date: string): boolean {
  const status = getStudentStatusOnDate(data, alunoId, date);
  if (status !== null) return status === 'ATIVO';

  // Nenhuma matrícula cobre a data. Só tratamos isso como "gap real" entre etapas
  // (→ inativo) quando o aluno tem HISTÓRICO REAL de etapas: uma ATIVO já encerrada,
  // ou mais de uma matrícula ATIVO/INATIVO relevante. Um aluno legado com apenas UMA
  // matrícula ATIVO em aberto (nunca passou por um ciclo ativo→inativo) não conta como
  // histórico — preserva o comportamento antigo (fallback escalar) para não fazê-lo
  // sumir retroativamente da agenda (caso real observado: aluno com dataAdesao nula e
  // uma única matrícula ATIVO aberta, criada pelo fluxo legado).
  const etapasRelevantes = (data.matriculas ?? []).filter(
    (m) => m.alunoId === alunoId && (m.tipo === 'ATIVO' || m.tipo === 'INATIVO'),
  );
  const temHistoricoReal =
    etapasRelevantes.some((m) => m.tipo === 'ATIVO' && m.dataFim) || etapasRelevantes.length > 1;
  if (temHistoricoReal) return false;

  // Sem histórico real: fallback aos campos escalares do aluno (dado legado).
  const aluno = data.alunos.find((a) => a.id === alunoId);
  if (aluno?.dataAdesao) return date >= aluno.dataAdesao;
  return true;
}

export function isStudentOnVacation(data: AppData, alunoId: string, date: string): boolean {
  return getStudentStatusOnDate(data, alunoId, date) === 'FERIAS';
}

export interface VacationLike {
  id: string;
  dataInicio: string;
  dataFim: string;
}

/** Genérica: usada tanto para férias do professor quanto do aluno — mesma regra de interseção de datas. */
export function vacationsOverlap<T extends VacationLike>(existing: T[], newStart: string, newEnd: string, excludeId?: string): boolean {
  return existing.some((v) => {
    if (v.id === excludeId) return false;
    return newStart <= v.dataFim && newEnd >= v.dataInicio;
  });
}

/** Retorna o primeiro período conflitante (se houver), para permitir o fluxo de "substituir". */
export function findOverlappingVacation<T extends VacationLike>(existing: T[], newStart: string, newEnd: string, excludeId?: string): T | undefined {
  return existing.find((v) => {
    if (v.id === excludeId) return false;
    return newStart <= v.dataFim && newEnd >= v.dataInicio;
  });
}

export function getVacationsInRange(data: AppData, start: string, end: string): ProfessorVacation[] {
  return data.feriasProfessor.filter((v) => v.dataInicio <= end && v.dataFim >= start);
}

export function getEnrollmentsForStudent(data: AppData, alunoId: string): StudentEnrollment[] {
  if (!data.matriculas) return [];
  return data.matriculas
    .filter((m) => m.alunoId === alunoId)
    .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
}

export function getVacationsAll(data: AppData): ProfessorVacation[] {
  if (!data.feriasProfessor) return [];
  return [...data.feriasProfessor].sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
}

/**
 * Deriva o tipo de movimentação comparando a data de destino com a data original.
 * Nunca é persistido — sempre recalculado a partir de `data` e `reposicaoData`.
 * Retorna null se o registro não tem movimentação (reposicaoData não definida).
 */
export function tipoMovimentacao(registro: Registro): TipoMovimentacao | null {
  if (!registro.reposicaoData) return null;
  return registro.reposicaoData < registro.data ? 'antecipacao' : 'reposicao';
}

/**
 * Verifica se já existe, para OUTRO aluno, uma reposição/antecipação avulsa landing
 * na mesma data+horário. Deliberadamente NÃO verifica a grade regular (StudentSchedule),
 * pois o app suporta aulas em grupo (vários alunos no mesmo horário por design) — um
 * conflito só faz sentido entre movimentações avulsas, não contra a grade recorrente.
 */
export function findHorarioConflict(
  data: AppData,
  novaData: string,
  novoHorario: string,
  excludeAlunoId: string,
  excludeRegistroId?: string,
): Registro | undefined {
  return data.registros.find((r) => {
    if (r.id === excludeRegistroId) return false;
    if (r.alunoId === excludeAlunoId) return false;
    if (r.reposicaoStatus === 'cancelada') return false;
    return r.reposicaoData === novaData && r.reposicaoHorario === novoHorario;
  });
}

/* ============================================================
 * AUSÊNCIA DO PROFESSOR
 * ============================================================
 * Ausência de dia inteiro: uma única ProfessorAbsence, identificada por data,
 * afeta automaticamente todas as aulas daquele dia (todos os alunos, mesmo
 * slot compartilhado). Não há relação explícita ausência↔registro — a ligação
 * é implícita por `registro.data === ausencia.data && registro.faltaProfessor`.
 * Isso mantém a solução simples (sem nova entidade de "ocorrência" ou FK).
 * ============================================================ */

/** Preview do impacto de registrar uma ausência em `dataISO`, antes de aplicar. */
export interface AbsenceImpactPreview {
  /** Aulas que serão marcadas como Falta do Professor (estavam pendentes ou não existiam). */
  afetadas: number;
  /** Aulas que já tinham um status definido pelo professor — não serão alteradas. */
  jaRegistradas: number;
}

export function previewProfessorAbsence(data: AppData, dataISO: string): AbsenceImpactPreview {
  const dow = dowOf(dataISO);
  let afetadas = 0;
  let jaRegistradas = 0;

  for (const schedule of data.schedules) {
    if (!schedule.dias.includes(dow)) continue;
    if (!isStudentActiveOnDate(data, schedule.alunoId, dataISO)) continue;
    const slot = data.slots.find((s) => s.id === schedule.slotId);
    if (!slot) continue;

    const existing = data.registros.find(
      (r) => r.alunoId === schedule.alunoId && r.slotId === schedule.slotId && r.data === dataISO,
    );
    if (!existing || existing.status === 'pendente') afetadas++;
    else jaRegistradas++;
  }

  return { afetadas, jaRegistradas };
}

/**
 * Registra uma ausência do professor em `dataISO` e cria/atualiza os registros
 * das aulas afetadas. Nunca sobrescreve um registro com status já definido
 * pelo professor (presente/falta/reposicao) — apenas cria os inexistentes e
 * atualiza os que estavam 'pendente'.
 */
export function applyProfessorAbsence(
  data: AppData,
  dataISO: string,
  motivo: MotivoAusencia,
  observacao?: string,
): AppData {
  const dow = dowOf(dataISO);
  const registros = [...data.registros];

  for (const schedule of data.schedules) {
    if (!schedule.dias.includes(dow)) continue;
    if (!isStudentActiveOnDate(data, schedule.alunoId, dataISO)) continue;
    const slot = data.slots.find((s) => s.id === schedule.slotId);
    if (!slot) continue;

    const idx = registros.findIndex(
      (r) => r.alunoId === schedule.alunoId && r.slotId === schedule.slotId && r.data === dataISO,
    );

    if (idx === -1) {
      registros.push({
        id: crypto.randomUUID(),
        alunoId: schedule.alunoId,
        slotId: schedule.slotId,
        data: dataISO,
        horario: slot.horario,
        status: 'falta',
        faltaProfessor: true,
      });
    } else if (registros[idx].status === 'pendente') {
      registros[idx] = { ...registros[idx], status: 'falta', faltaProfessor: true };
    }
    // status já definido pelo professor (presente/falta/reposicao): não altera.
  }

  const novaAusencia: ProfessorAbsence = {
    id: crypto.randomUUID(),
    data: dataISO,
    motivo,
    observacao: observacao?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  return {
    ...data,
    registros,
    ausenciasProfessor: [...data.ausenciasProfessor, novaAusencia],
  };
}

export interface AbsenceCancelPreview {
  cancelable: boolean;
  revertCount: number;
  blockedReason?: string;
}

/**
 * Verifica se uma ausência pode ser cancelada: só é revertível se TODAS as
 * aulas que ela afetou continuarem exatamente no estado inicial (status='falta',
 * faltaProfessor=true, sem nenhuma reposição). Qualquer alteração posterior do
 * professor (reposição agendada/concluída/cancelada, ou reclassificação como
 * presença/falta do aluno) já limpa `faltaProfessor` ou seta `reposicaoData`
 * (ver updateRegistro em App.tsx) — o que torna o registro correspondente
 * detectável aqui sem precisar de um vínculo explícito ausência↔registro.
 */
export function previewAbsenceCancel(data: AppData, absence: ProfessorAbsence): AbsenceCancelPreview {
  const afetados = data.registros.filter((r) => r.faltaProfessor && r.data === absence.data);

  const alterado = afetados.some((r) => r.status !== 'falta' || !!r.reposicaoData || !!r.reposicaoStatus);
  if (alterado) {
    return {
      cancelable: false,
      revertCount: 0,
      blockedReason:
        'Esta ausência não pode ser cancelada porque uma ou mais aulas já foram alteradas ou possuem reposição agendada.',
    };
  }

  return { cancelable: true, revertCount: afetados.length };
}

/**
 * Cancela a ausência de forma atômica: OU remove a ausência e reverte todas as
 * aulas revertíveis para 'pendente', OU não faz nada (se previewAbsenceCancel
 * indicar bloqueio). O chamador deve checar `previewAbsenceCancel` antes de
 * chamar esta função e não permitir a ação na UI quando `cancelable=false`.
 */
export function cancelProfessorAbsence(data: AppData, absenceId: string): AppData {
  const absence = data.ausenciasProfessor.find((a) => a.id === absenceId);
  if (!absence) return data;

  const preview = previewAbsenceCancel(data, absence);
  if (!preview.cancelable) return data;

  const registros = data.registros.map((r) => {
    if (r.faltaProfessor && r.data === absence.data && r.status === 'falta' && !r.reposicaoData) {
      const { faltaProfessor: _drop, ...rest } = r;
      return { ...rest, status: 'pendente' as const };
    }
    return r;
  });

  return {
    ...data,
    registros,
    ausenciasProfessor: data.ausenciasProfessor.filter((a) => a.id !== absenceId),
  };
}

/* ============================================================
 * ETAPAS DO ALUNO (matrículas ATIVO como histórico)
 * ============================================================
 * Cada período em que o aluno esteve ativo é uma matrícula ATIVO independente
 * (uma "etapa"). A etapa corrente é a de maior dataInicio; em aberto (sem
 * dataFim) = aluno ativo hoje, fechada = aluno inativo hoje. Reativar cria uma
 * NOVA etapa ATIVO — nunca reabre nem altera a anterior.
 *
 * As matrículas INATIVO são marcadores derivados dos gaps entre etapas ATIVO
 * consecutivas (e após a última, se fechada). Como getStudentStatusOnDate usa
 * intervalos INCLUSIVOS nas duas pontas, o INATIVO começa no dia SEGUINTE ao
 * encerramento e termina no dia ANTERIOR à próxima adesão — nunca no mesmo dia,
 * senão haveria sobreposição.
 *
 * Os campos escalares aluno.dataAdesao/dataEncerramento espelham sempre a
 * etapa corrente (é o que ReposicaoModal e a agenda esperam deles).
 * ============================================================ */

/** Etapas ATIVO do aluno em ordem cronológica (dataInicio asc). */
export function getEtapasAtivas(data: AppData, alunoId: string): StudentEnrollment[] {
  return (data.matriculas ?? [])
    .filter((m) => m.alunoId === alunoId && m.tipo === 'ATIVO')
    .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio) || a.createdAt.localeCompare(b.createdAt));
}

/** Etapa corrente = a ATIVO de maior dataInicio (aberta ou fechada). */
export function getEtapaCorrente(data: AppData, alunoId: string): StudentEnrollment | undefined {
  const etapas = getEtapasAtivas(data, alunoId);
  return etapas[etapas.length - 1];
}

/**
 * Aulas do aluno dentro de um intervalo (inclusivo). Considera tanto a data original
 * quanto a data de reposição/antecipação, pois qualquer uma delas "pertence" ao período.
 * `fim` ausente = intervalo aberto. Usado para bloquear a exclusão de uma etapa que já
 * tem histórico real por trás (relatórios daquele período não podem mudar retroativamente).
 */
export function aulasDoAlunoNoPeriodo(registros: Registro[], alunoId: string, inicio: string, fim?: string): Registro[] {
  const dentro = (d?: string) => !!d && d >= inicio && (!fim || d <= fim);
  return registros.filter((r) => r.alunoId === alunoId && (dentro(r.data) || dentro(r.reposicaoData)));
}

export interface EtapaInput {
  /** id da matrícula existente (preserva identidade/createdAt); ausente = nova. */
  id?: string;
  dataInicio: string;
  dataFim?: string;
}

export interface RebuildEtapasInput {
  alunoId: string;
  /** Etapas fechadas anteriores à corrente, já com eventuais correções do formulário. */
  anteriores: EtapaInput[];
  /** Etapa corrente (maior dataInicio). Sem dataFim = aluno ativo. */
  corrente: EtapaInput;
  /**
   * Reativação explícita: cria uma nova etapa ATIVO em aberto a partir desta data.
   * Exige `corrente` fechada e dataInicio posterior ao seu dataFim.
   */
  reativacao?: { dataInicio: string };
  ferias: { id: string; dataInicio: string; dataFim: string }[];
}

export interface RebuildEtapasResult {
  matriculas: StudentEnrollment[];
  /** Escalares da etapa corrente resultante, para espelhar em aluno.dataAdesao/dataEncerramento. */
  dataAdesao: string;
  dataEncerramento?: string;
}

/** Lista ordenada de etapas ATIVO resultante (anteriores + corrente + nova, se reativando). */
function montarEtapas(input: Pick<RebuildEtapasInput, 'anteriores' | 'corrente' | 'reativacao'>): EtapaInput[] {
  const etapas: EtapaInput[] = [...input.anteriores, input.corrente];
  if (input.reativacao) etapas.push({ dataInicio: input.reativacao.dataInicio });
  return etapas.sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
}

/**
 * Valida o conjunto de etapas. Retorna a mensagem de erro (para exibir no
 * formulário) ou null se válido. Mesma regra usada por rebuildMatriculasDoAluno.
 */
export function validarEtapas(
  input: Pick<RebuildEtapasInput, 'anteriores' | 'corrente' | 'reativacao'>,
): string | null {
  if (input.reativacao) {
    if (!input.corrente.dataFim) return 'Para reativar, a etapa atual precisa estar encerrada.';
    if (!input.reativacao.dataInicio) return 'Informe a data de início da nova etapa.';
    if (input.reativacao.dataInicio <= input.corrente.dataFim) {
      return 'A nova etapa deve começar depois do encerramento da etapa anterior.';
    }
  }
  const etapas = montarEtapas(input);
  for (let i = 0; i < etapas.length; i++) {
    const atual = etapas[i];
    if (!atual.dataInicio) return 'Toda etapa precisa de uma data de adesão.';
    if (atual.dataFim && atual.dataFim < atual.dataInicio) {
      return 'Uma etapa tem encerramento anterior à adesão.';
    }
    const proxima = etapas[i + 1];
    if (proxima) {
      if (!atual.dataFim) return 'Apenas a etapa atual pode estar em aberto — encerre as anteriores.';
      if (proxima.dataInicio <= atual.dataFim) return 'As etapas do aluno não podem se sobrepor.';
    }
  }
  return null;
}

/**
 * Reconstrói as matrículas de UM aluno a partir das etapas informadas, preservando
 * as dos demais alunos. Etapas ATIVO mantêm id/createdAt quando já existiam;
 * INATIVO são derivados dos gaps; FERIAS vêm da lista do formulário (ids próprios).
 * Lança erro se validarEtapas reprovar — o formulário deve validar antes.
 */
export function rebuildMatriculasDoAluno(
  prevMatriculas: StudentEnrollment[],
  input: RebuildEtapasInput,
  now: string = new Date().toISOString(),
): RebuildEtapasResult {
  const erro = validarEtapas(input);
  if (erro) throw new Error(erro);

  const { alunoId } = input;
  const prevDoAluno = prevMatriculas.filter((m) => m.alunoId === alunoId);
  const outras = prevMatriculas.filter((m) => m.alunoId !== alunoId);
  const prevById = new Map(prevDoAluno.map((m) => [m.id, m]));

  // 1. Etapas ATIVO, preservando id/createdAt das já existentes.
  const ativos: StudentEnrollment[] = montarEtapas(input).map((e) => {
    const prev = e.id ? prevById.get(e.id) : undefined;
    return {
      id: prev?.id ?? crypto.randomUUID(),
      alunoId,
      dataInicio: e.dataInicio,
      dataFim: e.dataFim || undefined,
      tipo: 'ATIVO',
      createdAt: prev?.createdAt ?? now,
    };
  });

  // 2. Deriva INATIVO nos gaps (fronteiras exclusivas: fim+1 .. próximoInício-1).
  const prevInativoByInicio = new Map(
    prevDoAluno.filter((m) => m.tipo === 'INATIVO').map((m) => [m.dataInicio, m]),
  );
  const inativos: StudentEnrollment[] = [];
  for (let i = 0; i < ativos.length; i++) {
    const atual = ativos[i];
    if (!atual.dataFim) continue;
    const inicio = addDays(atual.dataFim, 1);
    const proxima = ativos[i + 1];
    const fim = proxima ? addDays(proxima.dataInicio, -1) : undefined;
    if (fim && fim < inicio) continue; // etapas adjacentes: sem gap
    const prev = prevInativoByInicio.get(inicio);
    inativos.push({
      id: prev?.id ?? crypto.randomUUID(),
      alunoId,
      dataInicio: inicio,
      dataFim: fim,
      tipo: 'INATIVO',
      createdAt: prev?.createdAt ?? now,
    });
  }

  // 3. FERIAS vêm do formulário (ids estáveis).
  const ferias: StudentEnrollment[] = input.ferias.map((v) => ({
    id: v.id,
    alunoId,
    dataInicio: v.dataInicio,
    dataFim: v.dataFim,
    tipo: 'FERIAS',
    createdAt: prevById.get(v.id)?.createdAt ?? now,
  }));

  const corrente = ativos[ativos.length - 1];
  return {
    matriculas: [...outras, ...ativos, ...inativos, ...ferias],
    dataAdesao: corrente.dataInicio,
    dataEncerramento: corrente.dataFim,
  };
}

export interface RemoveAlunoResult {
  alunos: Aluno[];
  slots: AulaSlot[];
  schedules: StudentSchedule[];
  registros: Registro[];
  matriculas: StudentEnrollment[];
  pagamentos: Pagamento[];
}

/**
 * Remove todos os dados de UM aluno — schedules, registros, matrículas e
 * pagamentos — preservando integralmente os de qualquer outro aluno.
 *
 * pagamentos precisa ser limpo aqui mesmo com FK ON DELETE CASCADE no banco
 * (migrations/001_initial_schema.sql): persist_app_data não faz DELETE pontual
 * por aluno, ele apaga tudo do usuário e reinsere a partir do array local a
 * cada save. Um pagamento remanescente com aluno_id de um aluno já removido
 * do array `alunos` faria o INSERT INTO pagamentos falhar por violação de FK
 * no próximo sync — mesma classe de bug já corrigida para `slots` (commit
 * c52359e), aqui prevenida na origem (estado local) em vez de no banco.
 *
 * Um slot só é removido se nenhum agendamento OU registro histórico
 * remanescente (de outro aluno) ainda o referencia — removê-lo
 * incondicionalmente quebraria a FK registros.slot_id.
 */
export function removeAlunoData(
  data: Pick<AppData, 'alunos' | 'slots' | 'schedules' | 'registros' | 'matriculas' | 'pagamentos'>,
  alunoId: string,
): RemoveAlunoResult {
  const schedules = data.schedules.filter((s) => s.alunoId !== alunoId);
  const registros = data.registros.filter((r) => r.alunoId !== alunoId);
  const usedSlotIds = new Set([
    ...schedules.map((s) => s.slotId),
    ...registros.map((r) => r.slotId),
  ]);
  return {
    alunos: data.alunos.filter((a) => a.id !== alunoId),
    slots: data.slots.filter((s) => usedSlotIds.has(s.id)),
    schedules,
    registros,
    matriculas: (data.matriculas ?? []).filter((m) => m.alunoId !== alunoId),
    pagamentos: (data.pagamentos ?? []).filter((p) => p.alunoId !== alunoId),
  };
}
