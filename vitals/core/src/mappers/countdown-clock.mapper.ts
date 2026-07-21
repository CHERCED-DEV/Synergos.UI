import type { CountdownClockInputs } from '../models/countdown-clock-inputs.model';

export function mapCountdownClockData(data: Record<string, unknown>): CountdownClockInputs {
  return { config: JSON.stringify(data) };
}
