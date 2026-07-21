import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SynErrorStateComponent } from './error-state';

describe(SynErrorStateComponent.name, () => {
  async function create(): Promise<ComponentFixture<SynErrorStateComponent>> {
    await TestBed.configureTestingModule({
      imports: [SynErrorStateComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    return TestBed.createComponent(SynErrorStateComponent);
  }

  afterEach(() => TestBed.resetTestingModule());

  // ── empty (defaults) ─────────────────────────────────────────────────────────
  it('announces via role=alert with the default title and a retry button (empty case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('message', 'No pudimos cargar los pedidos.');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.getAttribute('role')).toBe('alert');
    expect(host.querySelector('.syn-error__title')?.textContent).toContain('Algo salió mal');
    expect(host.querySelector('.syn-error__message')?.textContent).toContain(
      'No pudimos cargar los pedidos.',
    );
    expect(host.querySelector('button.syn-error__retry')?.textContent).toContain('Reintentar');
  });

  // ── happy (retry) ────────────────────────────────────────────────────────────
  it('emits retry when the button is pressed (happy case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('message', 'Error de red.');
    let fired = 0;
    fixture.componentInstance.retry.subscribe(() => (fired += 1));
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    host.querySelector<HTMLButtonElement>('button.syn-error__retry')!.click();
    expect(fired).toBe(1);
  });

  // ── filter (not retryable) ───────────────────────────────────────────────────
  it('hides the button and never emits when retryable is false (filter case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('message', 'Sin conexión.');
    fixture.componentRef.setInput('retryable', false);
    let fired = 0;
    fixture.componentInstance.retry.subscribe(() => (fired += 1));
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('button.syn-error__retry')).toBeNull();
    expect(fired).toBe(0);
  });

  // ── idempotent (custom copy) ─────────────────────────────────────────────────
  it('honours custom title and retry label (idempotent case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('title', 'No se pudo cargar');
    fixture.componentRef.setInput('message', 'Intenta de nuevo.');
    fixture.componentRef.setInput('retryLabel', 'Volver a intentar');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('.syn-error__title')?.textContent).toContain('No se pudo cargar');
    expect(host.querySelector('button.syn-error__retry')?.textContent).toContain(
      'Volver a intentar',
    );
  });
});
