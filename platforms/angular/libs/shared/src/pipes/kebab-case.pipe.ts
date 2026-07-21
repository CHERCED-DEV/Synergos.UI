import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'kebabCase',
  standalone: true,
})
export class KebabCasePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }
}
