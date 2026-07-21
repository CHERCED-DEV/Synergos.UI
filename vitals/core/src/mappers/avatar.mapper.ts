import type { BaseElementData, ContentMedia } from '@synergos/contracts';
import type { AvatarInputs } from '../models/avatar-inputs.model';

interface AvatarElementData extends BaseElementData {
  media?: ContentMedia;
  name?: string;
  status?: string;
}

export function mapAvatarData(data: AvatarElementData): AvatarInputs {
  return {
    src: data.media?.media?.src ?? '',
    alt: data.media?.media?.alt ?? data.media?.altText ?? '',
    name: data.name ?? '',
    size: 'md',
    shape: 'circle',
    status: data.status ?? '',
    theme: data.domVariant?.theme ?? 'light',
  };
}
