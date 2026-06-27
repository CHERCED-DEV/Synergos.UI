import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StepperElementComponent, type StepperChangeDetail, normalizeSteps } from './stepper';

const STEPS = JSON.stringify([
  { id: 'cart', title: 'Carrito', description: 'Revisa tus productos' },
  { id: 'shipping', title: 'Envío' },
  { title: 'Pago' },
  { title: '' }, // sin título — se descarta
  'Confirmación', // string suelto — válido
]);

describe('StepperElementComponent', () => {
  let fixture: ComponentFixture<StepperElementComponent>;
  let component: StepperElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StepperElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(StepperElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render nothing when no steps are supplied (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasSteps()).toBe(false);
    expect(component.stepCount()).toBe(0);
    expect(component.resolvedSteps().length).toBe(0);
    expect(component.progressLabel()).toBe('');
  });

  it('should render steps and derive done/active/pending from currentStep (render/config case)', async () => {
    fixture.componentRef.setInput('steps', STEPS);
    fixture.componentRef.setInput('currentStep', '1');
    fixture.detectChanges();
    await fixture.whenStable();

    // 4 valid steps survive normalization (the empty-title entry is dropped).
    expect(component.stepCount()).toBe(4);
    expect(component.activeIndex()).toBe(1);
    expect(component.progressLabel()).toBe('Paso 2 de 4');

    const statuses = component.resolvedSteps().map((step) => step.status);
    expect(statuses).toEqual(['done', 'active', 'pending', 'pending']);
    expect(component.resolvedSteps()[0].displayNumber).toBe(1);
    expect(component.resolvedSteps()[3].last).toBe(true);
  });

  it('should advance to a reachable step and emit stepchange (interaction case)', async () => {
    fixture.componentRef.setInput('steps', STEPS);
    fixture.componentRef.setInput('currentStep', '2');
    fixture.componentRef.setInput('linear', true);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: StepperChangeDetail | undefined;
    component.stepchange.subscribe((detail) => (emitted = detail));

    const steps = component.resolvedSteps();
    // Linear: a future/pending step is not reachable, no emit.
    expect(component.isReachable(steps[3])).toBe(false);
    component.goToStep(steps[3]);
    expect(emitted).toBeUndefined();
    expect(component.activeIndex()).toBe(2);

    // A completed step is reachable: jumping back emits and moves active.
    expect(component.isReachable(steps[0])).toBe(true);
    component.goToStep(steps[0]);
    expect(emitted).toEqual({ index: 0, id: 'cart' });
    expect(component.activeIndex()).toBe(0);
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"orientation":"horizontal","linear":true}');
    fixture.componentRef.setInput('orientation', 'vertical');
    fixture.componentRef.setInput('linear', false);
    fixture.componentRef.setInput('steps', STEPS);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.orientation()).toBe('vertical');
    expect(component.linear()).toBe(false);

    // Non-linear: every step is reachable regardless of position.
    expect(component.resolvedSteps().every((step) => component.isReachable(step))).toBe(true);

    // Re-applying the same inputs yields the same resolved state (idempotent).
    const before = component.resolvedSteps().map((step) => step.status);
    fixture.componentRef.setInput('orientation', 'vertical');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.resolvedSteps().map((step) => step.status)).toEqual(before);
  });
});

describe('stepper pure helpers', () => {
  it('normalizeSteps drops untitled entries and accepts plain strings', () => {
    const steps = normalizeSteps([
      { id: 'a', title: 'Uno' },
      { title: '' },
      'Dos',
      42,
    ]);
    expect(steps.length).toBe(2);
    expect(steps[0].title).toBe('Uno');
    expect(steps[1].title).toBe('Dos');
  });

  it('normalizeSteps returns empty for non-array input', () => {
    expect(normalizeSteps(undefined).length).toBe(0);
    expect(normalizeSteps('nope').length).toBe(0);
  });
});
