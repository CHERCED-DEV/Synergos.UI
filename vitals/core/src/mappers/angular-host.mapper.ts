import type { AngularHostElementData } from '@synergos/contracts';
import type { AngularHostInputs } from '../models/angular-host-inputs.model';

export function mapAngularHostData(data: AngularHostElementData): AngularHostInputs {
  const rawData = data as Record<string, unknown>;

  return {
    tagName: typeof rawData['tagName'] === 'string' ? rawData['tagName'] : '',
    props: JSON.stringify(rawData['props'] ?? {}),
    textContent: typeof rawData['textContent'] === 'string' ? rawData['textContent'] : '',
  };
}
