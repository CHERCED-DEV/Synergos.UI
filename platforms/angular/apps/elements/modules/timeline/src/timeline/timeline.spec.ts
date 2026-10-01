import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TIMELINE_SYNHOST } from '@synergos/contracts';
import { TimelineElementComponent } from './timeline';

const EVENTS = JSON.stringify([
  { date: '2023-01-15', title: 'Fundación', body: 'Arranca el proyecto.' },
  { date: 'Q3 2024', title: 'Primer hito', body: 'Lanzamiento beta.' },
  { date: '2025-06-01', title: 'Escala', body: 'Expansión regional.' },
]);

describe('TimelineElementComponent', () => {
  let fixture: ComponentFixture<TimelineElementComponent>;
  let component: TimelineElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimelineElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TimelineElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and resolve to no items (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.items()).toEqual([]);
    expect(component.hasItems()).toBe(false);
  });

  it('should render normalized items and format ISO dates (render + config case)', async () => {
    fixture.componentRef.setInput('eventsJson', EVENTS);
    fixture.detectChanges();
    await fixture.whenStable();

    const items = component.items();
    expect(items.length).toBe(3);
    expect(items[0].title).toBe('Fundación');
    // ISO date gets a machine datetime + localized label.
    expect(items[0].dateTime).toBe('2023-01-15');
    expect(items[0].dateLabel).not.toBe('2023-01-15');
    expect(items[0].dateLabel.length).toBeGreaterThan(0);
    // Free-form date passes through verbatim with no datetime attribute.
    expect(items[1].dateTime).toBeNull();
    expect(items[1].dateLabel).toBe('Q3 2024');

    const headings = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.timeline__heading',
    );
    expect(headings.length).toBe(3);
  });

  // El `config` trae lo que el editor autora (ADR 0135); el título de la sección y el texto de
  // «sin hitos» no los autora nadie en el CMS, así que son atributos.
  it('should let direct inputs override config (interaction / precedence case)', async () => {
    fixture.componentRef.setInput('config', JSON.stringify({ events: [{ title: 'Del config' }] }));
    fixture.componentRef.setInput('eventsJson', EVENTS);
    fixture.componentRef.setInput('title', 'Título directo');
    fixture.componentRef.setInput('emptyLabel', 'Vacío');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Título directo');
    expect(component.emptyLabel()).toBe('Vacío');
    expect(component.hasTitle()).toBe(true);
    // The eventsJson attribute wins over the config list.
    expect(component.items().length).toBe(3);
  });

  // D1: con `eventsJson` —el TEXTO que mandaba la vista— la línea de tiempo salía sin hitos. Éste
  // alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('pinta los hitos que autoró el editor con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = TIMELINE_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.items().map((i) => i.title)).toEqual(ejemplo.events?.map((e) => e.title));
    expect(component.items().map((i) => i.body)).toEqual(ejemplo.events?.map((e) => e.body));
    expect(component.items().map((i) => i.date)).toEqual(ejemplo.events?.map((e) => e.date));
    const cuerpos = (fixture.nativeElement as HTMLElement).querySelectorAll('.timeline__body');
    expect(cuerpos.length).toBe(ejemplo.events?.length);
  });

  it('should produce identical output for identical inputs (idempotent case)', async () => {
    fixture.componentRef.setInput('eventsJson', EVENTS);
    fixture.detectChanges();
    await fixture.whenStable();
    const first = component.items();

    // Re-applying the same input yields an equivalent, stable result.
    fixture.componentRef.setInput('eventsJson', EVENTS);
    fixture.detectChanges();
    await fixture.whenStable();
    const second = component.items();

    expect(second).toEqual(first);
    expect(second.map((item) => item.id)).toEqual([
      'timeline-item-0',
      'timeline-item-1',
      'timeline-item-2',
    ]);
  });

  // ADR 0136 (CMS#191): la microcopia sale de la sección `Timeline` que publica la página.
  describe('microcopia del diccionario', () => {
    afterEach(() => {
      delete (window as { synergos?: unknown }).synergos;
    });

    it('sin bridge pinta el respaldo es-CO', async () => {
      fixture.componentRef.setInput('config', JSON.stringify(TIMELINE_SYNHOST.ejemplo));
      fixture.detectChanges();
      await fixture.whenStable();

      const raiz = fixture.nativeElement as HTMLElement;
      expect(raiz.querySelector('.timeline')?.getAttribute('aria-label')).toBe('Línea de tiempo');
      expect(component.emptyLabel()).toBe('No hay hitos para mostrar.');
    });

    it('con el bridge pinta las claves que publicó la página; lo que no publica sale por su respaldo', async () => {
      (window as { synergos?: unknown }).synergos = {
        i18n: { culture: 'en-US', defaultCulture: 'es-CO', keys: { 'Timeline.Empty': 'No milestones to show.' } },
      };
      const otra = TestBed.createComponent(TimelineElementComponent);
      otra.detectChanges();
      await otra.whenStable();

      const raiz = otra.nativeElement as HTMLElement;
      expect(raiz.querySelector('.timeline__empty')?.textContent?.trim()).toBe('No milestones to show.');
      expect(raiz.querySelector('.timeline')?.getAttribute('aria-label')).toBe('Línea de tiempo');
    });
  });
});
