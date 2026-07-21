import { TestBed } from '@angular/core/testing';
import { FocusManagerService } from './focus-manager.service';
import { FormFocusService } from './form-focus.service';

describe(FormFocusService.name, () => {
  let service: FormFocusService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FocusManagerService, FormFocusService],
    });

    service = TestBed.inject(FormFocusService);
  });

  it('focuses the first invalid field in a container', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <input id="first" aria-invalid="true" />
      <input id="second" />
    `;
    document.body.appendChild(form);

    const focusedField = service.focusFirstInvalid(form);

    expect(focusedField?.id).toBe('first');
    expect(document.activeElement).toBe(focusedField);

    form.remove();
  });

  it('walks containers in dom order when searching for invalid fields', () => {
    const secondForm = document.createElement('form');
    secondForm.innerHTML = '<input id="second-form" aria-invalid="true" />';
    const firstForm = document.createElement('form');
    firstForm.innerHTML = '<input id="first-form" aria-invalid="true" />';

    document.body.appendChild(firstForm);
    document.body.appendChild(secondForm);

    const focusedField = service.focusFirstInvalidIn([secondForm, firstForm]);

    expect(focusedField?.id).toBe('first-form');

    firstForm.remove();
    secondForm.remove();
  });
});
