import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Plus, ChevronRight, Phone, Users, Search, MessageCircle, Cake, Target, AlertCircle, CalendarClock } from 'lucide-react';
import type { Aluno, AppData, StudentEnrollment, StudentStatus } from '../types';
import { getEnrollmentsForStudent, getStudentStatusOnDate } from '../lib/periods';
import { statsDoAluno, formatBRL, registrosNoPeriodo } from '../lib/billing';
import { addDays, todayISO, formatDateShort, formatDateLabel } from '../lib/date';
import AlunoFormModal, { type AgendaDia } from './AlunoFormModal';

interface Props {
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
}

function formatWhatsAppUrl(telefone: string): string {
  const digits = telefone.replace(/\D/g, '');
  const num = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${num}`;
}

const STATUS_LABEL: Record<StudentStatus, string> = { ATIVO: 'Ativo', FERIAS: 'Férias', INATIVO: 'Inativo' };
const STATUS_CLASS: Record<StudentStatus, string> = {
  ATIVO: 'text-emerald bg-emerald/10 border-emerald/40',
  FERIAS: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30',
  INATIVO: 'text-base-muted bg-base-surface border-base-border',
};

export default function AlunosView({ data, setData }: Props) {
  const [editing, setEditing] = useState<Aluno | null | 'new'>(null);
  const [busca, setBusca] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusAction, setStatusAction] = useState<{ alunoId: string; tipo: StudentStatus } | null>(null);

  const alunoStats = useMemo(
    () => new Map(data.alunos.map((a) => [a.id, statsDoAluno(a, data.registros)])),
    [data.alunos, data.registros],
  );

  const last30Stats = useMemo(() => {
    if (!expandedId) return null;
    const today = todayISO();
    const start = addDays(today, -30);
    const range = { start, end: today };
    const aluno = data.alunos.find((a) => a.id === expandedId);
    if (!aluno) return null;
    const regs = registrosNoPeriodo(
      data.registros.filter((r) => r.alunoId === expandedId),
      range,
    );
    const presencas = regs.filter((r) => r.status === 'presente').length;
    const faltas = regs.filter((r) => r.status === 'falta').length;
    const reposicoes = regs.filter((r) => r.status === 'reposicao').length;
    const ultimaFalta = regs
      .filter((r) => r.status === 'falta')
      .sort((a, b) => b.data.localeCompare(a.data))[0];
    return { presencas, faltas, reposicoes, ultimaFalta: ultimaFalta?.data };
  }, [expandedId, data.alunos, data.registros]);

  const alunosFiltrados = useMemo(() => {
    if (!busca.trim()) return data.alunos;
    const termo = busca.trim().toLowerCase();
    return data.alunos.filter((a) =>
      a.nome.toLowerCase().includes(termo) ||
      a.telefone.includes(termo),
    );
  }, [data.alunos, busca]);

  function handleSave(aluno: Aluno, agenda: AgendaDia[]) {
    setData((prev) => {
      const exists = prev.alunos.some((a) => a.id === aluno.id);
      const alunos = exists
        ? prev.alunos.map((a) => (a.id === aluno.id ? aluno : a))
        : [...prev.alunos, aluno];

      let slots = prev.slots
        .map((s) => ({ ...s, alunoIds: s.alunoIds.filter((id) => id !== aluno.id) }))
        .filter((s) => s.alunoIds.length > 0);

      for (const item of agenda) {
        const existingIdx = slots.findIndex(
          (s) => s.horario === item.inicio && s.dias.includes(item.dia),
        );
        if (existingIdx !== -1) {
          slots = slots.map((s, i) =>
            i === existingIdx && !s.alunoIds.includes(aluno.id)
              ? { ...s, horarioFim: item.fim, alunoIds: [...s.alunoIds, aluno.id] }
              : s,
          );
        } else {
          slots = [
            ...slots,
            {
              id: crypto.randomUUID(),
              horario: item.inicio,
              horarioFim: item.fim,
              dias: [item.dia],
              alunoIds: [aluno.id],
            },
          ];
        }
      }

      // Se é novo aluno ou dataAdesao mudou, garante matrícula ATIVO
      let matriculas = prev.matriculas;
      const hasEnrollment = matriculas.some((m) => m.alunoId === aluno.id);
      if (!hasEnrollment) {
        const startDate = aluno.dataAdesao || todayISO();
        matriculas = [...matriculas, {
          id: crypto.randomUUID(),
          alunoId: aluno.id,
          dataInicio: startDate,
          tipo: 'ATIVO' as const,
          createdAt: new Date().toISOString(),
        }];
      }

      return { ...prev, alunos, slots, matriculas };
    });
    setEditing(null);
  }

  function handleDelete(id: string) {
    setData((prev) => ({
      ...prev,
      alunos: prev.alunos.filter((a) => a.id !== id),
      slots: prev.slots.map((s) => ({ ...s, alunoIds: s.alunoIds.filter((aid) => aid !== id) })),
      registros: prev.registros.filter((r) => r.alunoId !== id),
    }));
    setEditing(null);
  }

  function changeStudentStatus(alunoId: string, novoTipo: StudentStatus) {
    const today = todayISO();
    setData((prev) => {
      const openEnrollments = prev.matriculas
        .filter((m) => m.alunoId === alunoId && !m.dataFim)
        .map((m) => ({ ...m, dataFim: today }));
      const closed = prev.matriculas.map((m) =>
        openEnrollments.find((o) => o.id === m.id) ?? m,
      );
      const newEnrollment: StudentEnrollment = {
        id: crypto.randomUUID(),
        alunoId,
        dataInicio: today,
        tipo: novoTipo,
        createdAt: new Date().toISOString(),
      };
      return { ...prev, matriculas: [...closed, newEnrollment] };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Alunos</h2>
          <p className="text-sm text-base-muted">{data.alunos.length} {data.alunos.length === 1 ? 'aluno' : 'alunos'}</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 bg-emerald text-black text-sm font-semibold px-3.5 py-2 rounded-xl active:bg-emerald/80"
        >
          <Plus size={16} strokeWidth={2.5} />
          Aluno
        </button>
      </div>

      {/* Campo de busca */}
      {data.alunos.length > 0 && (
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-muted pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aluno por nome ou telefone..."
            className="pl-10"
            aria-label="Buscar aluno"
          />
        </div>
      )}

      {data.alunos.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <div className="w-16 h-16 rounded-full bg-base-surface border border-base-border flex items-center justify-center mx-auto">
            <Users size={28} className="text-base-muted opacity-50" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base-muted text-sm font-medium">Nenhum aluno cadastrado</p>
            <p className="text-xs text-base-muted/70 mt-1">Toque em &ldquo;+ Aluno&rdquo; para começar.</p>
          </div>
        </div>
      )}

      {data.alunos.length > 0 && alunosFiltrados.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <Search size={28} className="mx-auto text-base-muted opacity-30" aria-hidden="true" />
          <p className="text-base-muted text-sm">Nenhum aluno encontrado para &ldquo;{busca}&rdquo;</p>
        </div>
      )}

      <div className="space-y-2">
        {alunosFiltrados.map((aluno) => {
          const stats = alunoStats.get(aluno.id)!;
          const progresso = aluno.plano > 0 ? Math.min(stats.presencas / aluno.plano, 1) : 0;
          const isExpanded = expandedId === aluno.id;
          const hasExtras = aluno.aniversario || aluno.objetivo || aluno.restricoes;

          return (
            <div
              key={aluno.id}
              className="bg-base-card border border-base-border rounded-2xl p-4 transition-colors"
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : aluno.id)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-semibold truncate">{aluno.nome}</p>
                      <span className="text-xs font-semibold text-emerald shrink-0">
                        {stats.presencas} / {aluno.plano} aulas
                      </span>
                    </div>

                    <div className="h-1.5 rounded-full bg-base-surface overflow-hidden mb-1.5">
                      <div
                        className="h-full bg-emerald rounded-full transition-all"
                        style={{ width: `${progresso * 100}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-base-muted">
                      <div className="flex items-center gap-1">
                        {aluno.telefone && (
                          <>
                            <Phone size={12} />
                            <span>{aluno.telefone}</span>
                          </>
                        )}
                      </div>
                      <span>{formatBRL(aluno.valorAula)}/aula</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className={`text-base-muted shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </div>
              </button>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-base-border space-y-3">
                  {hasExtras && (
                    <div className="space-y-1.5">
                      {aluno.aniversario && (
                        <div className="flex items-center gap-2 text-xs text-base-muted">
                          <Cake size={13} className="shrink-0 text-pink-400" />
                          <span>{formatDateShort(aluno.aniversario)}</span>
                        </div>
                      )}
                      {aluno.objetivo && (
                        <div className="flex items-center gap-2 text-xs text-base-muted">
                          <Target size={13} className="shrink-0 text-electric" />
                          <span>{aluno.objetivo}</span>
                        </div>
                      )}
                      {aluno.restricoes && (
                        <div className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400">
                          <AlertCircle size={13} className="shrink-0" />
                          <span>{aluno.restricoes}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {last30Stats && (
                    <div className="bg-base-surface border border-base-border rounded-xl p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-base-muted mb-2">Últimos 30 dias</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-lg font-bold tabular-nums text-emerald">{last30Stats.presencas}</p>
                          <p className="text-[10px] text-base-muted">Presenças</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold tabular-nums text-red-500 dark:text-red-400">{last30Stats.faltas}</p>
                          <p className="text-[10px] text-base-muted">Faltas</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold tabular-nums text-amber-500 dark:text-amber-400">{last30Stats.reposicoes}</p>
                          <p className="text-[10px] text-base-muted">Repos.</p>
                        </div>
                      </div>
                      {last30Stats.ultimaFalta && (
                        <p className="text-[11px] text-base-muted mt-2 text-center">
                          Última falta: {formatDateShort(last30Stats.ultimaFalta)}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setEditing(aluno)}
                      className="py-2 rounded-xl text-xs font-semibold border border-electric/50 text-electric active:bg-electric/10 transition-colors"
                    >
                      Editar
                    </button>
                    {aluno.telefone && (
                      <a
                        href={formatWhatsAppUrl(aluno.telefone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-emerald border border-emerald/40 active:bg-emerald/10 transition-colors"
                      >
                        <MessageCircle size={14} />
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <AlunoFormModal
          aluno={editing === 'new' ? null : editing}
          slots={data.slots}
          onSave={handleSave}
          onDelete={editing !== 'new' ? handleDelete : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
