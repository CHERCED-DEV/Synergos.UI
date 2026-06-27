import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  CalendarElementComponent,
  type CalendarDateSelectDetail,
  normalizeEvents,
  normalizeIsoDate,
  parseMonthAnchor,
} from './calendar';

const EVENTS = JSON.stringify([
  { date: '2026-06-10', title: 'Demo day' },
  { date: '2026-06-10', title: 'After party', href: 'https://example.com' },
  { date: '2026-06-22', title: 'Reservar sala' },
  { date: 'no-es-fecha', title: 'Inválido — descartado' },
  { date: '2026-06-15' },
]);

describe('CalendarElementComponent', () => {
  let fixture: ComponentFixture<CalendarElementComponent>;
  let component: CalendarElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render a 6×7 grid with no events (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasEvents()).toBe(false);
    expect(component.weeks().length).toBe(6);
    expect(component.weeks().every((week) => week.length === 7)).toBe(true);
    expect(component.weekdayLabels().length).toBe(7);
  });

  it('should mark days carrying events from config and anchor to initialMonth (render/config case)', async () => {
    fixture.componentRef.setInput('initialMonth', '2026-06');
    fixture.componentRef.setInput('events', EVENTS);
    fixture.detectChanges();
    await fixture.whenStable();

    // 3 valid events survive normalization (2 on the 10th, 1 on the 22nd; the
    // 15th has no title, the bad date is dropped).
    expect(component.allEvents().length).toBe(3);
    expect(component.hasEvents()).toBe(true);

    const tenth = component.flatDays().find((day) => day.iso === '2026-06-10');
    expect(tenth?.events.length).toBe(2);
    expect(component.monthLabel().toLowerCase()).toContain('junio');
  });

  it('should select a day and emit dateselect with that day\'s events (interaction case)', async () => {
    fixture.componentRef.setInput('initialMonth', '2026-06');
    fixture.componentRef.setInput('events', EVENTS);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: CalendarDateSelectDetail | undefined;
    component.dateselect.subscribe((detail) => (emitted = detail));

    const tenth = component.flatDays().find((day) => day.iso === '2026-06-10');
    expect(tenth).toBeDefined();
    component.selectDay(tenth!);

    expect(component.selectedDate()).toBe('2026-06-10');
    expect(component.isSelected(tenth!)).toBe(true);
    expect(emitted?.date).toBe('2026-06-10');
    expect(emitted?.events.length).toBe(2);
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"locale":"en-US","initialMonth":"2026-06"}');
    fixture.componentRef.setInput('locale', 'es-CO');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.locale()).toBe('es-CO');
  });

  it('should navigate months without losing the grid shape', async () => {
    fixture.componentRef.setInput('initialMonth', '2026-06');
    fixture.detectChanges();
    await fixture.whenStable();

    const june = component.monthLabel();
    component.nextMonth();
    fixture.detectChanges();
    expect(component.monthLabel()).not.toBe(june);
    expect(component.monthLabel().toLowerCase()).toContain('julio');

    component.previousMonth();
    component.previousMonth();
    fixture.detectChanges();
    expect(component.monthLabel().toLowerCase()).toContain('mayo');
    expect(component.weeks().length).toBe(6);
  });
});

describe('calendar pure helpers', () => {
  it('normalizeIsoDate keeps valid ISO and parses other date strings', () => {
    expect(normalizeIsoDate('2026-06-10')).toBe('2026-06-10');
    expect(normalizeIsoDate('basura')).toBe('');
    expect(normalizeIsoDate(undefined)).toBe('');
  });

  it('normalizeEvents drops entries without a date or title', () => {
    const events = normalizeEvents([
      { date: '2026-06-10', title: 'Ok' },
      { date: '2026-06-10' },
      { title: 'Sin fecha' },
      'no-objeto',
    ]);
    expect(events.length).toBe(1);
    expect(events[0].title).toBe('Ok');
  });

  it('parseMonthAnchor returns the first of the requested month', () => {
    const anchor = parseMonthAnchor('2026-06');
    expect(anchor.getFullYear()).toBe(2026);
    expect(anchor.getMonth()).toBe(5);
    expect(anchor.getDate()).toBe(1);
  });
});
