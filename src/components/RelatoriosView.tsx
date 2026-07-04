import { useMemo, useState } from 'react';
import { TrendingUp, CheckCircle2, XCircle, RotateCw, FileDown, Clock, Check } from 'lucide-react';
import type { AppData } from '../types';
import {
  overviewStats,
  historicoDoAluno,
  formatBRL,
  currentMonthRange,
  previousMonthRange,
  type AlunoStats,
  type HistoricoEntry,
  type DateRange,
} from '../lib/billing';
import { formatDateLabel, monthLabel, startOfMonth } from '../lib/date';
import { Logo } from './Logo';

interface Props {
  data: AppData;
}


type Situacao = 'Presença' | 'Falta' | 'Substituição' | 'Pendente';

const SITUACAO_COLOR: Record<Situacao, string> = {
  Presença: 'text-emerald',
  Falta: 'text-red-600 dark:text-red-400',
  Substituição: 'text-amber-600 dark:text-amber-400',
  Pendente: 'text-base-muted',
};

const SITUACAO_BADGE: Record<Situacao, { bg: string; color: string }> = {
  Presença: { bg: '#dcfce7', color: '#16a34a' },
  Falta: { bg: '#fee2e2', color: '#dc2626' },
  Substituição: { bg: '#fef3c7', color: '#d97706' },
  Pendente: { bg: '#f1f5f9', color: '#64748b' },
};

/** Classifica cada lançamento do histórico em Presença, Falta ou Substituição. */
function situacaoDe(entry: HistoricoEntry): Situacao {
  if (entry.tipo === 'reagendamento') {
    if (entry.status === 'presente') return 'Presença';
    if (entry.status === 'falta') return 'Falta';
    return 'Substituição';
  }
  if (entry.reagendadoPara) return 'Substituição';
  if (entry.status === 'presente') return 'Presença';
  if (entry.status === 'falta') return 'Falta';
  return 'Pendente';
}

function observacaoDe(entry: HistoricoEntry): string {
  if (entry.tipo === 'reagendamento' && entry.origem) {
    const origem = `Origem: ${formatDateLabel(entry.origem.data)} às ${entry.origem.horario}`;
    return entry.status === 'falta' && entry.faltaObservacao
      ? `${origem} — ${entry.faltaObservacao}`
      : origem;
  }
  if (entry.reagendadoPara) {
    return `Substituição em ${formatDateLabel(entry.reagendadoPara.data)} às ${entry.reagendadoPara.horario}`;
  }
  if (entry.status === 'falta' && entry.faltaObservacao) {
    return entry.faltaObservacao;
  }
  return '—';
}

