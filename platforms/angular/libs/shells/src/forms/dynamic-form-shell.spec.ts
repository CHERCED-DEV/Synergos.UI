import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DynamicFormShellComponent,
  type DynamicFormChange,
  type DynamicFormConfig,
  type DynamicFormSubmit,
  type FormSchema,
} from './dynamic-form-shell';

const SCHEMA: FormSchema = {
  title: 'Solicitud',
  sections: [
    {
      id: 'datos',
      title: 'Sus datos',
      fields: [
        { id: 'nombre', label: 'Nombre completo', type: 'text', required: true },
        { id: 'edad', label: 'Edad', type: 'number', required: false },
      ],
    },
    {
      id: 'contacto',
      title: 'Contacto',
      fields: [
        { id: 'correo', label: 'Correo', type: 'email', required: true, pattern: '.+@.+\\..+' },
        {
          id: 'ciudad',
          label: 'Ciudad',
          type: 'select',
          required: true,
          options: [
            { value: 'bog', label: 'Bogotá' },
            { value: 'med', label: 'Medellín' },
          ],
        },
      ],
    },
  ],
};

@Component({
  standalone: true,
  imports: [DynamicFormShellComponent],
  template: `
    <syn-dynamic-form
      [schema]="schema()"
      [config]="config()"
      [submitting]="submitting()"
      (formsubmit)="submitLog.push($event)"
      (answerchange)="changeLog.push($event)"
      (stepchange)="stepLog.push($event)"
    />
  `,
})
class HostComponent {
  readonly schema = signal<FormSchema>(SCHEMA);
  readonly config = signal<DynamicFormConfig>({});
  readonly submitting = signal(false);
  readonly submitLog: DynamicFormSubmit[] = [];
  readonly changeLog: DynamicFormChange[] = [];
  readonly stepLog: string[] = [];
}

