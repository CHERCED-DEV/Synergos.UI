import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SynSkeletonComponent } from './skeleton';

describe(SynSkeletonComponent.name, () => {
  async function create(): Promise<ComponentFixture<SynSkeletonComponent>> {
    await TestBed.configureTestingModule({
      imports: [SynSkeletonComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    return TestBed.createComponent(SynSkeletonComponent);
  }

  afterEach(() => TestBed.resetTestingModule());

  // ── empty (defaults) ─────────────────────────────────────────────────────────
  it('renders the text variant with default rows and busy semantics (empty case)', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.getAttribute('role')).toBe('status');
    expect(host.getAttribute('aria-busy')).toBe('true');
    expect(host.getAttribute('data-variant')).toBe('text');
    expect(host.getAttribute('aria-label')).toBe('Cargando…');
    // Default rows = 3 text bones.
    expect(host.querySelectorAll('.syn-skeleton__bone--text')).toHaveLength(3);
  });

  // ── happy (list mould) ───────────────────────────────────────────────────────
  it('mimics a list layout with an avatar + lines per row and a custom label (happy case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('variant', 'list');
    fixture.componentRef.setInput('rows', 2);
    fixture.componentRef.setInput('ariaLabel', 'Cargando pedidos…');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.getAttribute('aria-label')).toBe('Cargando pedidos…');
    expect(host.querySelectorAll('.syn-skeleton__row')).toHaveLength(2);
    expect(host.querySelectorAll('.syn-skeleton__bone--avatar')).toHaveLength(2);
    // Decorative bones are hidden from AT.
    expect(host.querySelector('.syn-skeleton__bone--avatar')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  // ── filter (table mould) ─────────────────────────────────────────────────────
  it('mimics a table with a header row plus body rows of cells (filter case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('variant', 'table');
    fixture.componentRef.setInput('rows', 3);
    fixture.componentRef.setInput('columns', 4);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    // 1 head + 3 body rows.
    expect(host.querySelectorAll('.syn-skeleton__tr')).toHaveLength(4);
    expect(host.querySelectorAll('.syn-skeleton__tr--head')).toHaveLength(1);
    // 4 columns × 4 rows = 16 cells.
    expect(host.querySelectorAll('.syn-skeleton__bone--cell')).toHaveLength(16);
  });

  // ── idempotent (clamp) ───────────────────────────────────────────────────────
  it('clamps non-positive rows/columns to at least one (idempotent case)', async () => {
    const fixture = await create();
    fixture.componentRef.setInput('variant', 'text');
    fixture.componentRef.setInput('rows', 0);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;

    expect(host.querySelectorAll('.syn-skeleton__bone--text')).toHaveLength(1);
  });
});
