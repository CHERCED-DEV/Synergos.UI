import type { MfHostElementData } from '@synergos/contracts';
import type { MfHostInputs } from '../models/mf-host-inputs.model';

export function mapMfHostData(data: MfHostElementData): MfHostInputs {
  const rawData = data as Record<string, unknown>;
  const mountParams = Array.isArray(data.mount?.params)
    ? Object.fromEntries(
        data.mount.params
          .filter((param) => typeof param?.key === 'string' && param.key.trim().length > 0)
          .map((param) => [param.key!.trim(), param.value ?? '']),
      )
    : {};
  const remoteEntry = typeof rawData['remoteEntry'] === 'string'
    ? rawData['remoteEntry']
    : data.mount?.remoteEntry ?? '';
  const exposedModule = typeof rawData['exposedModule'] === 'string'
    ? rawData['exposedModule']
    : data.mount?.exposedModule ?? '';

  return {
    component:
      (typeof rawData['component'] === 'string' ? rawData['component'] : '')
      || exposedModule
      || (typeof rawData['tagName'] === 'string' ? rawData['tagName'] : ''),
    endpoint:
      typeof rawData['endpoint'] === 'string'
        ? rawData['endpoint']
        : data.async?.apiEndpoint ?? '',
    params: JSON.stringify(
      rawData['params'] && typeof rawData['params'] === 'object'
        ? rawData['params']
        : mountParams,
    ),
    scriptSrc: typeof rawData['scriptSrc'] === 'string' ? rawData['scriptSrc'] : remoteEntry,
    remoteEntry,
    exposedModule,
    tagName: typeof rawData['tagName'] === 'string' ? rawData['tagName'] : exposedModule,
    props: JSON.stringify(rawData['props'] ?? {}),
  };
}
