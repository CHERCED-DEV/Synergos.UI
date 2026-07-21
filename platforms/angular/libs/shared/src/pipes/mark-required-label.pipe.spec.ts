import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MarkRequiredLabelPipe } from './mark-required-label.pipe';

describe(MarkRequiredLabelPipe.name, () => {
  it('adds an asterisk when the control is required', () => {
    const formGroup = new FormGroup({
      email: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    });

    expect(new MarkRequiredLabelPipe().transform(formGroup, 'email', 'Email')).toBe('Email*');
  });
});
