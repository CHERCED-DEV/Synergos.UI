import type { InsightExplorerElementData } from '@synergos/contracts';
import type { InsightExplorerInputs } from '../models/insight-explorer-inputs.model';

export function mapInsightExplorerData(data: InsightExplorerElementData): InsightExplorerInputs {
  return {
    title: data.text?.title ?? '',
    theme: data.domVariant?.theme ?? 'light',
    variant: data.domVariant?.variant ?? 'default',
    elementId: data.domAttributes?.elementId ?? '',
    items: data.collection ? JSON.stringify(data.collection) : '',
  };
}
