import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('should let direct inputs override config (interaction / precedence case)', async () => {
    fixture.componentRef.setInput('config', '{"title":"Config título","emptyLabel":"Vacío config"}');
    fixture.componentRef.setInput('title', 'Título directo');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Título directo');
    // Unset input falls back to config value.
    expect(component.emptyLabel()).toBe('Vacío config');
    expect(component.hasTitle()).toBe(true);
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
});
