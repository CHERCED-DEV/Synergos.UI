export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  readonly id: string;
  readonly message: string;
  readonly type: NotificationType;
  readonly duration: number;
}
