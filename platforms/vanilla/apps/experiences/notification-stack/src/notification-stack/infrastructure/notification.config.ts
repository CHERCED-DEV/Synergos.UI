export interface NotificationConfig {
  readonly notifications?: ReadonlyArray<{
    readonly id?: string;
    readonly message?: string;
    readonly type?: string;
    readonly duration?: number;
  }>;
  readonly theme?: string;
}
