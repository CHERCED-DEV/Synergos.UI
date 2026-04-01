import { TestBed } from '@angular/core/testing';
import { ConfigurableFormComponent } from './configurable-form';

describe(ConfigurableFormComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfigurableFormComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(ConfigurableFormComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('submits invalid state for missing required values', () => {
    const fixture = TestBed.createComponent(ConfigurableFormComponent);
    let submitEvent = { valid: true, errors: [] as readonly { field: string; message: string }[] };

    fixture.componentInstance.submitted.subscribe((event) => {
      submitEvent = event;
    });

    fixture.componentRef.setInput('sections', [
      {
        title: 'Contact',
        fields: [
          {
            key: 'email',
            type: 'email',
            label: 'Email',
            required: true,
          },
        ],
      },
    ]);
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(submitEvent.valid).toBe(false);
    expect(submitEvent.errors[0]?.field).toBe('email');
  });

  it('submits valid values after the user fills the form', () => {
    const fixture = TestBed.createComponent(ConfigurableFormComponent);
    let submitEvent = { valid: false, values: {} as Record<string, string | boolean> };

    fixture.componentInstance.submitted.subscribe((event) => {
      submitEvent = event;
    });

    fixture.componentRef.setInput('sections', [
      {
        fields: [
          {
            key: 'email',
            type: 'email',
            label: 'Email',
            required: true,
          },
        ],
      },
    ]);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'jane@example.com';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(submitEvent.valid).toBe(true);
    expect(submitEvent.values['email']).toBe('jane@example.com');
  });
});