describe(DynamicFormShellComponent.name, () => {
  async function createHost() {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function query(el: HTMLElement, selector: string): HTMLElement | null {
    return el.querySelector<HTMLElement>(selector);
  }

  function queryAll(el: HTMLElement, selector: string): HTMLElement[] {
    return Array.from(el.querySelectorAll<HTMLElement>(selector));
  }

  function setInput(el: HTMLElement, selector: string, value: string): void {
    const input = el.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
  }

  function clickButtonByText(el: HTMLElement, selector: string, text: string): void {
    const btn = queryAll(el, selector).find((b) => b.textContent?.includes(text));
    btn?.click();
  }

  afterEach(() => TestBed.resetTestingModule());

  // ── empty: renders task-list + first section, no errors shown yet ─────────────
  it('renders the task-list and the first section pristine (empty case)', async () => {
    const fixture = await createHost();
    const element: HTMLElement = fixture.nativeElement;

    expect(query(element, '.syn-dform__title')?.textContent).toContain('Solicitud');
    // 2 sections + the review task.
    expect(queryAll(element, '.syn-dform__task').length).toBe(3);
    // First section is active with its two fields on screen.
    expect(query(element, '.syn-dform__section-title')?.textContent).toContain('Sus datos');
    expect(queryAll(element, '.syn-dform__field').length).toBe(2);
    // No error summary before the user tries to advance.
    expect(query(element, '.syn-dform__errors')).toBeNull();
    // Both sections start "not started".
    const tags = queryAll(element, '.syn-dform__tag');
    expect(tags[0].textContent).toContain('No iniciada');
  });

  // ── happy: fill every section → check-answers → submit emits answers ──────────
  it('walks the sections, reaches check-answers and submits the answers (happy case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    const element: HTMLElement = fixture.nativeElement;

    setInput(element, '#' + inputId(element, 'nombre'), 'Ada Lovelace');
    fixture.detectChanges();
    expect(host.changeLog.at(-1)?.fieldId).toBe('nombre');
    clickButtonByText(element, '.syn-dform__btn--primary', 'Continuar');
    fixture.detectChanges();

    // Second section now active.
    expect(query(element, '.syn-dform__section-title')?.textContent).toContain('Contacto');
    setInput(element, '#' + inputId(element, 'correo'), 'ada@example.com');
    setInput(element, '#' + inputId(element, 'ciudad'), 'bog');
    fixture.detectChanges();
    clickButtonByText(element, '.syn-dform__btn--primary', 'Continuar');
    fixture.detectChanges();

    // Check-answers page: option label shown, not the raw value.
    expect(query(element, '.syn-dform__review')).not.toBeNull();
    expect(element.textContent).toContain('Bogotá');
    expect(host.stepLog).toContain('review');

    clickButtonByText(element, '.syn-dform__btn--primary', 'Enviar');
    fixture.detectChanges();
    expect(host.submitLog).toHaveLength(1);
    expect(host.submitLog[0].answers['nombre']).toBe('Ada Lovelace');
    expect(host.submitLog[0].answers['correo']).toBe('ada@example.com');
    expect(host.submitLog[0].answers['ciudad']).toBe('bog');
  });

  // ── filter/validation: required + pattern surface in the error summary ────────
  it('blocks advance and lists field errors in the accessible summary (validation case)', async () => {
    const fixture = await createHost();
    const element: HTMLElement = fixture.nativeElement;

    // Advance with an empty required field → error summary appears, stays on section.
    clickButtonByText(element, '.syn-dform__btn--primary', 'Continuar');
    fixture.detectChanges();
    const summary = query(element, '.syn-dform__errors');
    expect(summary).not.toBeNull();
    expect(summary?.getAttribute('role')).toBe('alert');
    expect(query(element, '.syn-dform__errors-link')?.getAttribute('href')).toContain(
      inputId(element, 'nombre'),
    );
    // Field wired to its error via aria.
    const nombre = query(element, '#' + inputId(element, 'nombre'))!;
    expect(nombre.getAttribute('aria-invalid')).toBe('true');
    expect(nombre.getAttribute('aria-describedby')).toContain('-error');

    // Fill nombre → advance → second section → bad email pattern is caught.
    setInput(element, '#' + inputId(element, 'nombre'), 'Ada');
    fixture.detectChanges();
    clickButtonByText(element, '.syn-dform__btn--primary', 'Continuar');
    fixture.detectChanges();
    setInput(element, '#' + inputId(element, 'correo'), 'not-an-email');
    setInput(element, '#' + inputId(element, 'ciudad'), 'med');
    fixture.detectChanges();
    clickButtonByText(element, '.syn-dform__btn--primary', 'Continuar');
    fixture.detectChanges();
    // Still on the contacto section: pattern error blocked the review.
    expect(query(element, '.syn-dform__review')).toBeNull();
    expect(query(element, '.syn-dform__errors')?.textContent).toContain('formato');
  });

  // ── idempotent: re-submitting an incomplete form emits nothing repeatedly ─────
  it('never emits submit until every section is valid (idempotent case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    const element: HTMLElement = fixture.nativeElement;

    // Jump straight to review (disabled until complete) — clicking does nothing.
    const reviewTask = queryAll(element, '.syn-dform__task-btn').at(-1) as HTMLButtonElement;
    expect(reviewTask.disabled).toBe(true);
    reviewTask.click();
    fixture.detectChanges();
    expect(query(element, '.syn-dform__review')).toBeNull();
    expect(host.submitLog).toHaveLength(0);

    // Re-clicking Continuar on an invalid section stays a no-op (no submit).
    clickButtonByText(element, '.syn-dform__btn--primary', 'Continuar');
    clickButtonByText(element, '.syn-dform__btn--primary', 'Continuar');
    fixture.detectChanges();
    expect(host.submitLog).toHaveLength(0);
  });
});

/** Resolve the instance-prefixed control id of a field from the rendered label's `for`. */
function inputId(el: HTMLElement, fieldId: string): string {
  const control = Array.from(el.querySelectorAll<HTMLElement>('[id]')).find((node) =>
    node.id.endsWith(`-${fieldId}`),
  );
  return control?.id ?? fieldId;
}
