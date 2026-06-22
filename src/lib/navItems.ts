import { CalendarDays, Users, BarChart3, Settings } from 'lucide-react';
import type { ViewName } from '../types';

export const NAV_ITEMS: { key: ViewName; label: string; icon: typeof CalendarDays }[] = [
  { key: 'agenda', label: 'Agenda', icon: CalendarDays },
  { key: 'alunos', label: 'Alunos', icon: Users },
  { key: 'relatorios', label: 'Relatório', icon: BarChart3 },
  { key: 'config', label: 'Config', icon: Settings },
];
