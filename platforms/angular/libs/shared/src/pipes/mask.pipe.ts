import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'mask',
  standalone: true,
})
export class MaskPipe implements PipeTransform {
  transform(value: string | null | undefined, mask: string | null | undefined): string {
    if (!value || !mask) {
      return '';
    }

    const usesHashTokens = mask.includes('#');
    let result = '';
    let valueIndex = 0;

    for (let index = 0; index < mask.length; index += 1) {
      const maskCharacter = mask.charAt(index);
      const isToken = usesHashTokens ? maskCharacter === '#' : /^[a-z0-9]$/i.test(maskCharacter);

      if (!isToken) {
        result += maskCharacter;
        continue;
      }

      const valueCharacter = value.charAt(valueIndex);
      if (!valueCharacter) {
        break;
      }

      result += valueCharacter;
      valueIndex += 1;
    }

    return result;
  }
}
