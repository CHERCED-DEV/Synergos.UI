import type { NotificationConfig } from './notification.config';
import type { Notification, NotificationType } from '../domain/notification.domain';

export interface NotificationInstance {
  readonly notifications: Notification[];
  readonly theme: string;
}

function toType(raw: string | undefined): NotificationType {
  const valid: NotificationType[] = ['info', 'success', 'warning', 'error'];
  return valid.includes(raw as NotificationType) ? (raw as NotificationType) : 'info';
}

export function adaptNotificationConfig(
  raw: Partial<NotificationConfig> | undefined,
): NotificationInstance {
  return {
    notifications: (raw?.notifications ?? []).map((n, i) => ({
      id: n.id ?? String(i),
      message: n.message ?? '',
      type: toType(n.type),
      duration: n.duration ?? 5000,
    })),
    theme: raw?.theme ?? 'light',
  };
}