function formatDateFull(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatPeriodo(range: DateRange): string {
  return `${formatDateFull(range.start)} a ${formatDateFull(range.end)}`;
}

interface HistoricoComAluno extends HistoricoEntry {
  alunoNome: string;
}

/* ---------- Histórico na tela (cards) ---------- */

function HistoricoRow({ entry }: { entry: HistoricoEntry }) {
  const isReagendamento = entry.tipo === 'reagendamento';
  const situacao = situacaoDe(entry);
  return (
    <div className="flex items-center justify-between gap-2 bg-base-card border border-base-border rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm min-w-0">
        <Clock size={14} className="text-base-muted shrink-0" />
        <span className="shrink-0">{formatDateLabel(entry.data)}</span>
        <span className="text-base-muted shrink-0">{entry.horario}</span>
        {isReagendamento && (
          <span className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">
            Substituição
          </span>
        )}
      </div>
      <div className="text-right shrink-0">
        <span className={`text-xs font-semibold ${SITUACAO_COLOR[situacao]}`}>{situacao}</span>
        {isReagendamento && entry.origem && (
          <p className="text-[11px] text-base-muted mt-0.5">
            Origem: {formatDateLabel(entry.origem.data)} às {entry.origem.horario}
          </p>
        )}
        {!isReagendamento && entry.reagendadoPara && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
            → Substituição em {formatDateLabel(entry.reagendadoPara.data)} às {entry.reagendadoPara.horario}
          </p>
        )}
        {entry.status === 'falta' && entry.faltaObservacao && (
          <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">Obs.: {entry.faltaObservacao}</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Layout exclusivo de impressão (relatório formal) ---------- */

function MacroCard({ value, label, bg, color }: { value: string; label: string; bg: string; color: string }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.2 }}>{value}</div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 0.4,
          color,
          marginTop: 4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        background: bg,
        color,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.3,
        padding: '2px 8px',
        borderRadius: 4,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  );
}

function ConsolidadoTable({ lista }: { lista: AlunoStats[] }) {
  const tot = lista.reduce(
    (acc, s) => ({
      plano: acc.plano + s.totalPlano,
      presencas: acc.presencas + s.presencas,
      faltas: acc.faltas + s.faltas,
      reposicoes: acc.reposicoes + s.reposicoes,
      faturamento: acc.faturamento + s.faturamento,
    }),
    { plano: 0, presencas: 0, faltas: 0, reposicoes: 0, faturamento: 0 },
  );

  return (
    <table>
      <thead>
        <tr>
          <th>Aluno(a)</th>
          <th className="num">Plano Contratado</th>
          <th className="num">Realizadas</th>
          <th className="num">Faltas Just.</th>
          <th className="num">Substituições</th>
          <th className="num">Taxa Presença</th>
          <th className="num">Valor/Aula</th>
          <th className="num">Total a Pagar</th>
        </tr>
      </thead>
      <tbody>
        {lista.map((s) => (
          <tr key={s.aluno.id}>
            <td>{s.aluno.nome}</td>
            <td className="num">{s.totalPlano} aulas/mês</td>
            <td className="num">{s.presencas}</td>
            <td className="num">{s.faltas}</td>
            <td className="num">{s.reposicoes}</td>
            <td className="num">{s.taxaPresenca.toFixed(1)}%</td>
            <td className="num">{formatBRL(s.aluno.valorAula)}</td>
            <td className="num">{formatBRL(s.faturamento)}</td>
          </tr>
        ))}
        <tr className="total-row">
          <td>TOTAL</td>
          <td className="num">{tot.plano} Aulas Total</td>
          <td className="num">{tot.presencas}</td>
          <td className="num">{tot.faltas}</td>
          <td className="num">{tot.reposicoes}</td>
          <td className="num">
            {tot.plano > 0 ? ((tot.presencas / tot.plano) * 100).toFixed(1) : '0.0'}%
          </td>
          <td className="num">—</td>
          <td className="num">{formatBRL(tot.faturamento)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function HistoricoTable({ entries, mostrarAluno }: { entries: HistoricoComAluno[]; mostrarAluno: boolean }) {
  return (
    <div className="avoid-break" style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 2 }}>Histórico Detalhado de Agendamentos</h3>
      <p style={{ fontSize: 10, color: '#64748b', marginBottom: 8, maxWidth: 560 }}>
        Listagem completa das aulas no período, com identificação de Presença, Falta ou Substituição, servindo como
        auditoria física.
      </p>

      {entries.length === 0 ? (
        <p style={{ fontSize: 11 }}>Nenhum agendamento registrado no período.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Data</th>
              {mostrarAluno && <th>Aluno(a)</th>}
              <th>Horário</th>
              <th>Tipo de Evento</th>
              <th>Status</th>
              <th>Observações / Evidência</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const situacao = situacaoDe(e);
              const badge = SITUACAO_BADGE[situacao];
              return (
                <tr key={e.id}>
                  <td>{formatDateLabel(e.data)}</td>
                  {mostrarAluno && <td>{e.alunoNome}</td>}
                  <td>{e.horario}</td>
                  <td>
                    <Badge
                      label={e.tipo === 'reagendamento' ? 'Substituição' : 'Aula regular'}
                      bg="#e2e8f0"
                      color="#334155"
                    />
                  </td>
                  <td>
                    <Badge label={situacao} bg={badge.bg} color={badge.color} />
                  </td>
                  <td>{observacaoDe(e)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function RelatoriosView({ data }: Props) {
  const nomeProfissional = data.config.nomeProfissional;
  const registroProfissional = data.config.registroProfissional;
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [range, setRange] = useState<DateRange>(() => currentMonthRange());

  const stats = useMemo(() => overviewStats(data, range), [data, range]);
  const emitidoEm = useMemo(() => new Date().toLocaleString('pt-BR'), []);

  function toggleAluno(id: string) {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  function handleRangeChange(field: 'start' | 'end', value: string) {
    if (!value) return;
    setRange((prev) => ({ ...prev, [field]: value }));
  }

  const modoGeral = selecionados.length === 0;
  const statsFiltrados = useMemo(
    () => stats.porAluno.filter((s) => selecionados.includes(s.aluno.id)),
    [stats.porAluno, selecionados],
  );
  const listaAtiva = modoGeral ? stats.porAluno : statsFiltrados;

  const totalSelecionados = useMemo(
    () => ({
      presencas: statsFiltrados.reduce((acc, s) => acc + s.presencas, 0),
      faltas: statsFiltrados.reduce((acc, s) => acc + s.faltas, 0),
      reposicoes: statsFiltrados.reduce((acc, s) => acc + s.reposicoes, 0),
      faturamento: statsFiltrados.reduce((acc, s) => acc + s.faturamento, 0),
    }),
    [statsFiltrados],
  );

  const escopo = modoGeral
    ? 'Geral (Todos os Alunos Ativos)'
    : statsFiltrados.map((s) => s.aluno.nome).join(', ');

  const macro = useMemo(() => {
    const presencas = listaAtiva.reduce((acc, s) => acc + s.presencas, 0);
    const plano = listaAtiva.reduce((acc, s) => acc + s.totalPlano, 0);
    const faturamento = listaAtiva.reduce((acc, s) => acc + s.faturamento, 0);
    const reposicoes = listaAtiva.reduce((acc, s) => acc + s.reposicoes, 0);
    return {
      presencas,
      taxaMedia: plano > 0 ? (presencas / plano) * 100 : 0,
      faturamento,
      reposicoes,
    };
  }, [listaAtiva]);

  const historicoDetalhado = useMemo<HistoricoComAluno[]>(() => {
    return listaAtiva
      .flatMap((s) =>
        historicoDoAluno(s.aluno, data.registros, range).map((e) => ({ ...e, alunoNome: s.aluno.nome })),
      )
      .sort((a, b) => a.data.localeCompare(b.data) || a.horario.localeCompare(b.horario));
  }, [listaAtiva, data.registros, range]);

  const mostrarAlunoNoHistorico = modoGeral || statsFiltrados.length > 1;

  return (
    <div id="relatorio-print" className="space-y-5">
      {/* Cabeçalho do documento — só na impressão */}
      <div className="hidden print:block" style={{ marginBottom: 16, borderBottom: '3px solid #15A9AD', paddingBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Logo variant="dark" height={56} />
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>Relatório de Frequência e Faturamento</h2>
            <p style={{ fontSize: 10, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>
              Controle de Aulas e Métricas Financeiras
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            marginTop: 10,
            fontSize: 11,
            lineHeight: 1.6,
          }}
        >
          <div>
            <strong>Profissional:</strong> {nomeProfissional}
          </div>
          <div>
            <strong>Período:</strong> {formatPeriodo(range)}
          </div>
          <div>
            <strong>Escopo:</strong> {escopo}
          </div>
          <div>
            <strong>Emitido em:</strong> {emitidoEm}
          </div>
        </div>
      </div>

      {/* Cabeçalho da tela */}
      <div className="no-print flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Relatório</h2>
          <p className="text-sm text-base-muted">{formatPeriodo(range)}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 bg-electric text-white text-sm font-semibold px-3.5 py-2 rounded-xl active:bg-electric/80 shrink-0"
        >
          <FileDown size={16} strokeWidth={2.5} />
          Gerar PDF
        </button>
      </div>

      {/* Filtro de período — só na tela */}
      <div className="no-print space-y-2">
        <label className="!mb-0 px-1">Período do relatório</label>
        <div className="grid grid-cols-2 gap-2">
          {[currentMonthRange(), previousMonthRange()].map((preset, i) => {
            const active = range.start === preset.start && range.end === preset.end;
            return (
              <button
                key={i}
                onClick={() => setRange(preset)}
                className={`py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-emerald text-black border-emerald'
                    : 'bg-base-surface text-base-muted border-base-border active:bg-base-hover/5'
                }`}
              >
                {monthLabel(startOfMonth(preset.start))}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="relatorio-data-inicial" className="!mb-1">Data inicial</label>
            <input
              id="relatorio-data-inicial"
              type="date"
              value={range.start}
              max={range.end}
              onChange={(e) => handleRangeChange('start', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="relatorio-data-final" className="!mb-1">Data final</label>
            <input
              id="relatorio-data-final"
              type="date"
              value={range.end}
              min={range.start}
              onChange={(e) => handleRangeChange('end', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Filtro de alunos — só na tela */}
      <div className="no-print space-y-2">
        <div className="flex items-center justify-between px-1">
          <label className="!mb-0">Filtrar alunos</label>
          {selecionados.length > 0 && (
            <button
              onClick={() => setSelecionados([])}
              className="text-xs font-semibold text-emerald active:opacity-70"
            >
              Ver visão geral
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {data.alunos.map((a) => {
            const active = selecionados.includes(a.id);
            return (
              <button
                key={a.id}
                onClick={() => toggleAluno(a.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-emerald text-black border-emerald'
                    : 'bg-base-surface text-base-muted border-base-border active:bg-base-hover/5'
                }`}
              >
                {active && <Check size={13} strokeWidth={3} />}
                {a.nome}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-base-muted px-1">
          {modoGeral
            ? 'Nenhum aluno selecionado: exibindo visão geral.'
            : `${selecionados.length} aluno${selecionados.length > 1 ? 's' : ''} selecionado${selecionados.length > 1 ? 's' : ''}.`}
        </p>
      </div>

      {/* ===== RELATÓRIO FORMAL — só na impressão ===== */}
      <div className="hidden print:block">
        {/* Indicadores macro */}
        <div className="avoid-break">
          <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 2 }}>Indicadores Macro do Período</h3>
          <p style={{ fontSize: 10, color: '#64748b', marginBottom: 8, maxWidth: 560 }}>
            Métricas consolidadas com base nos planos contratados e registros de chamadas diárias computadas no
            aplicativo.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <MacroCard value={String(macro.presencas)} label="Presenças Confirmadas" bg="#dcfce7" color="#16a34a" />
            <MacroCard
              value={`${macro.taxaMedia.toFixed(1)}%`}
              label="Taxa Média de Frequência"
              bg="#dbeafe"
              color="#2563eb"
            />
            <MacroCard
              value={formatBRL(macro.faturamento)}
              label="Faturamento Estimado"
              bg="#f3e8ff"
              color="#9333ea"
            />
            <MacroCard value={String(macro.reposicoes)} label="Substituições" bg="#fef3c7" color="#d97706" />
          </div>
        </div>

        {/* Consolidado por aluno */}
        <div className="avoid-break" style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Consolidado por Aluno</h3>
          <ConsolidadoTable lista={listaAtiva} />
        </div>

        {/* Histórico completo de agendamentos */}
        <HistoricoTable entries={historicoDetalhado} mostrarAluno={mostrarAlunoNoHistorico} />

        {/* Assinatura */}
        <div className="avoid-break" style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', gap: 40 }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 11, fontWeight: 700 }}>
              {nomeProfissional}
            </div>
            <div style={{ fontSize: 9, color: '#64748b' }}>{registroProfissional}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 11, fontWeight: 700 }}>
              Data de Ciência / Validação
            </div>
            <div style={{ fontSize: 9, color: '#64748b' }}>____ / ____ / {new Date().getFullYear()}</div>
          </div>
        </div>
      </div>

      {/* ===== CONTEÚDO DA TELA (cards) — escondido na impressão ===== */}
      {modoGeral && (
        <div className="print:hidden space-y-5">
          <div className="bg-gradient-to-br from-emerald/15 to-electric/10 border border-emerald/30 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-emerald mb-1">
              <TrendingUp size={18} />
              <span className="text-sm font-medium">Faturamento do período</span>
            </div>
            <p className="text-3xl font-bold tabular-nums">{formatBRL(stats.faturamentoTotal)}</p>
            <p className="text-xs text-base-muted mt-1">Baseado nas aulas com presença confirmada</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-base-card border border-base-border rounded-2xl p-3 text-center">
              <CheckCircle2 size={18} className="text-emerald mx-auto mb-1" />
              <p className="text-xl font-bold tabular-nums">{stats.totalPresencas}</p>
              <p className="text-[11px] text-base-muted">Presenças</p>
            </div>
            <div className="bg-base-card border border-base-border rounded-2xl p-3 text-center">
              <XCircle size={18} className="text-red-600 dark:text-red-400 mx-auto mb-1" />
              <p className="text-xl font-bold tabular-nums">{stats.totalFaltas}</p>
              <p className="text-[11px] text-base-muted">Faltas</p>
            </div>
            <div className="bg-base-card border border-base-border rounded-2xl p-3 text-center">
              <RotateCw size={18} className="text-amber-600 dark:text-amber-400 mx-auto mb-1" />
              <p className="text-xl font-bold tabular-nums">{stats.totalReposicoes}</p>
              <p className="text-[11px] text-base-muted">Substituições</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-base-muted mb-2 px-1">Por aluno</h3>
            <div className="space-y-2">
              {stats.porAluno.map((s) => (
                <div key={s.aluno.id} className="bg-base-card border border-base-border rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold">{s.aluno.nome}</p>
                    <p className="font-bold text-emerald tabular-nums">{formatBRL(s.faturamento)}</p>
                  </div>

                  <div className="h-1.5 rounded-full bg-base-surface overflow-hidden mb-2">
                    <div
                      className="h-full bg-electric rounded-full transition-all"
                      style={{ width: `${Math.min(s.taxaPresenca, 100)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-base-muted">
                    <span>
                      {s.presencas} / {s.totalPlano} aulas ({s.taxaPresenca}%)
                    </span>
                    <span className="flex items-center gap-2.5">
                      <span className="text-red-600 dark:text-red-400">{s.faltas} {s.faltas === 1 ? 'falta' : 'faltas'}</span>
                      <span className="text-amber-600 dark:text-amber-400">{s.reposicoes} {s.reposicoes === 1 ? 'subst.' : 'substs.'}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!modoGeral && (
        <div className="print:hidden space-y-5">
          {selecionados.length > 1 && (
            <div className="bg-gradient-to-br from-emerald/15 to-electric/10 border border-emerald/30 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-emerald mb-1">
                <TrendingUp size={18} />
                <span className="text-sm font-medium">Faturamento dos selecionados</span>
              </div>
              <p className="text-3xl font-bold tabular-nums">{formatBRL(totalSelecionados.faturamento)}</p>
              <div className="flex items-center gap-3 text-xs text-base-muted mt-2">
                <span>{totalSelecionados.presencas} presenças</span>
                <span className="text-red-600 dark:text-red-400">{totalSelecionados.faltas} faltas</span>
                <span className="text-amber-600 dark:text-amber-400">{totalSelecionados.reposicoes} subst.</span>
              </div>
            </div>
          )}

          {statsFiltrados.map((s) => {
            const historico = historicoDoAluno(s.aluno, data.registros, range);
            return (
              <div key={s.aluno.id} className="space-y-2">
                <div className="bg-base-card border border-base-border rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold">{s.aluno.nome}</p>
                    <p className="font-bold text-emerald tabular-nums">{formatBRL(s.faturamento)}</p>
                  </div>

                  <div className="h-1.5 rounded-full bg-base-surface overflow-hidden mb-2">
                    <div
                      className="h-full bg-electric rounded-full transition-all"
                      style={{ width: `${Math.min(s.taxaPresenca, 100)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-base-muted">
                    <span>
                      {s.presencas} / {s.totalPlano} aulas ({s.taxaPresenca}%)
                    </span>
                    <span className="flex items-center gap-2.5">
                      <span className="text-red-600 dark:text-red-400">{s.faltas} {s.faltas === 1 ? 'falta' : 'faltas'}</span>
                      <span className="text-amber-600 dark:text-amber-400">{s.reposicoes} {s.reposicoes === 1 ? 'subst.' : 'substs.'}</span>
                    </span>
                  </div>
                </div>

                {historico.length === 0 ? (
                  <div className="text-center py-6 text-base-muted text-sm">Nenhum registro no período.</div>
                ) : (
                  <div className="space-y-2">
                    {historico.map((entry) => (
                      <HistoricoRow key={entry.id} entry={entry} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
