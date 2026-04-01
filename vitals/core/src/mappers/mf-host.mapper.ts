import type { MfHostElementData } from '@synergos/contracts';
import type { MfHostInputs } from '../models/mf-host-inputs.model';

export function mapMfHostData(data: MfHostElementData): MfHostInputs {
  const rawData = data as Record<string, unknown>;

  return {
    remoteEntry: typeof rawData['remoteEntry'] === 'string' ? rawData['remoteEntry'] : '',
    tagName: typeof rawData['tagName'] === 'string' ? rawData['tagName'] : '',
    props: JSON.stringify(rawData['props'] ?? {}),
  };
}
