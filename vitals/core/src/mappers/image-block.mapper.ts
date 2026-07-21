import type { ImageElementData } from '@synergos/contracts';
import type { ImageBlockInputs } from '../models/image-block-inputs.model';

export function mapImageBlockData(data: ImageElementData): ImageBlockInputs {
  return {
    src: data.media?.media?.src ?? '',
    alt: data.media?.media?.alt ?? data.media?.altText ?? '',
    caption: data.media?.mediaDescription ?? '',
    aspectRatio: 'auto',
    loading: 'lazy',
  };
}
