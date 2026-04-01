import type { ScriptEmbedElementData } from '@synergos/contracts';
import type { ScriptEmbedInputs } from '../models/script-embed-inputs.model';

export function mapScriptEmbedData(data: ScriptEmbedElementData): ScriptEmbedInputs {
  return {
    src: data.embed?.embedUrl ?? '',
    type: data.embed?.embedType ?? 'text/javascript',
    inlineScript: '',
    target: 'body',
    async: 'false',
    defer: 'true',
  };
}
