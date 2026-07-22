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

    // A return one night out violates minStay=2, so it is not a legal check-out.
    // The contract is that such a day is INERT, not that it re-anchors: the grid
    // renders each day as a native <button [disabled]="day.disabled"> (see
    // date-picker.html), so a blocked cell emits no click in the DOM at all, and
    // selectDay() bails on `day.disabled` to match. Silently moving the arrival
    // date because the user poked a greyed-out cell would be a footgun in a
    // booking engine. Re-anchoring is done via "Limpiar" — rendered by the
    // footer exactly while a check-in exists — or by completing the range.
    const tooClose = component.flatDays().find((day) => day.iso === '2026-06-11')!;
    expect(tooClose.disabled).toBe(true);
    component.selectDay(tooClose);
    expect(component.returnDate()).toBeNull();
    expect(component.selectedDate()).toBe('2026-06-10'); // check-in untouched

    // The check-in itself stays live while its check-out is pending — it must
    // remain focusable and must not paint as a disabled (struck-through) cell.
    // Re-picking it simply re-anchors onto the same day.
    const pendingCheckIn = component.flatDays().find((day) => day.iso === '2026-06-10')!;
    expect(pendingCheckIn.disabled).toBe(false);
    component.selectDay(pendingCheckIn);
    expect(component.selectedDate()).toBe('2026-06-10');
    expect(component.returnDate()).toBeNull();

    // A valid check-out 4 nights later completes the range.
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

  it('should keep the grid keyboard-reachable and the check-in un-struck while picking a check-out', async () => {
    fixture.componentRef.setInput('mode', 'range');
    fixture.componentRef.setInput('initialMonth', '2026-06');
    fixture.componentRef.setInput('minStay', '2');
    fixture.detectChanges();
    await fixture.whenStable();

    component.selectDay(component.flatDays().find((day) => day.iso === '2026-06-10')!);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const cells = Array.from(host.querySelectorAll<HTMLButtonElement>('.date-picker__day'));

    // The chosen check-in must not render as a disabled cell: `.date-picker__day:disabled`
    // (0,2,0) outranks `.date-picker__day--selected` (0,1,0) in date-picker.scss, so a
    // disabled check-in is painted struck-through + muted grey — the arrival the user
    // just picked would appear crossed out.
    const checkInCell = cells.find((cell) => cell.dataset['iso'] === '2026-06-10')!;
    expect(checkInCell.disabled).toBe(false);

    // Roving tabindex parks tabindex=0 on the check-in. A disabled button is not
    // focusable, so if that cell were disabled the grid would hold zero tabbable
    // cells and no keyboard user could ever reach a check-out.
    const tabbable = cells.filter(
      (cell) => cell.getAttribute('tabindex') === '0' && !cell.disabled,
    );
    expect(tabbable.length).toBeGreaterThan(0);
    expect(tabbable[0].dataset['iso']).toBe('2026-06-10');
  });

  it('should re-anchor the check-in when an earlier day is picked (no dead calendar behind it)', async () => {
    fixture.componentRef.setInput('mode', 'range');
    fixture.componentRef.setInput('initialMonth', '2026-06');
    fixture.componentRef.setInput('minStay', '2');
    fixture.detectChanges();
    await fixture.whenStable();

    component.selectDay(component.flatDays().find((day) => day.iso === '2026-06-20')!);
    expect(component.selectedDate()).toBe('2026-06-20');

    // Days before the pending check-in stay live: selectDay's own branch
    // ("a pick before the current start: (re)start the range at this day")
    // must be reachable, otherwise the whole calendar behind the arrival —
    // and every previous month — is inert and only "Limpiar" escapes.
    const earlier = component.flatDays().find((day) => day.iso === '2026-06-12')!;
    expect(earlier.disabled).toBe(false);
    component.selectDay(earlier);
    expect(component.selectedDate()).toBe('2026-06-12');
    expect(component.returnDate()).toBeNull();
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
