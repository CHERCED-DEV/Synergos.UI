import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DiscoveryShellComponent,
  type DiscoveryCriteria,
  type DiscoveryFacet,
  type DiscoveryShellConfig,
} from './discovery-shell';

interface Row {
  readonly id: string;
  readonly title: string;
}

const FACETS: readonly DiscoveryFacet[] = [
  {
    key: 'brand',
    label: 'Marca',
    values: [
      { value: 'sony', label: 'Sony', count: 3 },
      { value: 'acme', label: 'Acme', count: 1 },
    ],
  },
];

@Component({
  standalone: true,
  imports: [DiscoveryShellComponent],
  template: `
    <ng-template #row let-item let-select="select">
      <button type="button" class="row-pick" (click)="select()">{{ item.title }}</button>
    </ng-template>
    <syn-discovery-shell
      [items]="items()"
      [facets]="facets()"
      [sortOptions]="[
        { key: 'relevance', label: 'Relevancia' },
        { key: 'price-asc', label: 'Menor precio' }
      ]"
      [total]="total()"
      [config]="config()"
      [loading]="loading()"
      [degradedMessage]="degraded()"
      [itemTemplate]="row"
      (criteriachange)="onCriteria($event)"
      (itemselect)="onSelect($event)"
      (retry)="retryCount = retryCount + 1"
      (emptyAction)="emptyActionCount = emptyActionCount + 1"
    />
  `,
})
class HostComponent {
  readonly config = signal<DiscoveryShellConfig>({ pageSize: 2, emptyMessage: 'Nada por aquí' });
  readonly items = signal<readonly Row[]>([]);
  readonly facets = signal<readonly DiscoveryFacet[]>([]);
  readonly total = signal<number | null>(null);
  readonly loading = signal(false);
  readonly degraded = signal<string | undefined>(undefined);
  readonly criteriaLog: DiscoveryCriteria[] = [];
  retryCount = 0;
  emptyActionCount = 0;
  selected: Row | null = null;

  onCriteria(criteria: DiscoveryCriteria): void {
    this.criteriaLog.push(criteria);
  }

  onSelect(item: Row): void {
    this.selected = item;
  }
}

