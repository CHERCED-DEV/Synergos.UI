import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TOUR_GUIDE_SYNHOST } from '@synergos/contracts';
import {
  TourGuideElementComponent,
  type TourLifecycleDetail,
  type TourStepDetail,
  normalizeSteps,
} from './tour-guide';

const STEPS = JSON.stringify([
  { target: '#a', title: 'Bienvenido', body: 'Te mostramos lo básico.' },
  { target: '#b', title: 'Agenda', body: 'Aquí están tus eventos.', placement: 'top' },
  { title: 'Listo', body: 'Eso es todo.' },
  { placement: 'left' }, // dropped — no title and no body
]);

describe('TourGuideElementComponent', () => {
  let fixture: ComponentFixture<TourGuideElementComponent>;
  let component: TourGuideElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TourGuideElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TourGuideElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and stay inactive with no steps (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasSteps()).toBe(false);
    expect(component.total()).toBe(0);
    expect(component.isActive()).toBe(false);
    expect(component.currentStep()).toBeNull();
    // start() is a no-op without steps.
    component.start();
    expect(component.isActive()).toBe(false);
  });

  it('should normalize steps from config and resolve labels (render/config case)', async () => {
    fixture.componentRef.setInput('steps', STEPS);
    fixture.componentRef.setInput('nextLabel', 'Continuar');
    fixture.detectChanges();
    await fixture.whenStable();

    // 3 valid steps survive (the 4th has neither title nor body).
    expect(component.total()).toBe(3);
    expect(component.hasSteps()).toBe(true);
    expect(component.steps()[0].title).toBe('Bienvenido');
    expect(component.steps()[1].placement).toBe('top');
    expect(component.nextLabel()).toBe('Continuar');
    expect(component.skipLabel()).toBe('Saltar');
  });

  // D1: con `stepsJson` —el TEXTO que mandaba la vista— el recorrido no tenía pasos. Éste
  // alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('recorre los pasos que autoró el editor con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = TOUR_GUIDE_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.autoStart()).toBe(ejemplo.autoStart);
    expect(component.steps().map((p) => p.target)).toEqual(ejemplo.steps?.map((p) => p.target));
    expect(component.steps().map((p) => p.title)).toEqual(ejemplo.steps?.map((p) => p.title));
    expect(component.steps().map((p) => p.body)).toEqual(ejemplo.steps?.map((p) => p.body));
  });

  it('should advance, emit tourstep, and complete on the last step (interaction case)', async () => {
    fixture.componentRef.setInput('steps', STEPS);
    fixture.detectChanges();
    await fixture.whenStable();

    const steps: TourStepDetail[] = [];
    let completed: TourLifecycleDetail | undefined;
    component.tourstep.subscribe((detail) => steps.push(detail));
    component.tourcomplete.subscribe((detail) => (completed = detail));

    component.start();
    expect(component.isActive()).toBe(true);
    expect(component.activeIndex()).toBe(0);
    expect(component.isFirst()).toBe(true);

    component.next();
    expect(component.activeIndex()).toBe(1);

    component.previous();
    expect(component.activeIndex()).toBe(0);

    component.next();
    component.next();
    expect(component.isLast()).toBe(true);

    // next() on the last step completes the tour.
    component.next();
    expect(component.isActive()).toBe(false);
    expect(completed?.total).toBe(3);
    expect(steps[0].index).toBe(0);
    expect(steps.some((detail) => detail.step.title === 'Bienvenido')).toBe(true);
  });

  // El `config` trae lo que el editor autora (ADR 0135); los rótulos de los botones no los autora
  // nadie en el CMS, así que son atributos.
  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"steps":[{"title":"Hola","body":"X"}]}');
    fixture.componentRef.setInput('skipLabel', 'Cerrar');
    fixture.componentRef.setInput('nextLabel', 'Avanzar');
    fixture.detectChanges();
    await fixture.whenStable();

    // Labels come from attributes; the steps from the config.
    expect(component.skipLabel()).toBe('Cerrar');
    expect(component.nextLabel()).toBe('Avanzar');
    expect(component.total()).toBe(1);

    // skip() from the first step is idempotent — a second call does nothing.
    let skips = 0;
    component.tourskip.subscribe(() => (skips += 1));
    component.start();
    component.skip();
    component.skip();
    expect(skips).toBe(1);
    expect(component.isActive()).toBe(false);
  });

  // ADR 0136 (CMS#191): los rótulos salen de `Common.Actions` y `TourGuide` que publica la página.
  describe('microcopia del diccionario', () => {
    afterEach(() => {
      delete (window as { synergos?: unknown }).synergos;
    });

    it('sin bridge pinta el respaldo es-CO', async () => {
      fixture.componentRef.setInput('config', JSON.stringify(TOUR_GUIDE_SYNHOST.ejemplo));
      fixture.detectChanges();
      await fixture.whenStable();
      component.start();
      fixture.detectChanges();

      const botones = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.tour__footer button'));
      expect(botones.map((b) => b.textContent?.trim())).toEqual(['Saltar', 'Anterior', 'Siguiente']);
      component.next();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.tour__btn--primary')?.textContent?.trim()).toBe('Finalizar');
      component.skip();
    });

    it('con el bridge pinta las claves que publicó la página; lo que no publica sale por su respaldo', async () => {
      (window as { synergos?: unknown }).synergos = {
        i18n: {
          culture: 'en-US',
          defaultCulture: 'es-CO',
          keys: { 'Common.Actions.Next': 'Next', 'Common.Actions.Previous': 'Previous', 'TourGuide.Skip': 'Skip' },
        },
      };
      const otra = TestBed.createComponent(TourGuideElementComponent);
      otra.componentRef.setInput('config', JSON.stringify(TOUR_GUIDE_SYNHOST.ejemplo));
      otra.detectChanges();
      await otra.whenStable();
      otra.componentInstance.start();
      otra.detectChanges();

      const botones = Array.from((otra.nativeElement as HTMLElement).querySelectorAll('.tour__footer button'));
      expect(botones.map((b) => b.textContent?.trim())).toEqual(['Skip', 'Previous', 'Next']);
      expect(otra.componentInstance.doneLabel()).toBe('Finalizar');
      otra.componentInstance.skip();
    });
  });
});

describe('tour-guide pure helpers', () => {
  it('normalizeSteps drops entries without a title or body and assigns ids', () => {
    const steps = normalizeSteps([
      { title: 'Ok', body: 'cuerpo' },
      { target: '#x' },
      'no-objeto',
      { body: 'solo cuerpo', target: '#y' },
    ]);
    expect(steps.length).toBe(2);
    expect(steps[0].id).toBe('step-0');
    expect(steps[1].target).toBe('#y');
  });

  it('normalizeSteps defaults unknown placement to auto', () => {
    const steps = normalizeSteps([{ title: 'A', placement: 'diagonal' }]);
    expect(steps[0].placement).toBe('auto');
  });
});
