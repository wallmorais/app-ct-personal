/**
 * Camada de envio de notificações do "Lembrete diário".
 *
 * ▸ ONDE FICA A LÓGICA DE ENVIO: a função `sendReminderNotification()` abaixo.
 *   Hoje ela usa a Web Notifications API (notificação real do sistema
 *   operacional, fora da aba). Se um dia o app tiver back-end, é AQUI que você
 *   trocaria/duplicaria a chamada por um envio server-side (push, WhatsApp,
 *   e-mail, etc.) — a interface (`count`) permanece a mesma.
 *
 * Observação importante (navegador): para a notificação disparar no horário,
 * o app precisa estar aberto (mesmo em segundo plano). Em iOS, notificações
 * web só funcionam se o site for adicionado à Tela de Início (PWA).
 */

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function notificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!notificationSupported()) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

/** Pede permissão ao usuário (precisa ser chamada a partir de um gesto/clique). */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!notificationSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch {
    return getNotificationPermission();
  }
}

/**
 * Dispara o alerta de aulas sem check-in.
 * @param count quantidade de aulas pendentes hoje
 * @returns true se uma notificação do SO foi disparada
 */
export function sendReminderNotification(count: number): boolean {
  if (count <= 0) return false;
  if (getNotificationPermission() !== 'granted') return false;

  const titulo = 'PT.Control — Lembrete diário';
  const corpo =
    count === 1
      ? 'Você tem 1 aula de hoje sem check-in. Atualize a presença na aba Agenda.'
      : `Você tem ${count} aulas de hoje sem check-in. Atualize a presença na aba Agenda.`;

  try {
    const notif = new Notification(titulo, {
      body: corpo,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: 'pt-control-lembrete-diario', // evita empilhar várias do mesmo dia
      renotify: true,
    } as NotificationOptions);
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}
