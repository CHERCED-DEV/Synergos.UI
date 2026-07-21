import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SynEmptyStateComponent } from './empty-state';

describe(SynEmptyStateComponent.name, () => {
  async function create(): Promise<ComponentFixture<SynEmptyStateComponent>> {
    await TestBed.configureTestingModule({
      imports: [SynEmptyStateComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    return TestBed.createComponent(SynEmptyStateComponent);
  }

  afterEach(() => TestBed.resetTestingModule());

  // ── empty (defaults, no CTA) ─────────────────────────────────────────────────
  it('renders a heading with the default no-results kind and no CTA (empty case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('title', 'Sin resultados');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.getAttribute('data-kind')).toBe('no-results');
    // Meaning carried by a real heading, not colour alone.
    expect(host.querySelector('h2.syn-empty__title')?.textContent).toContain('Sin resultados');
    expect(host.querySelector('.syn-empty__icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.syn-empty__action')).toBeNull();
  });

  // ── happy (button CTA) ───────────────────────────────────────────────────────
  it('renders a button CTA for first-use and emits action on click (happy case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('kind', 'first-use');
    fixture.componentRef.setInput('title', 'Crea tu primer producto');
    fixture.componentRef.setInput('message', 'Aún no tienes nada publicado.');
    fixture.componentRef.setInput('actionLabel', 'Crear producto');
    let fired = 0;
    fixture.componentInstance.action.subscribe(() => (fired += 1));
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.getAttribute('data-kind')).toBe('first-use');
    expect(host.querySelector('.syn-empty__message')?.textContent).toContain('Aún no tienes');
    const btn = host.querySelector<HTMLButtonElement>('button.syn-empty__action');
    expect(btn?.textContent).toContain('Crear producto');
    btn!.click();
    expect(fired).toBe(1);
  });

  // ── filter (link CTA) ────────────────────────────────────────────────────────
  it('renders a link CTA (no emit) when actionHref is set (filter case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('title', 'Sin coincidencias');
    fixture.componentRef.setInput('message', 'Filtro: “rojo, < $50”');
    fixture.componentRef.setInput('actionLabel', 'Limpiar filtros');
    fixture.componentRef.setInput('actionHref', '/tienda');
    let fired = 0;
    fixture.componentInstance.action.subscribe(() => (fired += 1));
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    const link = host.querySelector<HTMLAnchorElement>('a.syn-empty__action');
    expect(link?.getAttribute('href')).toBe('/tienda');
    expect(host.querySelector('button.syn-empty__action')).toBeNull();
    link!.click();
    // A link is navigation, not a callback.
    expect(fired).toBe(0);
  });

  // ── idempotent (no-access, no CTA) ───────────────────────────────────────────
  it('renders no-access with a custom icon and no CTA when unset (idempotent case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('kind', 'no-access');
    fixture.componentRef.setInput('title', 'Sin permiso');
    fixture.componentRef.setInput('icon', '⛔');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.getAttribute('data-kind')).toBe('no-access');
    expect(host.querySelector('.syn-empty__icon')?.textContent).toContain('⛔');
    expect(host.querySelector('.syn-empty__action')).toBeNull();
  });
});
