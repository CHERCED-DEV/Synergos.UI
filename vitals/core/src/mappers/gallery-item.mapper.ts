import type { GalleryItemElementData } from '@synergos/contracts';
import type { GalleryItemInputs } from '../models/gallery-item-inputs.model';

export function mapGalleryItemData(data: GalleryItemElementData): GalleryItemInputs {
  return {
    src: data.media?.media?.src ?? '',
    alt: data.media?.altText ?? data.media?.media?.alt ?? '',
    caption: data.text?.caption ?? data.text?.body ?? '',
    aspectRatio: '4 / 3',
  };
}
