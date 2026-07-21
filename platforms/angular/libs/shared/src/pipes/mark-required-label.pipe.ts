import { Pipe, PipeTransform } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';

@Pipe({
  name: 'markRequiredLabel',
  standalone: true,
  pure: false,
})
export class MarkRequiredLabelPipe implements PipeTransform {
  transform(formGroup: FormGroup, controlName: string, label = ''): string {
    const control = formGroup.get(controlName);
    return control && this.isRequired(control) ? `${label}*` : label;
  }

  private isRequired(control: AbstractControl): boolean {
    const validationResult = control.validator?.({} as AbstractControl);
    return !!validationResult?.['required'];
  }
}
