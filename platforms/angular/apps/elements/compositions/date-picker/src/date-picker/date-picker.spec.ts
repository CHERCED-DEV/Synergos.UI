import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DatePickerElementComponent,
  type DatePickerChangeDetail,
  nightsBetween,
  normalizeIsoDate,
  normalizeIsoList,
  parseMonthAnchor,
} from './date-picker';

describe('DatePickerElementComponent', () => {
  let fixture: ComponentFixture<DatePickerElementComponent>;
  let component: DatePickerElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatePickerElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(DatePickerElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render a 6×7 single-mode grid with no selection (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.mode()).toBe('single');
    expect(component.isRange()).toBe(false);
    expect(component.selectedDate()).toBeNull();
    expect(component.returnDate()).toBeNull();
    expect(component.weeks().length).toBe(6);
    expect(component.weeks().every((week) => week.length === 7)).toBe(true);
    expect(component.weekdayLabels().length).toBe(7);
  });

  it('should anchor to initialMonth and disable bounded / explicit days (render/config case)', async () => {
    fixture.componentRef.setInput('initialMonth', '2026-06');
    fixture.componentRef.setInput('minDate', '2026-06-05');
    fixture.componentRef.setInput('maxDate', '2026-06-25');
    fixture.componentRef.setInput('disabledDates', '["2026-06-15"]');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.monthLabel().toLowerCase()).toContain('junio');

    const before = component.flatDays().find((day) => day.iso === '2026-06-04');
    const within = component.flatDays().find((day) => day.iso === '2026-06-10');
    const blocked = component.flatDays().find((day) => day.iso === '2026-06-15');
    const after = component.flatDays().find((day) => day.iso === '2026-06-26');

    expect(before?.disabled).toBe(true); // below minDate
    expect(within?.disabled).toBe(false);
    expect(blocked?.disabled).toBe(true); // explicit disabledDates
    expect(after?.disabled).toBe(true); // above maxDate
  });

  it('should pick a valid check-in → check-out range honoring minStay (interaction case)', async () => {
    fixture.componentRef.setInput('mode', 'range');
    fixture.componentRef.setInput('initialMonth', '2026-06');
    fixture.componentRef.setInput('minStay', '2');
    fixture.detectChanges();
    await fixture.whenStable();

    const emissions: DatePickerChangeDetail[] = [];
    component.datechange.subscribe((detail) => emissions.push(detail));

    const checkIn = component.flatDays().find((day) => day.iso === '2026-06-10')!;
    component.selectDay(checkIn);
    expect(component.selectedDate()).toBe('2026-06-10');
    expect(component.returnDate()).toBeNull();

    // A return one night out violates minStay=2 → must be blocked, and selecting
    // it instead re-anchors the check-in (no invalid range survives).
    const tooClose = component.flatDays().find((day) => day.iso === '2026-06-11')!;
    expect(tooClose.disabled).toBe(true);
    component.selectDay(tooClose);
    expect(component.returnDate()).toBeNull();
    expect(component.selectedDate()).toBe('2026-06-11');

    // Re-pick a clean check-in then a valid check-out 4 nights later.
    component.selectDay(component.flatDays().find((day) => day.iso === '2026-06-10')!);
    const checkOut = component.flatDays().find((day) => day.iso === '2026-06-14')!;
    component.selectDay(checkOut);

    expect(component.selectedDate()).toBe('2026-06-10');
    expect(component.returnDate()).toBe('2026-06-14');
    expect(component.nights()).toBe(4);

    const last = emissions.at(-1)!;
    expect(last.mode).toBe('range');
    expect(last.date).toBe('2026-06-10');
    expect(last.returnDate).toBe('2026-06-14');
    expect(last.nights).toBe(4);
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"mode":"single","locale":"en-US","minStay":5}',
    );
    fixture.componentRef.setInput('locale', 'es-CO');
    fixture.componentRef.setInput('mode', 'range');
    fixture.componentRef.setInput('minStay', '3');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.locale()).toBe('es-CO');
    expect(component.mode()).toBe('range');
    expect(component.minStay()).toBe(3);

    // Re-applying the same inputs yields the same resolved state (idempotent).
    fixture.componentRef.setInput('minStay', '3');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.minStay()).toBe(3);
  });
});

describe('date-picker pure helpers', () => {
  it('normalizeIsoDate keeps valid ISO and rejects garbage', () => {
    expect(normalizeIsoDate('2026-06-10')).toBe('2026-06-10');
    expect(normalizeIsoDate('basura')).toBe('');
    expect(normalizeIsoDate(undefined)).toBe('');
  });

  it('normalizeIsoList dedupes and drops invalid entries', () => {
    const list = normalizeIsoList(['2026-06-10', '2026-06-10', 'nope', '2026-06-12']);
    expect(list.length).toBe(2);
    expect(list).toContain('2026-06-10');
    expect(list).toContain('2026-06-12');
  });

  it('nightsBetween returns whole nights with sign', () => {
    expect(nightsBetween('2026-06-10', '2026-06-14')).toBe(4);
    expect(nightsBetween('2026-06-14', '2026-06-10')).toBe(-4);
    expect(nightsBetween('2026-06-10', '2026-06-10')).toBe(0);
  });

  it('parseMonthAnchor returns the first of the requested month', () => {
    const anchor = parseMonthAnchor('2026-06');
    expect(anchor.getFullYear()).toBe(2026);
    expect(anchor.getMonth()).toBe(5);
    expect(anchor.getDate()).toBe(1);
  });
});
