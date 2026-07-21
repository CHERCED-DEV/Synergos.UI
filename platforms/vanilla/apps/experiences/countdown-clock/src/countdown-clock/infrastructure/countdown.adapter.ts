import type { CountdownConfig } from './countdown.config';

export interface CountdownInstance {
  readonly targetDate: string;
  readonly label: string;
  readonly theme: string;
}

export function adaptCountdownConfig(raw: Partial<CountdownConfig> | undefined): CountdownInstance {
  const fallback = new Date(Date.now() + 86_400_000).toISOString();
  return {
    targetDate: raw?.targetDate ?? fallback,
    label: raw?.label ?? '',
    theme: raw?.theme ?? 'light',
  };
}
