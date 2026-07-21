import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NotificationToastElementComponent,
  type ToastDismissDetail,
  normalizePosition,
  normalizeSeeds,
  normalizeVariant,
} from './notification-toast';

describe('NotificationToastElementComponent', () => {
  let fixture: ComponentFixture<NotificationToastElementComponent>;
  let component: NotificationToastElementComponent;

  beforeEach(async () => {
    vi.useFakeTimers();

    await TestBed.configureTestingModule({
      imports: [NotificationToastElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationToastElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should create with an empty, unrendered stack (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasToasts()).toBe(false);
    expect(component.toasts().length).toBe(0);
    expect(component.position()).toBe('top-end');
    expect(fixture.nativeElement.querySelector('.toast-stack')).toBeNull();
  });

  it('should seed toasts from config and announce assertively for errors (render/config case)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"position":"bottom-center","toasts":[{"message":"Guardado","variant":"success"},{"message":"Error de red","variant":"error","title":"Ups"}]}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.position()).toBe('bottom-center');
    expect(component.toasts().length).toBe(2);
    expect(component.toasts()[0].variant).toBe('success');
    expect(component.toasts()[1].variant).toBe('error');
    // Any error present → the region announces assertively.
    expect(component.liveAssertive()).toBe(true);

    const stack = fixture.nativeElement.querySelector('.toast-stack');
    expect(stack).toBeTruthy();
    expect(stack.getAttribute('aria-live')).toBe('assertive');
    expect(component.toastRole(component.toasts()[1])).toBe('alert');
    expect(component.toastRole(component.toasts()[0])).toBe('status');
  });

  it('should push, auto-dismiss after duration, and emit toastdismiss (interaction case)', () => {
    const events: ToastDismissDetail[] = [];
    component.toastdismiss.subscribe((detail) => events.push(detail));

    const id = component.push('Hola', { variant: 'info', durationMs: 3000 });
    expect(id).toBeGreaterThan(0);
    expect(component.toasts().length).toBe(1);

    // Hover pauses auto-dismiss.
    component.pause();
    vi.advanceTimersByTime(3000);
    expect(component.toasts().length).toBe(1);

    // Resume restarts the timer; it fires after the duration elapses.
    component.resume();
    vi.advanceTimersByTime(3000);
    expect(component.toasts().length).toBe(0);
    expect(events).toEqual([{ id, message: 'Hola', variant: 'info' }]);
  });

  it('should ignore empty pushes and treat duration 0 as sticky (idempotent / edge case)', () => {
    expect(component.push('   ')).toBe(-1);
    expect(component.hasToasts()).toBe(false);

    const id = component.push('Persistente', { durationMs: 0 });
    vi.advanceTimersByTime(60_000);
    expect(component.toasts().length).toBe(1);

    // Manual dismiss is idempotent — second call is a no-op.
    component.dismiss(id);
    component.dismiss(id);
    expect(component.toasts().length).toBe(0);
  });
});

describe('notification-toast pure helpers', () => {
  it('normalizeVariant falls back to info for unknown values', () => {
    expect(normalizeVariant('success')).toBe('success');
    expect(normalizeVariant('error')).toBe('error');
    expect(normalizeVariant('plaid')).toBe('info');
    expect(normalizeVariant(undefined)).toBe('info');
  });

  it('normalizePosition falls back to top-end for unknown values', () => {
    expect(normalizePosition('bottom-start')).toBe('bottom-start');
    expect(normalizePosition('north')).toBe('top-end');
  });

  it('normalizeSeeds drops entries without a message', () => {
    const seeds = normalizeSeeds([
      { message: 'Ok', variant: 'success' },
      { variant: 'error' },
      'no-objeto',
      { message: '   ' },
    ]);
    expect(seeds.length).toBe(1);
    expect(seeds[0].message).toBe('Ok');
  });
});
