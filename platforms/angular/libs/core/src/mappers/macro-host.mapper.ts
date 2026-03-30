import type { MacroHostElementData } from '../contracts/elements.contract';
import type { MacroHostInputs } from '../models/macro-host-inputs.model';

export function mapMacroHostData(data: MacroHostElementData): MacroHostInputs {
  return {
    contentType: data.contentType ?? '',
    contentData: data.contentData ? JSON.stringify(data.contentData) : '',
  };
}
