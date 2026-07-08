import {
  ChangeDetectionStrategy,
  Component,
  type TemplateRef,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SegmentedComponent, type SegmentedOption } from '@synergos/shared';

/**
 * SH-8 — `syn-results-map` (catálogo §1.3 doc 21; estrenado por Booking, reusado
 * por Propiedades).
 *
 * The reusable list↔map organism: a templated result list synced with a map
 * frame whose pins are projected from each item's geo (equirectangular % within
 * the current viewport bounds — no external map library yet, same approach as
 * the realty demo map). **Domain-free (OCP):** the shell never knows
 * "estadía/propiedad"; the consumer feeds `items`, a `geoOf` accessor and an
 * `itemTemplate`, and reacts to `boundschange` ("buscar en esta zona") by
 * re-querying. Hover is synced both ways: hovering a list row highlights its
 * pin and vice versa.
 */

/** A geographic coordinate (decimal degrees). */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

/** A rectangular viewport in geographic coordinates. */
export interface GeoBounds {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

/** The three result layouts the toggle offers. */
export type ResultsMapLayout = 'split' | 'list' | 'map';

/** Copy + behaviour config. Everything optional — sane neutral defaults. */
export interface ResultsMapConfig {
  /** Initial layout. Default `split`. */
  readonly layout?: ResultsMapLayout;
  /** Fixed viewport bounds; omit to auto-fit the current pins (with padding). */
  readonly bounds?: GeoBounds;
  readonly listLabel?: string;
  readonly splitLabel?: string;
  readonly mapLabel?: string;
  readonly mapAriaLabel?: string;
  /** Label of the "search this area" button. */
  readonly searchAreaLabel?: string;
  /** Label of the "search as I move" checkbox. */
  readonly searchAsIMoveLabel?: string;
  readonly emptyMessage?: string;
  readonly loadingMessage?: string;
  /** Hide the layout toggle (e.g. a single-pin location map). Default shown. */
  readonly showToggle?: boolean;
  /** Hide zoom/pan/search-area controls. Default shown. */
  readonly showControls?: boolean;
}

/** Template context for each rendered list item. */
export interface ResultsMapItemContext<TItem> {
  readonly $implicit: TItem;
  readonly index: number;
  /** True while this item (or its pin) is hovered. */
  readonly hovered: boolean;
  /** Call to report this item as selected (emits `pinselect`). */
  readonly select: () => void;
}

/** One projected pin (internal + template-facing). */
interface ProjectedPin<TItem> {
  readonly item: TItem;
  readonly index: number;
  /** 0–100 % within the map frame. */
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

const DEFAULT_BOUNDS: GeoBounds = { minLat: -1, maxLat: 1, minLng: -1, maxLng: 1 };
/** Fractional padding added around auto-fitted pins. */
const FIT_PADDING = 0.15;
/** Zoom factors and pan step (fraction of the current span). */
const ZOOM_IN_FACTOR = 0.8;
const ZOOM_OUT_FACTOR = 1.25;
const PAN_STEP = 0.2;

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function span(bounds: GeoBounds): { readonly lat: number; readonly lng: number } {
  return {
    lat: Math.max(1e-9, bounds.maxLat - bounds.minLat),
    lng: Math.max(1e-9, bounds.maxLng - bounds.minLng),
  };
}

/** Auto-fit bounds around the given points (padded); `null` when none. */
export function fitBounds(points: readonly GeoPoint[]): GeoBounds | null {
  if (points.length === 0) {
    return null;
  }
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }
  // Degenerate (single pin) → give it a small window to breathe in.
  const latPad = Math.max((maxLat - minLat) * FIT_PADDING, 0.01);
  const lngPad = Math.max((maxLng - minLng) * FIT_PADDING, 0.01);
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

let resultsMapInstanceId = 0;

@Component({
  selector: 'syn-results-map',
  standalone: true,
  imports: [NgTemplateOutlet, SegmentedComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-results-map' },
  styleUrl: './results-map.scss',
  template: `
    <div class="syn-rmap" [attr.data-layout]="layout()">
      @if (showToggle()) {
        <div class="syn-rmap__toolbar">
          <syn-segmented
            size="sm"
            ariaLabel="Vista"
            [options]="layoutOptions()"
            [value]="layout()"
            (valueChange)="onLayoutChange($event)"
          />
        </div>
      }

      <div class="syn-rmap__body">
        <!-- List pane -->
        @if (layout() !== 'map') {
          <div class="syn-rmap__list-pane">
            @if (loading()) {
              <p class="syn-rmap__empty" role="status">
                {{ config().loadingMessage || 'Cargando…' }}
              </p>
            } @else if (items().length === 0) {
              <p class="syn-rmap__empty">
                {{ config().emptyMessage || 'No encontramos resultados en esta zona.' }}
              </p>
            } @else {
              <ol class="syn-rmap__list">
                @for (item of items(); track $index) {
                  <li
                    class="syn-rmap__list-item"
                    [class.is-hovered]="hoveredIndex() === $index"
                    (mouseenter)="hover($index)"
                    (mouseleave)="unhover()"
                  >
                    <ng-container
                      [ngTemplateOutlet]="itemTemplate()"
                      [ngTemplateOutletContext]="itemContext(item, $index)"
                    />
                  </li>
                }
              </ol>
            }
          </div>
        }

        <!-- Map pane -->
        @if (layout() !== 'list') {
          <div class="syn-rmap__map" [attr.aria-label]="config().mapAriaLabel || 'Mapa de resultados'">
            <div class="syn-rmap__canvas">
              <div class="syn-rmap__grid" aria-hidden="true"></div>
              @for (pin of pins(); track pin.index) {
                <button
                  type="button"
                  class="syn-rmap__pin"
                  [class.is-hovered]="hoveredIndex() === pin.index"
                  [style.left.%]="pin.x"
                  [style.top.%]="pin.y"
                  [attr.aria-label]="pin.label"
                  (mouseenter)="hover(pin.index)"
                  (mouseleave)="unhover()"
                  (focus)="hover(pin.index)"
                  (blur)="unhover()"
                  (click)="selectPin(pin)"
                >
                  {{ pin.label }}
                </button>
              }
              @if (showControls()) {
                <div class="syn-rmap__zoom" role="group" aria-label="Zoom">
                  <button type="button" class="syn-rmap__zoom-btn" aria-label="Acercar" (click)="zoomIn()">+</button>
                  <button type="button" class="syn-rmap__zoom-btn" aria-label="Alejar" (click)="zoomOut()">−</button>
                </div>
                <div class="syn-rmap__pan" role="group" aria-label="Mover el mapa">
                  <button type="button" class="syn-rmap__pan-btn" aria-label="Norte" (click)="pan(0, 1)">↑</button>
                  <button type="button" class="syn-rmap__pan-btn" aria-label="Sur" (click)="pan(0, -1)">↓</button>
                  <button type="button" class="syn-rmap__pan-btn" aria-label="Oeste" (click)="pan(-1, 0)">←</button>
                  <button type="button" class="syn-rmap__pan-btn" aria-label="Este" (click)="pan(1, 0)">→</button>
                </div>
              }
            </div>
            @if (showControls()) {
              <div class="syn-rmap__controls">
                <label class="syn-rmap__check">
                  <input
                    type="checkbox"
                    [checked]="searchAsIMove()"
                    (change)="toggleSearchAsIMove()"
                  />
                  {{ config().searchAsIMoveLabel || 'Buscar al mover el mapa' }}
                </label>
                @if (!searchAsIMove()) {
                  <button type="button" class="syn-rmap__area-btn" (click)="searchThisArea()">
                    {{ config().searchAreaLabel || 'Buscar en esta zona' }}
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class ResultsMapComponent<TItem> {
  // ─── Inputs ────────────────────────────────────────────────────────────────
  readonly config = input<ResultsMapConfig>({});
  readonly items = input<readonly TItem[]>([]);
  readonly loading = input(false);
  /** Geo accessor — items without geo simply get no pin. */
  readonly geoOf = input.required<(item: TItem) => GeoPoint | null>();
  /** Pin label accessor (e.g. compact price). Default: 1-based index. */
  readonly pinLabelOf = input<((item: TItem) => string) | null>(null);
  /** How to render one list result. Context: item, `index`, `hovered`, `select()`. */
  readonly itemTemplate = input.required<TemplateRef<ResultsMapItemContext<TItem>>>();

  // ─── Outputs ───────────────────────────────────────────────────────────────
  /** A pin (or a template's `select()`) picked an item. */
  readonly pinselect = output<TItem>();
  /** "Buscar en esta zona" — the consumer re-queries within these bounds. */
  readonly boundschange = output<GeoBounds>();
  readonly layoutchange = output<ResultsMapLayout>();

  readonly fieldId = `syn-results-map-${(resultsMapInstanceId += 1)}`;

  // ─── State ─────────────────────────────────────────────────────────────────
  /** Follows the configured layout whenever the config changes. */
  readonly layout = linkedSignal<ResultsMapLayout>(() => this.config().layout ?? 'split');
  readonly showToggle = computed(() => this.config().showToggle ?? true);
  /** The three layout segments for the `syn-segmented` toggle (labels from config). */
  readonly layoutOptions = computed<readonly SegmentedOption[]>(() => {
    const config = this.config();
    return [
      { value: 'list', label: config.listLabel || 'Lista' },
      { value: 'split', label: config.splitLabel || 'Dividido' },
      { value: 'map', label: config.mapLabel || 'Mapa' },
    ];
  });
  readonly showControls = computed(() => this.config().showControls ?? true);
  readonly hoveredIndex = signal(-1);
  readonly searchAsIMove = signal(false);

  /** Geo points for the current items (aligned by index; null = no pin). */
  readonly points = computed<readonly (GeoPoint | null)[]>(() => {
    const geoOf = this.geoOf();
    return this.items().map((item) => geoOf(item));
  });

  /**
   * Current viewport: configured bounds win; otherwise auto-fit the pins.
   * Re-fits whenever the items (or config bounds) change; zoom/pan overrides it
   * until the next change.
   */
  readonly viewport = linkedSignal<GeoBounds>(() => {
    const fixed = this.config().bounds;
    if (fixed) {
      return fixed;
    }
    const present = this.points().filter((point): point is GeoPoint => point !== null);
    return fitBounds(present) ?? DEFAULT_BOUNDS;
  });

  /** Pins projected onto the frame (equirectangular % within the viewport). */
  readonly pins = computed<readonly ProjectedPin<TItem>[]>(() => {
    const bounds = this.viewport();
    const { lat: latSpan, lng: lngSpan } = span(bounds);
    const labelOf = this.pinLabelOf();
    const pins: ProjectedPin<TItem>[] = [];
    this.points().forEach((point, index) => {
      if (!point) {
        return;
      }
      const item = this.items()[index];
      pins.push({
        item,
        index,
        x: clampPct(((point.lng - bounds.minLng) / lngSpan) * 100),
        y: clampPct((1 - (point.lat - bounds.minLat) / latSpan) * 100),
        label: labelOf ? labelOf(item) : String(index + 1),
      });
    });
    return pins;
  });

  // ─── Actions ───────────────────────────────────────────────────────────────
  setLayout(layout: ResultsMapLayout): void {
    if (layout === this.layout()) {
      return;
    }
    this.layout.set(layout);
    this.layoutchange.emit(layout);
  }

  /** Adapts `syn-segmented`'s string emission back to the typed layout contract. */
  onLayoutChange(value: string): void {
    this.setLayout(value as ResultsMapLayout);
  }

  hover(index: number): void {
    this.hoveredIndex.set(index);
  }

  unhover(): void {
    this.hoveredIndex.set(-1);
  }

  selectPin(pin: ProjectedPin<TItem>): void {
    this.pinselect.emit(pin.item);
  }

  zoomIn(): void {
    this.scaleViewport(ZOOM_IN_FACTOR);
  }

  zoomOut(): void {
    this.scaleViewport(ZOOM_OUT_FACTOR);
  }

  /** Pan by one step; `dx` is east-positive, `dy` is north-positive. */
  pan(dx: number, dy: number): void {
    const bounds = this.viewport();
    const { lat: latSpan, lng: lngSpan } = span(bounds);
    this.applyViewport({
      minLat: bounds.minLat + dy * latSpan * PAN_STEP,
      maxLat: bounds.maxLat + dy * latSpan * PAN_STEP,
      minLng: bounds.minLng + dx * lngSpan * PAN_STEP,
      maxLng: bounds.maxLng + dx * lngSpan * PAN_STEP,
    });
  }

  toggleSearchAsIMove(): void {
    this.searchAsIMove.update((on) => !on);
  }

  /** Explicit "buscar en esta zona" — always emits the current viewport. */
  searchThisArea(): void {
    this.boundschange.emit(this.viewport());
  }

  itemContext(item: TItem, index: number): ResultsMapItemContext<TItem> {
    return {
      $implicit: item,
      index,
      hovered: this.hoveredIndex() === index,
      select: () => this.pinselect.emit(item),
    };
  }

  // ─── Internals ─────────────────────────────────────────────────────────────
  private scaleViewport(factor: number): void {
    const bounds = this.viewport();
    const { lat: latSpan, lng: lngSpan } = span(bounds);
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const centerLng = (bounds.minLng + bounds.maxLng) / 2;
    this.applyViewport({
      minLat: centerLat - (latSpan * factor) / 2,
      maxLat: centerLat + (latSpan * factor) / 2,
      minLng: centerLng - (lngSpan * factor) / 2,
      maxLng: centerLng + (lngSpan * factor) / 2,
    });
  }

  private applyViewport(bounds: GeoBounds): void {
    this.viewport.set(bounds);
    if (this.searchAsIMove()) {
      this.boundschange.emit(bounds);
    }
  }
}
