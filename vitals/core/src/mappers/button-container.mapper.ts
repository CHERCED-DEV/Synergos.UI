import type { ButtonElementData } from '@synergos/contracts';
import type { ButtonContainerInputs } from '../models/button-container-inputs.model';

export function mapButtonContainerData(data: ButtonElementData): ButtonContainerInputs {
  return {
    label: data.cta?.ctaLabel ?? '',
    variant: data.domVariant?.variant ?? 'solid',
    size: 'md',
    href: data.cta?.ctaLink?.url ?? '',
    target: data.cta?.ctaLink?.target ?? '_self',
    // `loading` es estado de RUNTIME, no contenido editorial: ButtonElementData
    // sólo trae `cta`, así que no hay de dónde mapearlo. Se emite apagado, igual
    // que `disabled`, y la app lo enciende cuando corresponde.
    loading: 'false',
    loadingLabel: '',
    disabled: 'false',
  };
}
