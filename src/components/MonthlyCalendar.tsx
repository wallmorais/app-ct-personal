import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AppData } from '../types';
import { DIA_LABELS, ORDEM_SEMANA, dowOf, getMonthMatrix, monthLabel, todayISO } from '../lib/date';

interface Props {
  data: AppData;
  monthCursor: string;
  selectedDate: string;
  onChangeMonth: (direction: 'prev' | 'next') => void;
  onSelectDate: (iso: string) => void;
}

function countAgendaItems(data: AppData, dateISO: string): number {
  const dow = dowOf(dateISO);
  let count = 0;
  for (const slot of data.slots) {
    if (slot.dias.includes(dow)) count += slot.alunoIds.length;
  }
  for (const r of data.registros) {
    if (r.reposicaoData === dateISO) count += 1;
  }
  return count;
}

export default function MonthlyCalendar({ data, monthCursor, selectedDate, onChangeMonth, onSelectDate }: Props) {
  const weeks = getMonthMatrix(monthCursor);
  const monthIndex = new Date(`${monthCursor}T00:00:00`).getMonth();
  const today = todayISO();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => onChangeMonth('prev')}
          aria-label="Mês anterior"
          className="w-9 h-9 rounded-full bg-base-surface border border-base-border flex items-center justify-center active:bg-base-hover/5"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-semibold">{monthLabel(monthCursor)}</p>
        <button
          onClick={() => onChangeMonth('next')}
          aria-label="Próximo mês"
          className="w-9 h-9 rounded-full bg-base-surface border border-base-border flex items-center justify-center active:bg-base-hover/5"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-base-muted font-medium">
        {ORDEM_SEMANA.map((dow) => (
          <div key={dow}>{DIA_LABELS[dow]}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((dateISO) => {
          const dayNum = Number(dateISO.slice(8, 10));
          const isCurrentMonth = new Date(`${dateISO}T00:00:00`).getMonth() === monthIndex;
          const isToday = dateISO === today;
          const isSelected = dateISO === selectedDate;
          const count = countAgendaItems(data, dateISO);

          return (
            <button
              key={dateISO}
              onClick={() => onSelectDate(dateISO)}
              className={`aspect-square rounded-xl border flex flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors ${
                isSelected
                  ? 'bg-emerald text-black border-emerald'
                  : isToday
                  ? 'bg-base-surface border-emerald text-base-fg'
                  : 'bg-base-surface border-base-border text-base-fg active:bg-base-hover/5'
              } ${!isCurrentMonth ? 'opacity-30' : ''}`}
            >
              <span>{dayNum}</span>
              {count > 0 && (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isSelected ? 'bg-black/60' : 'bg-electric'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
