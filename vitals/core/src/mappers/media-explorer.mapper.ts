import type { MediaExplorerElementData } from '@synergos/contracts';
import type { MediaExplorerInputs } from '../models/media-explorer-inputs.model';

export function mapMediaExplorerData(data: MediaExplorerElementData): MediaExplorerInputs {
  return {
    title: data.text?.title ?? '',
    theme: data.domVariant?.theme ?? 'dark',
    variant: data.domVariant?.variant ?? 'default',
    elementId: data.domAttributes?.elementId ?? '',
    domClass: data.domClass?.cssClass ?? '',
    defaultCategory: '',
    items: data.collection ? JSON.stringify(data.collection) : '',
  };
}
