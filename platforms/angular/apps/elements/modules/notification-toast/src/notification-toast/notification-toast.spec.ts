import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NOTIFICATION_TOAST_SYNHOST } from '@synergos/contracts';
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

  // `position` y el `title` de cada aviso no los autora el editor en el CMS (ADR 0135): son atributo.
  it('should seed toasts from config and announce assertively for errors (render/config case)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"toasts":[{"message":"Guardado","variant":"success"},{"message":"Error de red","variant":"error"}]}',
    );
    fixture.componentRef.setInput('position', 'bottom-center');
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

  // D1: con `message`/`type` sueltos en el `config` —lo que mandaba la vista— este elemento no
  // sembraba ningún aviso. Éste alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('muestra el aviso que el editor autoró con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = NOTIFICATION_TOAST_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.toasts().map((toast) => toast.message)).toEqual(ejemplo.toasts?.map((seed) => seed.message));
    expect(component.toasts().map((toast) => toast.variant)).toEqual(ejemplo.toasts?.map((seed) => seed.variant));
    expect(component.toasts()[0]?.durationMs).toBe(ejemplo.durationMs);
    expect(fixture.nativeElement.querySelector('.toast-stack')).toBeTruthy();
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

  // ADR 0136 (CMS#191): la microcopia sale de la sección `Notification` que publica la página.
  describe('microcopia del diccionario', () => {
    afterEach(() => {
      delete (window as { synergos?: unknown }).synergos;
    });

    it('sin bridge pinta el respaldo es-CO', async () => {
      fixture.componentRef.setInput('config', JSON.stringify(NOTIFICATION_TOAST_SYNHOST.ejemplo));
      fixture.detectChanges();
      await fixture.whenStable();

      const raiz = fixture.nativeElement as HTMLElement;
      expect(raiz.querySelector('.toast-stack')?.getAttribute('aria-label')).toBe('Notificaciones');
      expect(raiz.querySelector('.toast__close')?.getAttribute('aria-label')).toBe('Cerrar');
    });

    it('con el bridge pinta las claves que publicó la página; lo que no publica sale por su respaldo', async () => {
      (window as { synergos?: unknown }).synergos = {
        i18n: { culture: 'en-US', defaultCulture: 'es-CO', keys: { 'Notification.Dismiss': 'Dismiss' } },
      };
      const otra = TestBed.createComponent(NotificationToastElementComponent);
      otra.componentRef.setInput('config', JSON.stringify(NOTIFICATION_TOAST_SYNHOST.ejemplo));
      otra.detectChanges();
      await otra.whenStable();

      const raiz = otra.nativeElement as HTMLElement;
      expect(raiz.querySelector('.toast__close')?.getAttribute('aria-label')).toBe('Dismiss');
      expect(raiz.querySelector('.toast-stack')?.getAttribute('aria-label')).toBe('Notificaciones');
    });
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
