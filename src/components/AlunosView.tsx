import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Plus, ChevronRight, Phone } from 'lucide-react';
import type { Aluno, AppData } from '../types';
import { statsDoAluno, formatBRL } from '../lib/billing';
import AlunoFormModal, { type AgendaDia } from './AlunoFormModal';

interface Props {
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
}

export default function AlunosView({ data, setData }: Props) {
  const [editing, setEditing] = useState<Aluno | null | 'new'>(null);

  const alunoStats = useMemo(
    () => new Map(data.alunos.map((a) => [a.id, statsDoAluno(a, data.registros)])),
    [data.alunos, data.registros],
  );

  function handleSave(aluno: Aluno, agenda: AgendaDia[]) {
    setData((prev) => {
      const exists = prev.alunos.some((a) => a.id === aluno.id);
      const alunos = exists
        ? prev.alunos.map((a) => (a.id === aluno.id ? aluno : a))
        : [...prev.alunos, aluno];

      // remove o aluno de todos os slots existentes e descarta os que ficarem vazios
      const slotsBase = prev.slots
        .map((s) => ({ ...s, alunoIds: s.alunoIds.filter((id) => id !== aluno.id) }))
        .filter((s) => s.alunoIds.length > 0);

      const novosSlots = agenda.map((item) => ({
        id: crypto.randomUUID(),
        horario: item.inicio,
        horarioFim: item.fim,
        dias: [item.dia],
        alunoIds: [aluno.id],
      }));

      return { ...prev, alunos, slots: [...slotsBase, ...novosSlots] };
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Alunos</h2>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 bg-emerald text-black text-sm font-semibold px-3.5 py-2 rounded-xl active:bg-emerald/80"
        >
          <Plus size={16} strokeWidth={2.5} />
          Aluno
        </button>
      </div>

      {data.alunos.length === 0 && (
        <div className="text-center py-16 text-base-muted text-sm">Nenhum aluno cadastrado.</div>
      )}

      <div className="space-y-2">
        {data.alunos.map((aluno) => {
          const stats = alunoStats.get(aluno.id)!;
          const progresso = aluno.plano > 0 ? Math.min(stats.presencas / aluno.plano, 1) : 0;

          return (
            <button
              key={aluno.id}
              onClick={() => setEditing(aluno)}
              className="w-full text-left bg-base-card border border-base-border rounded-2xl p-4 active:bg-white/5 transition-colors"
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
                <ChevronRight size={18} className="text-base-muted shrink-0" />
              </div>
            </button>
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
