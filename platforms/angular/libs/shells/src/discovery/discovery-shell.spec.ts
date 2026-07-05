import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  DiscoveryShellComponent,
  type DiscoveryCriteria,
  type DiscoveryFacet,
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
      [config]="{ pageSize: 2, emptyMessage: 'Nada por aquí' }"
      [itemTemplate]="row"
      (criteriachange)="onCriteria($event)"
      (itemselect)="onSelect($event)"
    />
  `,
})
class HostComponent {
  readonly items = signal<readonly Row[]>([]);
  readonly facets = signal<readonly DiscoveryFacet[]>([]);
  readonly total = signal<number | null>(null);
  readonly criteriaLog: DiscoveryCriteria[] = [];
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

    expect(element.querySelector('.syn-discovery__empty')?.textContent).toContain('Nada por aquí');
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
});
