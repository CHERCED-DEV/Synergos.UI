import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  OtpInputElementComponent,
  type OtpInputChangeDetail,
  type OtpInputCompleteDetail,
  clampLength,
  sanitizeCode,
} from './otp-input';

describe('OtpInputElementComponent', () => {
  let fixture: ComponentFixture<OtpInputElementComponent>;
  let component: OtpInputElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OtpInputElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(OtpInputElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with default cells and an empty value (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.length()).toBe(6);
    expect(component.cells().length).toBe(6);
    expect(component.value()).toBe('');
    expect(component.isComplete()).toBe(false);
    // First empty cell carries the roving tabindex.
    expect(component.activeIndex()).toBe(0);
  });

  it('should honor config length/mode and let direct inputs win (render/config case)', async () => {
    fixture.componentRef.setInput('config', '{"length":4,"mode":"alphanumeric","mask":true}');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.length()).toBe(4);
    expect(component.cells().length).toBe(4);
    expect(component.mode()).toBe('alphanumeric');
    expect(component.inputType()).toBe('password');

    // Explicit attribute overrides config.
    fixture.componentRef.setInput('length', 8);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.length()).toBe(8);
    expect(component.cells().length).toBe(8);
  });

  it('should distribute a paste and emit complete (interaction case)', async () => {
    fixture.componentRef.setInput('length', 4);
    fixture.detectChanges();
    await fixture.whenStable();

    let lastChange: OtpInputChangeDetail | undefined;
    let completed: OtpInputCompleteDetail | undefined;
    component.codechange.subscribe((detail) => (lastChange = detail));
    component.complete.subscribe((detail) => (completed = detail));

    const pasteEvent = {
      preventDefault: () => undefined,
      clipboardData: { getData: () => '12-34' },
    } as unknown as ClipboardEvent;
    component.onPaste(pasteEvent, 0);

    // Non-digits stripped, four digits land across the cells.
    expect(component.value()).toBe('1234');
    expect(component.isComplete()).toBe(true);
    expect(lastChange?.value).toBe('1234');
    expect(lastChange?.complete).toBe(true);
    expect(completed?.value).toBe('1234');
  });

  it('should reset back to the empty state (idempotent case)', async () => {
    fixture.componentRef.setInput('length', 4);
    fixture.detectChanges();
    await fixture.whenStable();

    component.onPaste(
      {
        preventDefault: () => undefined,
        clipboardData: { getData: () => '9999' },
      } as unknown as ClipboardEvent,
      0,
    );
    expect(component.value()).toBe('9999');

    component.reset();
    expect(component.value()).toBe('');
    expect(component.isComplete()).toBe(false);
    expect(component.cells().every((cell) => cell.value === '')).toBe(true);

    // Resetting an already-empty field stays empty (idempotent).
    component.reset();
    expect(component.value()).toBe('');
  });
});

describe('otp-input pure helpers', () => {
  it('clampLength keeps the count inside the supported range', () => {
    expect(clampLength(undefined)).toBe(6);
    expect(clampLength(4)).toBe(4);
    expect(clampLength(1)).toBe(2);
    expect(clampLength(99)).toBe(12);
    expect(clampLength(4.6)).toBe(5);
  });

  it('sanitizeCode filters by mode and upper-cases alphanumeric', () => {
    expect(sanitizeCode('12-34', 'numeric')).toBe('1234');
    expect(sanitizeCode('ab12!', 'numeric')).toBe('12');
    expect(sanitizeCode('ab12!', 'alphanumeric')).toBe('AB12');
  });
});
