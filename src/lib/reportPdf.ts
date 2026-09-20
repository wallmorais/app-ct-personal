import { jsPDF } from 'jspdf';
import {
  overviewStats,
  historicoDoAluno,
  formatBRL,
  type AlunoStats,
  type HistoricoEntry,
  type DateRange,
} from './billing';
import { formatDateLabel } from './date';
import type { AppData, Aluno } from '../types';

type Situacao = 'Presença' | 'Falta' | 'Falta não avisada' | 'Falta do Professor' | 'Substituição' | 'Pendente';

function situacaoDe(entry: HistoricoEntry): Situacao {
  if (entry.tipo === 'reagendamento') {
    if (entry.status === 'presente') return 'Presença';
    if (entry.status === 'falta') return 'Falta';
    return 'Substituição';
  }
  if (entry.faltaProfessor) return 'Falta do Professor';
  if (entry.faltaTipo === 'nao_avisada') return 'Falta não avisada';
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
  if (entry.faltaProfessor) {
    return entry.reagendadoPara
      ? `Sem cobrança · Reposição em ${formatDateLabel(entry.reagendadoPara.data)} às ${entry.reagendadoPara.horario}`
      : 'Sem cobrança';
  }
  if (entry.faltaTipo === 'nao_avisada') return 'Cobrada · Sem reposição';
  if (entry.reagendadoPara) {
    return `Substituição em ${formatDateLabel(entry.reagendadoPara.data)} às ${entry.reagendadoPara.horario}`;
  }
  if (entry.status === 'falta' && entry.faltaObservacao) return entry.faltaObservacao;
  return '—';
}

function formatDateFull(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatPeriodo(range: DateRange): string {
  return `${formatDateFull(range.start)} a ${formatDateFull(range.end)}`;
}

type RGB = [number, number, number];

// Colors
const TEAL: RGB = [21, 169, 173];
const DARK: RGB = [15, 23, 42];
const SLATE: RGB = [100, 116, 139];
const WHITE: RGB = [255, 255, 255];
const GREEN_BG: RGB = [220, 252, 231];
const GREEN_FG: RGB = [22, 163, 74];
const BLUE_BG: RGB = [219, 234, 254];
const BLUE_FG: RGB = [37, 99, 235];
const PURPLE_BG: RGB = [243, 232, 255];
const PURPLE_FG: RGB = [147, 51, 234];
const AMBER_BG: RGB = [254, 243, 199];
const AMBER_FG: RGB = [217, 119, 6];
const SKY_BG: RGB = [224, 242, 254];
const SKY_FG: RGB = [3, 105, 161];
const LIGHT_GRAY: RGB = [241, 245, 249];
const TABLE_HEADER_BG: RGB = [30, 41, 59];
const TABLE_BORDER: RGB = [226, 232, 240];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - 2 * MARGIN;

interface HistoricoComAluno extends HistoricoEntry {
  alunoNome: string;
}

export interface ReportInput {
  data: AppData;
  range: DateRange;
  nomeProfissional: string;
  registroProfissional: string;
  escopo: string;
  listaAtiva: AlunoStats[];
  historicoDetalhado: HistoricoComAluno[];
  mostrarAlunoNoHistorico: boolean;
  feriasProfessor: Array<{ id: string; dataInicio: string; dataFim: string }>;
  feriasAlunos: Array<{ aluno: Aluno; periodos: Array<{ dataInicio: string; dataFim?: string }> }>;
}

function addPage(doc: jsPDF): number {
  doc.addPage();
  return MARGIN;
}

function checkPageBreak(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - MARGIN) return addPage(doc);
  return y;
}

function drawMacroCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  value: string,
  label: string,
  bg: RGB,
  fg: RGB,
) {
  doc.setFillColor(bg[0], bg[1], bg[2]);
  doc.roundedRect(x, y, w, 22, 3, 3, 'F');
  doc.setTextColor(fg[0], fg[1], fg[2]);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(value, x + w / 2, y + 10, { align: 'center' });
  doc.setFontSize(6);
  doc.text(label.toUpperCase(), x + w / 2, y + 17, { align: 'center' });
}

function drawTableHeader(doc: jsPDF, y: number, cols: Array<{ label: string; x: number; w: number; align?: 'right' | 'left' }>) {
  doc.setFillColor(TABLE_HEADER_BG[0], TABLE_HEADER_BG[1], TABLE_HEADER_BG[2]);
  doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  for (const col of cols) {
    const textX = col.align === 'right' ? col.x + col.w - 1 : col.x + 1;
    doc.text(col.label, textX, y + 5, { align: col.align === 'right' ? 'right' : 'left' });
  }
  return y + 7;
}

