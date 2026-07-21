import type { LogoItemElementData } from '@synergos/contracts';
import type { LogoItemInputs } from '../models/logo-item-inputs.model';

export function mapLogoItemData(data: LogoItemElementData): LogoItemInputs {
  return {
    src: data.media?.media?.src ?? '',
    alt: data.media?.altText ?? data.media?.media?.alt ?? '',
    href: data.navigation?.navigateTo ?? '',
    label: data.media?.mediaTitle ?? '',
    target: '_self',
  };
}
