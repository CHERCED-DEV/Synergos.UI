import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ResultsMapComponent,
  fitBounds,
  type GeoBounds,
  type GeoPoint,
} from './results-map';

interface Stay {
  readonly id: string;
  readonly title: string;
  readonly geo: GeoPoint | null;
}

const STAYS: readonly Stay[] = [
  { id: 'a', title: 'Alfa', geo: { lat: 10.4, lng: -75.55 } },
  { id: 'b', title: 'Beta', geo: { lat: 10.45, lng: -75.5 } },
  { id: 'c', title: 'Gamma (sin geo)', geo: null },
];

@Component({
  standalone: true,
  imports: [ResultsMapComponent],
  template: `
    <ng-template #row let-item let-select="select" let-hovered="hovered">
      <button type="button" class="row-pick" [class.row-hot]="hovered" (click)="select()">
        {{ item.title }}
      </button>
    </ng-template>
    <syn-results-map
      [items]="items()"
      [geoOf]="geoOf"
      [pinLabelOf]="labelOf"
      [config]="{ emptyMessage: 'Zona sin resultados' }"
      [itemTemplate]="row"
      (pinselect)="onSelect($event)"
      (boundschange)="onBounds($event)"
    />
  `,
})
class HostComponent {
  readonly items = signal<readonly Stay[]>([]);
  readonly geoOf = (item: Stay): GeoPoint | null => item.geo;
  readonly labelOf = (item: Stay): string => item.title;
  selected: Stay | null = null;
  readonly boundsLog: GeoBounds[] = [];

  onSelect(item: Stay): void {
    this.selected = item;
  }

  onBounds(bounds: GeoBounds): void {
    this.boundsLog.push(bounds);
  }
}

describe(ResultsMapComponent.name, () => {
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
  it('renders the configured empty state and no pins (empty case)', async () => {
    const fixture = await createHost();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.syn-rmap__empty')?.textContent).toContain('Zona sin resultados');
    expect(element.querySelectorAll('.syn-rmap__pin')).toHaveLength(0);
  });

  // ── happy ───────────────────────────────────────────────────────────────────
  it('projects one pin per geo item and emits pinselect on click (happy case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.items.set(STAYS);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    // Only the two items with geo become pins; positions stay within the frame.
    const pins = element.querySelectorAll<HTMLButtonElement>('.syn-rmap__pin');
    expect(pins).toHaveLength(2);
    for (const pin of Array.from(pins)) {
      const left = Number.parseFloat(pin.style.left);
      const top = Number.parseFloat(pin.style.top);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(100);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThanOrEqual(100);
    }
    expect(pins[0].textContent).toContain('Alfa');

    pins[1].click();
    expect(host.selected?.id).toBe('b');

    // The list renders all items through the template (with select()).
    const rows = element.querySelectorAll<HTMLButtonElement>('.row-pick');
    expect(rows).toHaveLength(3);
    rows[0].click();
    expect(host.selected?.id).toBe('a');
  });

  // ── hover sync (filter-style case) ─────────────────────────────────────────
  it('hovering a list row highlights its pin (hover sync)', async () => {
    const fixture = await createHost();
    fixture.componentInstance.items.set(STAYS);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const rows = element.querySelectorAll<HTMLElement>('.syn-rmap__list-item');
    rows[1].dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();

    const pins = element.querySelectorAll<HTMLButtonElement>('.syn-rmap__pin');
    expect(pins[1].classList.contains('is-hovered')).toBe(true);
    expect(pins[0].classList.contains('is-hovered')).toBe(false);

    rows[1].dispatchEvent(new Event('mouseleave'));
    fixture.detectChanges();
    expect(element.querySelectorAll('.syn-rmap__pin.is-hovered')).toHaveLength(0);
  });

  // ── bounds + layout toggle (idempotent case) ────────────────────────────────
  it('emits boundschange on "buscar en esta zona" and toggling layout twice is idempotent', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.items.set(STAYS);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLButtonElement>('.syn-rmap__area-btn')!.click();
    expect(host.boundsLog).toHaveLength(1);
    // The emitted viewport auto-fits the pins (padded around lat 10.4–10.45).
    expect(host.boundsLog[0].minLat).toBeLessThan(10.4);
    expect(host.boundsLog[0].maxLat).toBeGreaterThan(10.45);

    // Toggle list → map → back to split; the list pane returns identically.
    // The layout control is now the `syn-segmented` radiogroup (list/split/map).
    const toggles = element.querySelectorAll<HTMLButtonElement>('.syn-segmented__option');
    expect(toggles).toHaveLength(3);
    toggles[2].click(); // map only
    fixture.detectChanges();
    expect(element.querySelector('.syn-rmap__list-pane')).toBeNull();
    toggles[1].click(); // split again
    fixture.detectChanges();
    expect(element.querySelector('.syn-rmap__list-pane')).not.toBeNull();
    expect(element.querySelectorAll('.syn-rmap__pin')).toHaveLength(2);
  });
});

describe(fitBounds.name, () => {
  it('returns null with no points and pads a single point (empty + degenerate)', () => {
    expect(fitBounds([])).toBeNull();
    const single = fitBounds([{ lat: 4.6, lng: -74.08 }])!;
    expect(single.maxLat).toBeGreaterThan(single.minLat);
    expect(single.maxLng).toBeGreaterThan(single.minLng);
  });
});
