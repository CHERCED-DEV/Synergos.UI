import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'removeHtmlTags',
  standalone: true,
})
export class RemoveHtmlTagsPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    return value.replace(/<[^>]*>/g, '');
  }
}
