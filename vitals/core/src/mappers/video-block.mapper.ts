import type { VideoElementData } from '@synergos/contracts';
import type { VideoBlockInputs } from '../models/video-block-inputs.model';

export function mapVideoBlockData(data: VideoElementData): VideoBlockInputs {
  return {
    src: data.media?.media?.src ?? '',
    title: data.media?.mediaTitle ?? data.media?.altText ?? '',
    poster: '',
    controls: 'true',
    autoplay: 'false',
    muted: 'false',
    loop: 'false',
  };
}
