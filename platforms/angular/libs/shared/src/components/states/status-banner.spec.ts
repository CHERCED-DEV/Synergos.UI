import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SynStatusBannerComponent } from './status-banner';

describe(SynStatusBannerComponent.name, () => {
  async function create(): Promise<ComponentFixture<SynStatusBannerComponent>> {
    await TestBed.configureTestingModule({
      imports: [SynStatusBannerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    return TestBed.createComponent(SynStatusBannerComponent);
  }

  afterEach(() => TestBed.resetTestingModule());

  // ── empty (defaults, degraded) ───────────────────────────────────────────────
  it('renders a polite degraded status with no dismiss control (empty case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('message', 'Estás viendo datos de ejemplo.');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.getAttribute('role')).toBe('status');
    expect(host.getAttribute('aria-live')).toBe('polite');
    expect(host.querySelector('.syn-status')?.getAttribute('data-tone')).toBe('degraded');
    expect(host.querySelector('.syn-status__message')?.textContent).toContain(
      'Estás viendo datos de ejemplo.',
    );
    expect(host.querySelector('.syn-status__dismiss')).toBeNull();
  });

  // ── happy (dismiss) ──────────────────────────────────────────────────────────
  it('emits dismiss and removes the banner when dismissed (happy case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('message', 'Datos de ejemplo.');
    fixture.componentRef.setInput('dismissable', true);
    let fired = 0;
    fixture.componentInstance.dismiss.subscribe(() => (fired += 1));
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    const btn = host.querySelector<HTMLButtonElement>('.syn-status__dismiss');
    expect(btn?.getAttribute('aria-label')).toBe('Descartar');
    btn!.click();
    fixture.detectChanges();
    expect(fired).toBe(1);
    expect(host.querySelector('.syn-status')).toBeNull();
  });

  // ── filter (info tone) ───────────────────────────────────────────────────────
  it('maps the info tone to its data-tone (filter case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('message', 'Mantenimiento programado.');
    fixture.componentRef.setInput('tone', 'info');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelector('.syn-status')?.getAttribute('data-tone')).toBe('info');
  });

  // ── idempotent (dismiss once) ────────────────────────────────────────────────
  it('emits dismiss at most once even if invoked repeatedly (idempotent case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('message', 'Datos de ejemplo.');
    fixture.componentRef.setInput('dismissable', true);
    let fired = 0;
    fixture.componentInstance.dismiss.subscribe(() => (fired += 1));
    fixture.detectChanges();

    fixture.componentInstance.onDismiss();
    fixture.componentInstance.onDismiss();
    expect(fired).toBe(1);
  });
});
