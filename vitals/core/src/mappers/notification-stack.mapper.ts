import type { NotificationStackInputs } from '../models/notification-stack-inputs.model';

export function mapNotificationStackData(data: Record<string, unknown>): NotificationStackInputs {
  return { config: JSON.stringify(data) };
}
