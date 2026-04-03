import type { ScriptEmbedElementData } from '@synergos/contracts';
import type { ScriptEmbedInputs } from '../models/script-embed-inputs.model';

export function mapScriptEmbedData(data: ScriptEmbedElementData): ScriptEmbedInputs {
  return {
    scriptType: data.script?.scriptType ?? 'text/javascript',
    content: data.script?.scriptContent ?? '',
    src: '',
    type: '',
    inlineScript: '',
    target: 'body',
    async: 'false',
    defer: 'true',
  };
}