describe(DiscoveryShellComponent.name, () => {
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
  it('renders the configured empty state with zero results (empty case)', async () => {
    const fixture = await createHost();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('syn-empty-state')?.textContent).toContain('Nada por aquí');
    expect(element.querySelector('.syn-discovery__count')?.textContent).toContain('0');
    expect(element.querySelectorAll('.syn-discovery__item')).toHaveLength(0);
  });

  // ── happy ───────────────────────────────────────────────────────────────────
  it('renders items through the template, emits criteria on search and item on select (happy case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.items.set([
      { id: 'a', title: 'Alfa' },
      { id: 'b', title: 'Beta' },
    ]);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const picks = element.querySelectorAll<HTMLButtonElement>('.row-pick');
    expect(picks).toHaveLength(2);
    expect(picks[0].textContent).toContain('Alfa');

    // Search submit → criteriachange with the typed term, page reset to 1.
    const input = element.querySelector<HTMLInputElement>('.syn-discovery__search-input')!;
    input.value = 'alfa';
    input.dispatchEvent(new Event('input'));
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(host.criteriaLog.at(-1)).toMatchObject({ term: 'alfa', page: 1, sort: 'relevance' });

    // Template's select() → itemselect with the item.
    picks[1].click();
    expect(host.selected?.id).toBe('b');
  });

  // ── filter ──────────────────────────────────────────────────────────────────
  it('shows facet counts and emits the selected facet values (filter case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.facets.set(FACETS);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.syn-discovery__facet-count')?.textContent).toContain('3');

    const checkbox = element.querySelector<HTMLInputElement>(
      '.syn-discovery__facet-option input',
    )!;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(host.criteriaLog.at(-1)?.facets).toEqual({ brand: ['sony'] });
  });

  // ── idempotent ─────────────────────────────────────────────────────────────
  it('toggling the same facet twice returns to clean criteria (idempotent case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.facets.set(FACETS);
    fixture.detectChanges();

    const checkbox = fixture.nativeElement.querySelector(
      '.syn-discovery__facet-option input',
    ) as HTMLInputElement;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(host.criteriaLog).toHaveLength(2);
    expect(host.criteriaLog.at(-1)?.facets).toEqual({});
  });

  // ── pagination (derived from total + pageSize) ──────────────────────────────
  it('paginates from total/pageSize and clamps page navigation', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.items.set([
      { id: 'a', title: 'Alfa' },
      { id: 'b', title: 'Beta' },
    ]);
    host.total.set(5); // pageSize 2 → 3 pages
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const buttons = element.querySelectorAll<HTMLButtonElement>('.syn-discovery__page-btn');
    expect(element.querySelector('.syn-discovery__page-info')?.textContent).toContain('1 / 3');
    expect(buttons[0].disabled).toBe(true);

    buttons[1].click();
    fixture.detectChanges();
    expect(host.criteriaLog.at(-1)?.page).toBe(2);
    expect(
      fixture.nativeElement.querySelector('.syn-discovery__page-info')?.textContent,
    ).toContain('2 / 3');
  });

  // ── state surfaces (Fase 2): skeleton / error / degraded ────────────────────
  it('renders skeleton on loading, error-state with retry on errorMessage, and the degraded banner', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    const element: HTMLElement = fixture.nativeElement;

    // Loading → skeleton; never the empty surface while resolving.
    host.loading.set(true);
    fixture.detectChanges();
    expect(element.querySelector('syn-skeleton')).toBeTruthy();
    expect(element.querySelector('syn-empty-state')).toBeNull();

    // Degraded → persistent status banner alongside the content.
    host.degraded.set('Estás viendo datos de ejemplo.');
    fixture.detectChanges();
    expect(element.querySelector('syn-status-banner')?.textContent).toContain('datos de ejemplo');

    // Error wins over loading; retry re-emits to the consumer.
    host.config.set({ pageSize: 2, errorMessage: 'No se pudo cargar el catálogo.' });
    fixture.detectChanges();
    expect(element.querySelector('syn-error-state')?.textContent).toContain(
      'No se pudo cargar el catálogo.',
    );
    expect(element.querySelector('syn-skeleton')).toBeNull();
    element.querySelector<HTMLButtonElement>('.syn-error__retry')!.click();
    expect(host.retryCount).toBe(1);
  });

  // ── empty differentiation: first-use vs no-results ──────────────────────────
  it('differentiates first-use from no-results and clears criteria via the CTA', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.facets.set(FACETS);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    // No criteria + zero results → first-use.
    expect(element.querySelector('syn-empty-state')?.getAttribute('data-kind')).toBe('first-use');

    // Activating a facet with zero results → no-results + a "clear" CTA.
    const checkbox = element.querySelector<HTMLInputElement>('.syn-discovery__facet-option input')!;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.querySelector('syn-empty-state')?.getAttribute('data-kind')).toBe('no-results');

    const cta = element.querySelector<HTMLButtonElement>('syn-empty-state .syn-empty__action')!;
    cta.click();
    fixture.detectChanges();
    // The internal clear() reset the criteria (no facets selected any more).
    expect(host.criteriaLog.at(-1)?.facets).toEqual({});
  });

  // ── kind ────────────────────────────────────────────────────────────────────
  // El backend declara CÓMO se comporta cada faceta (`kind`); el shell obedece en vez de
  // pintarlo todo como checkbox. Sin esto, marcar "4.5+" y "4+" a la vez devolvía el
  // catálogo entero con los DOS chips encendidos (gana el umbral menos restrictivo).

  /** Una faceta de umbral tal como la emiten Tienda (`minRating`) y Propiedades (`beds`). */
  const THRESHOLD_FACET: readonly DiscoveryFacet[] = [
    {
      key: 'minRating',
      label: 'Calificación',
      kind: 'Threshold',
      values: [
        { value: '4.5', label: '4.5 estrellas o más', count: 3 },
        { value: '4', label: '4 estrellas o más', count: 6 },
      ],
    },
  ];

  function optionInputs(element: HTMLElement): HTMLInputElement[] {
    return Array.from(
      element.querySelectorAll<HTMLInputElement>('.syn-discovery__facet-option input'),
    );
  }

  it('renders a facet with no kind as checkboxes (compat: los verticales que no lo emiten)', async () => {
    const fixture = await createHost();
    fixture.componentInstance.facets.set(FACETS);
    fixture.detectChanges();

    const inputs = optionInputs(fixture.nativeElement);
    expect(inputs).toHaveLength(2);
    expect(inputs.every((input) => input.type === 'checkbox')).toBe(true);
  });

  it('renders a Threshold facet as radios plus an "any" option', async () => {
    const fixture = await createHost();
    fixture.componentInstance.facets.set(THRESHOLD_FACET);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const inputs = optionInputs(element);
    // 2 tramos + "Cualquiera".
    expect(inputs).toHaveLength(3);
    expect(inputs.every((input) => input.type === 'radio')).toBe(true);
    // Un solo grupo → seleccionar uno desmarca el otro sin ayuda del shell.
    expect(new Set(inputs.map((input) => input.name)).size).toBe(1);
    // Sin selección, "Cualquiera" es el que está marcado.
    expect(inputs[0].checked).toBe(true);
    expect(element.querySelector('.syn-discovery__facet-label')?.textContent).toContain(
      'Cualquiera',
    );
  });

  it('REPLACES the value of a Threshold facet instead of accumulating it', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.facets.set(THRESHOLD_FACET);
    fixture.detectChanges();

    const [, strict, loose] = optionInputs(fixture.nativeElement);

    strict.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.criteriaLog.at(-1)?.facets).toEqual({ minRating: ['4.5'] });

    // El bug: esto acumulaba a ['4.5','4'] y el motor se quedaba con el MENOS restrictivo,
    // así que el listado volvía a salir entero con los dos chips marcados.
    loose.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.criteriaLog.at(-1)?.facets).toEqual({ minRating: ['4'] });
  });

  it('releases only its own facet through the "any" option', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.facets.set([...THRESHOLD_FACET, ...FACETS]);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const [any, strict] = optionInputs(element);
    strict.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // Una faceta multi-valor encendida en paralelo: "Cualquiera" no debe tocarla.
    const brand = element.querySelectorAll<HTMLInputElement>('.syn-discovery__facet-option input')[3];
    brand.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.criteriaLog.at(-1)?.facets).toEqual({ minRating: ['4.5'], brand: ['sony'] });

    any.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.criteriaLog.at(-1)?.facets).toEqual({ brand: ['sony'] });
  });

  it('keeps accumulating values on a MultiSelect facet (la unión sigue viva)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.facets.set([{ ...FACETS[0], kind: 'MultiSelect' }]);
    fixture.detectChanges();

    const [sony, acme] = optionInputs(fixture.nativeElement);
    sony.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    acme.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(host.criteriaLog.at(-1)?.facets).toEqual({ brand: ['sony', 'acme'] });
  });
});
