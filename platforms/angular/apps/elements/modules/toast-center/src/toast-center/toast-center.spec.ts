import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ToastCenterElementComponent,
  type ToastDismissDetail,
  normalizePosition,
  normalizeSeverity,
  normalizeToast,
  normalizeToasts,
} from './toast-center';

const DEFAULTS = { duration: 5000, dismissible: true };

const TOASTS = JSON.stringify([
  { id: 't1', severity: 'success', title: 'Guardado', message: 'Cambios aplicados', duration: 0 },
  { id: 't2', severity: 'danger', message: 'Algo falló', duration: 0 },
  { severity: 'info', message: 'Pista útil', duration: 0 },
  { severity: 'warning' },
]);

describe('ToastCenterElementComponent', () => {
  let fixture: ComponentFixture<ToastCenterElementComponent>;
  let component: ToastCenterElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastCenterElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ToastCenterElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with an empty queue and sane defaults (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasToasts()).toBe(false);
    expect(component.visibleToasts().length).toBe(0);
    expect(component.overflowCount()).toBe(0);
    expect(component.position()).toBe('top-end');
    expect(component.maxVisible()).toBe(4);
  });

  it('should seed declared toasts, cap by maxVisible and report overflow (render/config case)', async () => {
    fixture.componentRef.setInput('position', 'bottom-center');
    fixture.componentRef.setInput('maxVisible', 2);
    fixture.componentRef.setInput('toasts', TOASTS);
    fixture.detectChanges();
    await fixture.whenStable();

    // 3 entries survive normalization (the warning-only one has no text).
    expect(component.queue().length).toBe(3);
    expect(component.visibleToasts().length).toBe(2);
    expect(component.overflowCount()).toBe(1);
    expect(component.hasOverflow()).toBe(true);
    expect(component.position()).toBe('bottom-center');
    expect(component.stackVertical()).toBe('bottom');
  });

  it('should push, dismiss and emit toastdismiss (interaction case)', async () => {
    let emitted: ToastDismissDetail | undefined;
    component.toastdismiss.subscribe((detail) => (emitted = detail));

    const id = component.push({ severity: 'info', message: 'Hola', duration: 0 });
    fixture.detectChanges();
    expect(id).not.toBe('');
    expect(component.hasToasts()).toBe(true);

    component.dismiss(id, 'manual');
    fixture.detectChanges();

    expect(component.hasToasts()).toBe(false);
    expect(emitted?.id).toBe(id);
    expect(emitted?.reason).toBe('manual');
  });

  it('should replace a same-id push without duplicating (idempotent case)', () => {
    component.push({ id: 'dup', severity: 'info', message: 'Primero', duration: 0 });
    component.push({ id: 'dup', severity: 'success', message: 'Segundo', duration: 0 });

    expect(component.queue().length).toBe(1);
    expect(component.queue()[0].severity).toBe('success');
    expect(component.queue()[0].message).toBe('Segundo');
  });
});

describe('toast-center pure helpers', () => {
  it('normalizeSeverity falls back to info for unknown values', () => {
    expect(normalizeSeverity('danger')).toBe('danger');
    expect(normalizeSeverity('SUCCESS')).toBe('success');
    expect(normalizeSeverity('nope')).toBe('info');
    expect(normalizeSeverity(undefined)).toBe('info');
  });

  it('normalizePosition normalizes separators and falls back to top-end', () => {
    expect(normalizePosition('bottom-start')).toBe('bottom-start');
    expect(normalizePosition('TOP_CENTER')).toBe('top-center');
    expect(normalizePosition('middle')).toBe('top-end');
  });

  it('normalizeToast drops entries without title or message', () => {
    expect(normalizeToast({ severity: 'info' }, DEFAULTS)).toBeNull();
    expect(normalizeToast('no-objeto', DEFAULTS)).toBeNull();
    const ok = normalizeToast({ message: 'Hola' }, DEFAULTS);
    expect(ok?.message).toBe('Hola');
    expect(ok?.title).toBe('Información');
  });

  it('normalizeToasts keeps only usable entries', () => {
    const list = normalizeToasts(
      [{ title: 'Uno' }, { severity: 'warning' }, 'x'],
      DEFAULTS,
    );
    expect(list.length).toBe(1);
    expect(list[0].title).toBe('Uno');
  });
});
