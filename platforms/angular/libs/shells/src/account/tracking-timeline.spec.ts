import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TrackingTimelineComponent, type TrackingStage } from './tracking-timeline';

const STAGES: readonly TrackingStage[] = [
  { id: 'paid', label: 'Pago recibido', date: '2026-07-01', state: 'done' },
  { id: 'shipped', label: 'En camino', date: '2026-07-03', state: 'current' },
  { id: 'delivered', label: 'Entregado', state: 'pending' },
];

describe(TrackingTimelineComponent.name, () => {
  async function create(stages: readonly TrackingStage[]) {
    await TestBed.configureTestingModule({
      imports: [TrackingTimelineComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(TrackingTimelineComponent);
    fixture.componentRef.setInput('stages', stages);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  // ── empty ───────────────────────────────────────────────────────────────────
  it('renders the empty message when there are no stages (empty case)', async () => {
    const fixture = await create([]);
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.syn-timeline')).toBeNull();
    expect(element.querySelector('.syn-timeline__empty')?.textContent).toContain(
      'Sin información',
    );
  });

  // ── happy ───────────────────────────────────────────────────────────────────
  it('renders every stage with label and date in order (happy case)', async () => {
    const fixture = await create(STAGES);
    const element: HTMLElement = fixture.nativeElement;

    const labels = Array.from(element.querySelectorAll('.syn-timeline__label')).map(
      (node) => node.textContent?.trim(),
    );
    expect(labels).toEqual(['Pago recibido', 'En camino', 'Entregado']);
    expect(element.querySelectorAll('.syn-timeline__date')).toHaveLength(2);
  });

  // ── filter ──────────────────────────────────────────────────────────────────
  it('marks done/current/pending states distinctly, aria-current on the current (filter case)', async () => {
    const fixture = await create(STAGES);
    const element: HTMLElement = fixture.nativeElement;
    const items = element.querySelectorAll<HTMLElement>('.syn-timeline__stage');

    expect(items[0].classList.contains('is-done')).toBe(true);
    expect(items[1].classList.contains('is-current')).toBe(true);
    expect(items[1].getAttribute('aria-current')).toBe('step');
    expect(items[2].classList.contains('is-done')).toBe(false);
    expect(items[2].classList.contains('is-current')).toBe(false);
  });

  // ── idempotent ─────────────────────────────────────────────────────────────
  it('re-setting the same stages keeps a single stable rendering (idempotent case)', async () => {
    const fixture = await create(STAGES);
    fixture.componentRef.setInput('stages', STAGES);
    fixture.detectChanges();
    fixture.componentRef.setInput('stages', [...STAGES]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.syn-timeline__stage')).toHaveLength(3);
  });
});
