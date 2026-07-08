import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ConsoleShellComponent,
  type ConsoleKpi,
  type ConsoleRowAction,
  type ConsoleRowActionEvent,
  type ConsoleShellConfig,
} from './console-shell';

interface Order {
  readonly ref: string;
  readonly status: string;
}

const CONFIG: ConsoleShellConfig = {
  heading: 'Consola',
  sections: [
    { id: 'ventas', label: 'Ventas', kind: 'table', badge: 3 },
    { id: 'reputacion', label: 'Reputación', kind: 'custom' },
  ],
  emptyMessage: 'Sin órdenes en la cola',
};

const KPIS: readonly ConsoleKpi[] = [
  { id: 'sales', label: 'Ventas', value: '$ 12,4 M', delta: '+12%', trend: 'up' },
  { id: 'conv', label: 'Conversión', value: '3,1%', delta: '-0,4 pt', trend: 'down' },
];

@Component({
  standalone: true,
  imports: [ConsoleShellComponent],
  template: `
    <ng-template #cell let-order let-column="column">
      <span class="cell" [attr.data-col]="column.key">{{
        column.key === 'ref' ? order.ref : order.status
      }}</span>
    </ng-template>
    <ng-template #section let-current>
      <p class="custom-body" [attr.data-section]="current.id">sección {{ current.id }}</p>
    </ng-template>
    <ng-template #reports let-active>
      <p class="reports-body" [attr.data-active]="active">reporte de {{ active }}</p>
    </ng-template>
    <syn-console-shell
      [config]="config()"
      [kpis]="kpis()"
      [rows]="rows()"
      [loading]="loading()"
      [degradedMessage]="degraded()"
      [columns]="[
        { key: 'ref', label: 'Orden' },
        { key: 'status', label: 'Estado', align: 'end' }
      ]"
      [filters]="[
        { key: 'todas', label: 'Todas' },
        { key: 'nuevas', label: 'Nuevas' }
      ]"
      [actionsFor]="actionsFor"
      [cellTemplate]="cell"
      [sectionTemplate]="section"
      [reportsTemplate]="reports"
      (sectionchange)="sectionLog.push($event)"
      (filterchange)="filterLog.push($event)"
      (rowaction)="actionLog.push($event)"
      (retry)="retryCount = retryCount + 1"
    />
  `,
})
class HostComponent {
  readonly config = signal<ConsoleShellConfig>(CONFIG);
  readonly kpis = signal<readonly ConsoleKpi[]>(KPIS);
  readonly rows = signal<readonly Order[]>([]);
  readonly loading = signal(false);
  readonly degraded = signal<string | undefined>(undefined);
  retryCount = 0;
  readonly sectionLog: string[] = [];
  readonly filterLog: string[] = [];
  readonly actionLog: ConsoleRowActionEvent<Order>[] = [];

  readonly actionsFor = (row: Order): readonly ConsoleRowAction[] =>
    row.status === 'nueva'
      ? [{ id: 'preparar', label: 'Preparar', kind: 'primary' }]
      : [{ id: 'archivar', label: 'Archivar' }];
}

