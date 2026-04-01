import type { IframeEmbedElementData } from '@synergos/contracts';
import type { IframeEmbedInputs } from '../models/iframe-embed-inputs.model';

export function mapIframeEmbedData(data: IframeEmbedElementData): IframeEmbedInputs {
  return {
    src: data.embed?.embedUrl ?? '',
    title: data.embed?.embedTitle ?? '',
    loading: 'lazy',
    allowFullscreen: 'true',
    height: '480',
  };
}
