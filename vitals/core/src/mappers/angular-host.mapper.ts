import type { AngularHostElementData } from '@synergos/contracts';
import type { AngularHostInputs } from '../models/angular-host-inputs.model';

export function mapAngularHostData(data: AngularHostElementData): AngularHostInputs {
  const rawData = data as Record<string, unknown>;
  const mountParams = Array.isArray(data.mount?.params)
    ? Object.fromEntries(
        data.mount.params
          .filter((param) => typeof param?.key === 'string' && param.key.trim().length > 0)
          .map((param) => [param.key!.trim(), param.value ?? '']),
      )
    : {};
  const component = typeof rawData['component'] === 'string'
    ? rawData['component']
    : data.mount?.elementAlias ?? '';
  const endpoint = typeof rawData['endpoint'] === 'string'
    ? rawData['endpoint']
    : data.async?.apiEndpoint ?? '';

  return {
    component: component || (typeof rawData['tagName'] === 'string' ? rawData['tagName'] : ''),
    endpoint,
    params: JSON.stringify(
      rawData['params'] && typeof rawData['params'] === 'object'
        ? rawData['params']
        : mountParams,
    ),
    scriptSrc: typeof rawData['scriptSrc'] === 'string' ? rawData['scriptSrc'] : '',
    tagName: typeof rawData['tagName'] === 'string' ? rawData['tagName'] : '',
    props: JSON.stringify(rawData['props'] ?? {}),
    textContent: typeof rawData['textContent'] === 'string' ? rawData['textContent'] : '',
  };
}