function drawTableRow(
  doc: jsPDF,
  y: number,
  cols: Array<{ text: string; x: number; w: number; align?: 'right' | 'left' }>,
  highlight = false,
) {
  const rowH = 6;
  if (highlight) {
    doc.setFillColor(LIGHT_GRAY[0], LIGHT_GRAY[1], LIGHT_GRAY[2]);
    doc.rect(MARGIN, y, CONTENT_W, rowH, 'F');
  }
  doc.setDrawColor(TABLE_BORDER[0], TABLE_BORDER[1], TABLE_BORDER[2]);
  doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  doc.setFontSize(7);
  doc.setFont('helvetica', highlight ? 'bold' : 'normal');
  for (const col of cols) {
    const textX = col.align === 'right' ? col.x + col.w - 1 : col.x + 1;
    const maxW = col.w - 2;
    const truncated = doc.splitTextToSize(col.text, maxW)[0] as string;
    doc.text(truncated, textX, y + 4, { align: col.align === 'right' ? 'right' : 'left' });
  }
  return y + rowH;
}

export function generateReportPdf(input: ReportInput): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = MARGIN;

  // -- Header --
  doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Controle', MARGIN, y + 5);
  const controleW = doc.getTextWidth('Controle ');
  doc.text('Personal', MARGIN + controleW, y + 5);

  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório de Frequência e Faturamento', PAGE_W - MARGIN, y + 4, { align: 'right' });
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('CONTROLE DE AULAS E MÉTRICAS FINANCEIRAS', PAGE_W - MARGIN, y + 8, { align: 'right' });

  y += 12;
  doc.setDrawColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;

  // Meta info
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  doc.setFontSize(8);
  const emitidoEm = new Date().toLocaleString('pt-BR');
  const metaLeft = [
    `Professor: ${input.nomeProfissional}`,
    `Escopo: ${input.escopo}`,
  ];
  const metaRight = [
    `Período: ${formatPeriodo(input.range)}`,
    `Emitido em: ${emitidoEm}`,
  ];
  for (let i = 0; i < metaLeft.length; i++) {
    doc.setFont('helvetica', 'bold');
    const labelLeft = metaLeft[i].split(':')[0] + ':';
    doc.text(labelLeft, MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.text(metaLeft[i].split(':').slice(1).join(':').trim(), MARGIN + doc.getTextWidth(labelLeft) + 1, y);

    doc.setFont('helvetica', 'bold');
    const labelRight = metaRight[i].split(':')[0] + ':';
    doc.text(labelRight, PAGE_W / 2 + 5, y);
    doc.setFont('helvetica', 'normal');
    doc.text(metaRight[i].split(':').slice(1).join(':').trim(), PAGE_W / 2 + 5 + doc.getTextWidth(labelRight) + 1, y);
    y += 5;
  }
  y += 3;

  // -- Macro indicators --
  y = checkPageBreak(doc, y, 35);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Indicadores Macro do Período', MARGIN, y);
  y += 3;
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Métricas consolidadas com base nos planos contratados e registros de chamadas diárias.',
    MARGIN,
    y,
  );
  y += 5;

  const presencas = input.listaAtiva.reduce((a, s) => a + s.presencas, 0);
  const plano = input.listaAtiva.reduce((a, s) => a + s.totalPlano, 0);
  const faturamento = input.listaAtiva.reduce((a, s) => a + s.faturamento, 0);
  const reposicoes = input.listaAtiva.reduce((a, s) => a + s.reposicoes, 0);
  const antecipacoes = input.listaAtiva.reduce((a, s) => a + s.antecipacoes, 0);
  const taxaMedia = plano > 0 ? (presencas / plano) * 100 : 0;

  const cardW = (CONTENT_W - 4 * 3) / 5;
  const cards: Array<{ value: string; label: string; bg: RGB; fg: RGB }> = [
    { value: String(presencas), label: 'Presenças Confirmadas', bg: GREEN_BG, fg: GREEN_FG },
    { value: `${taxaMedia.toFixed(1)}%`, label: 'Taxa Média Frequência', bg: BLUE_BG, fg: BLUE_FG },
    { value: formatBRL(faturamento), label: 'Faturamento Estimado', bg: PURPLE_BG, fg: PURPLE_FG },
    { value: String(reposicoes), label: 'Reposições', bg: AMBER_BG, fg: AMBER_FG },
    { value: String(antecipacoes), label: 'Antecipações', bg: SKY_BG, fg: SKY_FG },
  ];
  for (let i = 0; i < cards.length; i++) {
    const cx = MARGIN + i * (cardW + 3);
    drawMacroCard(doc, cx, y, cardW, cards[i].value, cards[i].label, cards[i].bg, cards[i].fg);
  }
  y += 28;

  // -- Consolidated table --
  y = checkPageBreak(doc, y, 30);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Consolidado por Aluno', MARGIN, y);
  y += 5;

  const consCols = [
    { label: 'Aluno(a)', x: MARGIN, w: 35 },
    { label: 'Plano', x: MARGIN + 35, w: 22, align: 'right' as const },
    { label: 'Realizadas', x: MARGIN + 57, w: 20, align: 'right' as const },
    { label: 'Faltas', x: MARGIN + 77, w: 16, align: 'right' as const },
    { label: 'Repos.', x: MARGIN + 93, w: 16, align: 'right' as const },
    { label: 'Frequência', x: MARGIN + 109, w: 20, align: 'right' as const },
    { label: 'Valor/Aula', x: MARGIN + 129, w: 22, align: 'right' as const },
    { label: 'Total', x: MARGIN + 151, w: CONTENT_W - 151, align: 'right' as const },
  ];
  y = drawTableHeader(doc, y, consCols);

  const totals = { plano: 0, presencas: 0, faltas: 0, reposicoes: 0, faturamento: 0 };
  for (const s of input.listaAtiva) {
    y = checkPageBreak(doc, y, 7);
    totals.plano += s.totalPlano;
    totals.presencas += s.presencas;
    totals.faltas += s.faltas;
    totals.reposicoes += s.reposicoes;
    totals.faturamento += s.faturamento;
    y = drawTableRow(doc, y, [
      { text: s.aluno.nome, x: consCols[0].x, w: consCols[0].w },
      { text: `${s.totalPlano} aulas/mês`, x: consCols[1].x, w: consCols[1].w, align: 'right' },
      { text: String(s.presencas), x: consCols[2].x, w: consCols[2].w, align: 'right' },
      { text: String(s.faltas), x: consCols[3].x, w: consCols[3].w, align: 'right' },
      { text: String(s.reposicoes), x: consCols[4].x, w: consCols[4].w, align: 'right' },
      { text: `${s.taxaPresenca.toFixed(1)}%`, x: consCols[5].x, w: consCols[5].w, align: 'right' },
      { text: formatBRL(s.aluno.valorAula), x: consCols[6].x, w: consCols[6].w, align: 'right' },
      { text: formatBRL(s.faturamento), x: consCols[7].x, w: consCols[7].w, align: 'right' },
    ]);
  }
  // Total row
  y = checkPageBreak(doc, y, 7);
  const totalTaxa = totals.plano > 0 ? ((totals.presencas / totals.plano) * 100).toFixed(1) : '0.0';
  y = drawTableRow(
    doc,
    y,
    [
      { text: 'TOTAL', x: consCols[0].x, w: consCols[0].w },
      { text: `${totals.plano} total`, x: consCols[1].x, w: consCols[1].w, align: 'right' },
      { text: String(totals.presencas), x: consCols[2].x, w: consCols[2].w, align: 'right' },
      { text: String(totals.faltas), x: consCols[3].x, w: consCols[3].w, align: 'right' },
      { text: String(totals.reposicoes), x: consCols[4].x, w: consCols[4].w, align: 'right' },
      { text: `${totalTaxa}%`, x: consCols[5].x, w: consCols[5].w, align: 'right' },
      { text: '—', x: consCols[6].x, w: consCols[6].w, align: 'right' },
      { text: formatBRL(totals.faturamento), x: consCols[7].x, w: consCols[7].w, align: 'right' },
    ],
    true,
  );
  y += 6;

  // -- Vacations --
  const temFerias = input.feriasProfessor.length > 0 || input.feriasAlunos.length > 0;
  if (temFerias) {
    y = checkPageBreak(doc, y, 20);
    doc.setTextColor(DARK[0], DARK[1], DARK[2]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Férias no Período', MARGIN, y);
    y += 5;

    if (input.feriasAlunos.length > 0) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Férias dos Alunos', MARGIN, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      for (const { aluno, periodos } of input.feriasAlunos) {
        y = checkPageBreak(doc, y, 5);
        const txt = periodos
          .map((p) => `${formatDateFull(p.dataInicio)} até ${p.dataFim ? formatDateFull(p.dataFim) : '—'}`)
          .join(' · ');
        doc.setFont('helvetica', 'bold');
        doc.text(`${aluno.nome}: `, MARGIN, y);
        doc.setFont('helvetica', 'normal');
        doc.text(txt, MARGIN + doc.getTextWidth(`${aluno.nome}: `), y);
        y += 4;
      }
      y += 2;
    }

    if (input.feriasProfessor.length > 0) {
      y = checkPageBreak(doc, y, 10);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Férias do Professor', MARGIN, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      for (const v of input.feriasProfessor) {
        y = checkPageBreak(doc, y, 5);
        doc.text(`${formatDateFull(v.dataInicio)} até ${formatDateFull(v.dataFim)}`, MARGIN, y);
        y += 4;
      }
      y += 2;
    }
    y += 3;
  }

  // -- Detailed history --
  y = checkPageBreak(doc, y, 25);
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Histórico Detalhado de Agendamentos', MARGIN, y);
  y += 3;
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  const histDesc = doc.splitTextToSize(
    'Listagem completa das aulas no período, com identificação de Presença, Falta, Falta Não Avisada, Falta do Professor ou Substituição.',
    CONTENT_W,
  ) as string[];
  doc.text(histDesc, MARGIN, y);
  y += histDesc.length * 3.5 + 2;

  if (input.historicoDetalhado.length === 0) {
    y = checkPageBreak(doc, y, 6);
    doc.setFontSize(8);
    doc.text('Nenhum agendamento registrado no período.', MARGIN, y);
    y += 6;
  } else {
    const histCols = input.mostrarAlunoNoHistorico
      ? [
          { label: 'Data', x: MARGIN, w: 26 },
          { label: 'Aluno(a)', x: MARGIN + 26, w: 28 },
          { label: 'Horário', x: MARGIN + 54, w: 16 },
          { label: 'Tipo', x: MARGIN + 70, w: 22 },
          { label: 'Status', x: MARGIN + 92, w: 28 },
          { label: 'Observações', x: MARGIN + 120, w: CONTENT_W - 120 },
        ]
      : [
          { label: 'Data', x: MARGIN, w: 30 },
          { label: 'Horário', x: MARGIN + 30, w: 18 },
          { label: 'Tipo', x: MARGIN + 48, w: 26 },
          { label: 'Status', x: MARGIN + 74, w: 30 },
          { label: 'Observações', x: MARGIN + 104, w: CONTENT_W - 104 },
        ];

    y = drawTableHeader(doc, y, histCols);

    for (const e of input.historicoDetalhado) {
      y = checkPageBreak(doc, y, 7);
      const situacao = situacaoDe(e);
      const tipo = e.tipo === 'reagendamento' ? 'Substituição' : 'Aula regular';
      const obs = observacaoDe(e);

      const rowData = input.mostrarAlunoNoHistorico
        ? [
            { text: formatDateLabel(e.data), x: histCols[0].x, w: histCols[0].w },
            { text: e.alunoNome, x: histCols[1].x, w: histCols[1].w },
            { text: e.horario, x: histCols[2].x, w: histCols[2].w },
            { text: tipo, x: histCols[3].x, w: histCols[3].w },
            { text: situacao, x: histCols[4].x, w: histCols[4].w },
            { text: obs, x: histCols[5].x, w: histCols[5].w },
          ]
        : [
            { text: formatDateLabel(e.data), x: histCols[0].x, w: histCols[0].w },
            { text: e.horario, x: histCols[1].x, w: histCols[1].w },
            { text: tipo, x: histCols[2].x, w: histCols[2].w },
            { text: situacao, x: histCols[3].x, w: histCols[3].w },
            { text: obs, x: histCols[4].x, w: histCols[4].w },
          ];

      y = drawTableRow(doc, y, rowData);
    }
    y += 4;
  }

  // -- Signature --
  y = checkPageBreak(doc, y, 25);
  y += 10;
  const sigW = (CONTENT_W - 20) / 2;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, MARGIN + sigW, y);
  doc.line(PAGE_W - MARGIN - sigW, y, PAGE_W - MARGIN, y);
  y += 3;
  doc.setTextColor(DARK[0], DARK[1], DARK[2]);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(input.nomeProfissional, MARGIN, y);
  doc.text('Data de Ciência / Validação', PAGE_W - MARGIN, y, { align: 'right' });
  y += 3;
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(input.registroProfissional, MARGIN, y);
  doc.text(`____ / ____ / ${new Date().getFullYear()}`, PAGE_W - MARGIN, y, { align: 'right' });

  return doc.output('blob');
}

export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