describe(ConsoleShellComponent.name, () => {
  async function createHost() {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  // ── empty ───────────────────────────────────────────────────────────────────
  it('renders KPIs with trend deltas, the reports slot and the empty queue (empty case)', async () => {
    const fixture = await createHost();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.syn-console__heading')?.textContent).toContain('Consola');
    expect(element.querySelectorAll('.syn-console__kpi')).toHaveLength(2);
    const deltas = element.querySelectorAll('.syn-console__kpi-delta');
    expect(deltas[0].classList.contains('is-up')).toBe(true);
    expect(deltas[1].classList.contains('is-down')).toBe(true);
    // Reports slot receives the active section id.
    expect(element.querySelector('.reports-body')?.getAttribute('data-active')).toBe('ventas');
    expect(element.querySelector('syn-empty-state')?.textContent).toContain(
      'Sin órdenes en la cola',
    );
    expect(element.querySelector('.syn-console__badge')?.textContent).toContain('3');
  });

  // ── happy ───────────────────────────────────────────────────────────────────
  it('renders templated rows and emits rowaction with per-row actions (happy case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.rows.set([
      { ref: 'ORD-1', status: 'nueva' },
      { ref: 'ORD-2', status: 'despachada' },
    ]);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('.syn-console__tr')).toHaveLength(2);
    expect(element.querySelectorAll('.cell[data-col="ref"]')[0].textContent).toContain('ORD-1');

    // Row 1 (nueva) → Preparar (primary); row 2 → Archivar (actionsFor per row).
    const actions = element.querySelectorAll<HTMLButtonElement>('.syn-console__action');
    expect(actions).toHaveLength(2);
    expect(actions[0].textContent).toContain('Preparar');
    expect(actions[0].classList.contains('is-primary')).toBe(true);
    expect(actions[1].textContent).toContain('Archivar');

    actions[0].click();
    fixture.detectChanges();
    expect(host.actionLog).toEqual([
      { actionId: 'preparar', row: { ref: 'ORD-1', status: 'nueva' }, sectionId: 'ventas' },
    ]);
  });

  // ── filter ──────────────────────────────────────────────────────────────────
  it('emits filterchange on chips and swaps table for the custom section (filter case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.rows.set([{ ref: 'ORD-1', status: 'nueva' }]);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const chips = element.querySelectorAll<HTMLButtonElement>('.syn-console__filter');
    expect(chips).toHaveLength(2);
    expect(chips[0].classList.contains('is-active')).toBe(true);

    chips[1].click();
    fixture.detectChanges();
    expect(host.filterLog).toEqual(['nuevas']);
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');

    // Switching to the custom section drops the queue and renders the template.
    const nav = element.querySelectorAll<HTMLButtonElement>('.syn-console__nav-btn');
    nav[1].click();
    fixture.detectChanges();
    expect(host.sectionLog).toEqual(['reputacion']);
    expect(element.querySelector('.syn-console__table')).toBeNull();
    expect(element.querySelector('.custom-body')?.getAttribute('data-section')).toBe('reputacion');
    // Reports slot follows the active section.
    expect(element.querySelector('.reports-body')?.getAttribute('data-active')).toBe('reputacion');
  });

  // ── idempotent ─────────────────────────────────────────────────────────────
  it('re-selecting the active section or filter emits nothing new (idempotent case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.rows.set([{ ref: 'ORD-1', status: 'nueva' }]);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    element.querySelectorAll<HTMLButtonElement>('.syn-console__nav-btn')[0].click();
    fixture.detectChanges();
    expect(host.sectionLog).toEqual([]);

    element.querySelectorAll<HTMLButtonElement>('.syn-console__filter')[0].click();
    fixture.detectChanges();
    expect(host.filterLog).toEqual([]);

    // A real change still emits exactly once after the no-ops.
    element.querySelectorAll<HTMLButtonElement>('.syn-console__filter')[1].click();
    fixture.detectChanges();
    expect(host.filterLog).toEqual(['nuevas']);
  });

  // ── state surfaces (Fase 2): skeleton / error / degraded ────────────────────
  it('renders a table skeleton on loading, error-state with retry, and the degraded banner', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    const element: HTMLElement = fixture.nativeElement;

    // Loading → table skeleton; the empty queue is suppressed while resolving.
    host.loading.set(true);
    fixture.detectChanges();
    expect(element.querySelector('syn-skeleton')?.getAttribute('data-variant')).toBe('table');
    expect(element.querySelector('syn-empty-state')).toBeNull();

    // Degraded → status banner above the console content.
    host.degraded.set('Datos de ejemplo.');
    fixture.detectChanges();
    expect(element.querySelector('syn-status-banner')?.textContent).toContain('Datos de ejemplo');

    // Error wins over loading; retry re-emits.
    host.config.set({ ...CONFIG, errorMessage: 'No se pudo cargar la cola.' });
    fixture.detectChanges();
    expect(element.querySelector('syn-error-state')?.textContent).toContain(
      'No se pudo cargar la cola.',
    );
    expect(element.querySelector('syn-skeleton')).toBeNull();
    element.querySelector<HTMLButtonElement>('.syn-error__retry')!.click();
    expect(host.retryCount).toBe(1);
  });

  // ── empty differentiation via the active chip filter ────────────────────────
  it('flips the empty queue to no-results when a non-default filter is active', async () => {
    const fixture = await createHost();
    const element: HTMLElement = fixture.nativeElement;

    // Default filter ("todas") active + no rows → first-use.
    expect(element.querySelector('syn-empty-state')?.getAttribute('data-kind')).toBe('first-use');

    // Selecting "nuevas" (non-default) with no rows → no-results.
    element.querySelectorAll<HTMLButtonElement>('.syn-console__filter')[1].click();
    fixture.detectChanges();
    expect(element.querySelector('syn-empty-state')?.getAttribute('data-kind')).toBe('no-results');
  });
});
