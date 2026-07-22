import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { InitialDataService } from '@synergos/core';
import {
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynMapPin</c>.
 *
 * A keyless static map centered on a coordinate, with one or more pins.
 * The map surface is an OpenStreetMap embed (iframe) — no API key, no
 * client-side JS map engine — and an accessible, keyboard-navigable pin
 * list overlays the surface. Built for the PROPIEDADES vertical
 * (ubicación de un inmueble) and BOOKING / EVENTOS (cómo llegar).
 *
 * Selecting a pin emits a `pinselect` CustomEvent carrying the pin plus
 * its index, and re-centers the embed on that pin.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes
 * win over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface MapPinRuntimeConfig {
  readonly centerLat?: number;
  readonly centerLng?: number;
  readonly zoomLevel?: number;
  readonly pins?: readonly MapPinConfig[];
  readonly integration?: string;
}

export interface MapPinConfig {
  readonly lat?: number | string;
  readonly lng?: number | string;
  readonly label?: string;
  readonly description?: string;
  readonly href?: string;
}

/** A pin after normalization — always has finite coordinates and a label. */
export interface MapPin {
  readonly lat: number;
  readonly lng: number;
  readonly label: string;
  readonly description: string;
  readonly href: string;
}

/** Emitted on the `pinselect` CustomEvent and the typed Angular output. */
export interface MapPinSelectDetail {
  readonly index: number;
  readonly pin: MapPin;
}

/** Embed providers. `static`/`iframe` fall back to the same OSM embed (no key). */
export type MapIntegration = 'osm' | 'iframe' | 'static';

const INTEGRATIONS: readonly MapIntegration[] = ['osm', 'iframe', 'static'];

const DEFAULT_CENTER_LAT = 4.711; // Bogotá, D.C. — sensible es-CO default.
const DEFAULT_CENTER_LNG = -74.0721;
const DEFAULT_ZOOM = 13;
const MIN_ZOOM = 1;
const MAX_ZOOM = 19;
const LAT_LIMIT = 90;
const LNG_LIMIT = 180;
/** Width (deg) of the OSM bbox at zoom 0; halves with each zoom step. */
const BBOX_BASE_SPAN = 360;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Parse a coordinate to a finite number, or null when unparseable. */
export function parseCoordinate(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Coerce + clamp a latitude, falling back to `fallback` when invalid. */
export function clampLat(value: unknown, fallback: number): number {
  const parsed = parseCoordinate(value);
  return parsed === null ? fallback : clamp(parsed, -LAT_LIMIT, LAT_LIMIT);
}

/** Coerce + clamp a longitude, falling back to `fallback` when invalid. */
export function clampLng(value: unknown, fallback: number): number {
  const parsed = parseCoordinate(value);
  return parsed === null ? fallback : clamp(parsed, -LNG_LIMIT, LNG_LIMIT);
}

/** Coerce + clamp a zoom level to the OSM-supported range. */
export function clampZoom(value: unknown, fallback: number): number {
  const parsed = parseCoordinate(value);
  if (parsed === null) {
    return fallback;
  }
  return clamp(Math.round(parsed), MIN_ZOOM, MAX_ZOOM);
}

/** Drop pins lacking finite coordinates; default the label to its position. */
export function normalizePins(value: unknown): readonly MapPin[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index): MapPin | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const lat = parseCoordinate(entry['lat']);
      const lng = parseCoordinate(entry['lng']);
      if (lat === null || lng === null) {
        return null;
      }

      const label = readString(entry['label']).trim();
      return {
        lat: clamp(lat, -LAT_LIMIT, LAT_LIMIT),
        lng: clamp(lng, -LNG_LIMIT, LNG_LIMIT),
        label: label || `Ubicación ${index + 1}`,
        description: readString(entry['description']).trim(),
        href: readString(entry['href']).trim() || readString(entry['url']).trim(),
      };
    })
    .filter((pin): pin is MapPin => pin !== null);
}

/**
 * Build the keyless OpenStreetMap embed URL for a center + zoom, with an
 * optional marker. Lower zoom → wider bbox (rough power-of-two mapping).
 */
export function buildOsmEmbedUrl(lat: number, lng: number, zoom: number, marker: boolean): string {
  const span = BBOX_BASE_SPAN / Math.pow(2, clamp(zoom, MIN_ZOOM, MAX_ZOOM));
  const latSpan = span / 2;
  const lngSpan = span;
  const left = clamp(lng - lngSpan, -LNG_LIMIT, LNG_LIMIT);
  const right = clamp(lng + lngSpan, -LNG_LIMIT, LNG_LIMIT);
  const bottom = clamp(lat - latSpan, -LAT_LIMIT, LAT_LIMIT);
  const top = clamp(lat + latSpan, -LAT_LIMIT, LAT_LIMIT);

  const params = new URLSearchParams({
    bbox: `${left},${bottom},${right},${top}`,
    layer: 'mapnik',
  });
  if (marker) {
    params.set('marker', `${lat},${lng}`);
  }
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}

/** Human-facing OSM link that opens the full map at the same view. */
export function buildOsmViewUrl(lat: number, lng: number, zoom: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
}

function sanitizeMapPinConfig(value: Partial<MapPinRuntimeConfig>): MapPinRuntimeConfig {
  return omitUndefinedProperties<MapPinRuntimeConfig>({
    centerLat: typeof value.centerLat === 'number' ? value.centerLat : undefined,
    centerLng: typeof value.centerLng === 'number' ? value.centerLng : undefined,
    zoomLevel: typeof value.zoomLevel === 'number' ? value.zoomLevel : undefined,
    pins: value.pins,
    integration: coerceTrimmedStringInput(value.integration),
  });
}

@Component({
  selector: 'sg-map-pin',
  standalone: true,
  templateUrl: './map-pin.html',
  styleUrl: './map-pin.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-map-pin' },
})
export class MapPinElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #sanitizer = inject(DomSanitizer);

  readonly config = input<MapPinRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<MapPinRuntimeConfig>(sanitizeMapPinConfig),
  });
  readonly centerLatInput = input<number | undefined, unknown>(undefined, {
    alias: 'centerLat',
    transform: coerceOptionalNumberInput,
  });
  readonly centerLngInput = input<number | undefined, unknown>(undefined, {
    alias: 'centerLng',
    transform: coerceOptionalNumberInput,
  });
  readonly zoomLevelInput = input<number | undefined, unknown>(undefined, {
    alias: 'zoomLevel',
    transform: coerceOptionalNumberInput,
  });
  readonly pinsJsonInput = input<string | undefined>(undefined, { alias: 'pinsJson' });
  readonly integrationInput = input<string | undefined>(undefined, { alias: 'integration' });

  /** Typed Angular output mirroring the native `pinselect` CustomEvent. */
  readonly pinselect = output<MapPinSelectDetail>();

  /** Index of the highlighted pin, or null for "center on default view". */
  readonly #activeIndex = signal<number | null>(null);
  readonly activeIndex = this.#activeIndex.asReadonly();

  readonly integration = computed<MapIntegration>(() => {
    const raw = resolveConfigValue(this.integrationInput(), this.config()?.integration, 'osm');
    const lowered = raw.toLowerCase();
    return INTEGRATIONS.includes(lowered as MapIntegration) ? (lowered as MapIntegration) : 'osm';
  });

  readonly pins = computed<readonly MapPin[]>(() =>
    normalizePins(this.resolveSource(this.pinsJsonInput(), this.config()?.pins)),
  );

  readonly hasPins = computed(() => this.pins().length > 0);

  /** Configured center, falling back to the first pin, then the es-CO default. */
  readonly centerLat = computed(() => {
    const explicit = resolveConfigValue(this.centerLatInput(), this.config()?.centerLat, NaN);
    if (Number.isFinite(explicit)) {
      return clampLat(explicit, DEFAULT_CENTER_LAT);
    }
    return this.pins()[0]?.lat ?? DEFAULT_CENTER_LAT;
  });

  readonly centerLng = computed(() => {
    const explicit = resolveConfigValue(this.centerLngInput(), this.config()?.centerLng, NaN);
    if (Number.isFinite(explicit)) {
      return clampLng(explicit, DEFAULT_CENTER_LNG);
    }
    return this.pins()[0]?.lng ?? DEFAULT_CENTER_LNG;
  });

  readonly zoomLevel = computed(() =>
    clampZoom(resolveConfigValue(this.zoomLevelInput(), this.config()?.zoomLevel, NaN), DEFAULT_ZOOM),
  );

  /** The pin currently focused by the embed, if any. */
  readonly activePin = computed<MapPin | null>(() => {
    const index = this.#activeIndex();
    return index === null ? null : (this.pins()[index] ?? null);
  });

  /** Lat/Lng the embed should center on: the active pin, else the center. */
  readonly viewLat = computed(() => this.activePin()?.lat ?? this.centerLat());
  readonly viewLng = computed(() => this.activePin()?.lng ?? this.centerLng());

  /** Keyless OSM embed URL reflecting the current view. */
  readonly embedUrl = computed(() =>
    buildOsmEmbedUrl(this.viewLat(), this.viewLng(), this.zoomLevel(), this.hasPins()),
  );

  /**
   * La MISMA url, envuelta para poder atarla al `src` del iframe.
   *
   * Angular trata el `src` de un <iframe> como *resource URL context*: exige un
   * `SafeResourceUrl` y ante un string lanza NG0904 **durante la detección de cambios**,
   * o sea que el componente reventaba en CADA render — no fallaba el mapa, fallaba el
   * elemento entero. Llevaba así desde siempre y no se veía porque su spec, que lo
   * atrapaba en los 4 casos, no tenía target `test` que lo ejecutara.
   *
   * El bypass es seguro POR CONSTRUCCIÓN, y esa es la única razón por la que se permite:
   * `buildOsmEmbedUrl` no interpola ni una cadena del usuario — arma la query sólo con
   * números (lat/lng/zoom, los tres pasados por `clamp`) sobre un origen literal de
   * openstreetmap.org. ⚠️ Si algún día esa función acepta texto del editor, este bypass
   * deja de ser legítimo y pasa a ser un XSS: habría que validar el origen antes.
   */
  readonly embedSrc = computed<SafeResourceUrl>(() =>
    this.#sanitizer.bypassSecurityTrustResourceUrl(this.embedUrl()),
  );

  /** Full-map link for the "Ver mapa completo" affordance. */
  readonly viewUrl = computed(() =>
    buildOsmViewUrl(this.viewLat(), this.viewLng(), this.zoomLevel()),
  );

  /** Accessible title surfaced on the iframe. */
  readonly frameTitle = computed(() => {
    const active = this.activePin();
    if (active) {
      return `Mapa centrado en ${active.label}`;
    }
    return `Mapa centrado en ${this.centerLat().toFixed(4)}, ${this.centerLng().toFixed(4)}`;
  });

  /** Index that should carry tabindex=0 inside the pin list (roving). */
  readonly focusedIndex = computed<number>(() => {
    const active = this.#activeIndex();
    if (active !== null && active < this.pins().length) {
      return active;
    }
    return this.hasPins() ? 0 : -1;
  });

  selectPin(index: number): void {
    const pin = this.pins()[index];
    if (!pin) {
      return;
    }
    this.#activeIndex.set(index);
    this.pinselect.emit({ index, pin });
  }

  isActive(index: number): boolean {
    return this.#activeIndex() === index;
  }

  /** Roving keyboard navigation across the pin list. */
  onPinKeydown(event: KeyboardEvent, index: number): void {
    const total = this.pins().length;
    if (total === 0) {
      return;
    }

    const handlers: Record<string, () => void> = {
      ArrowDown: () => this.focusPin((index + 1) % total),
      ArrowRight: () => this.focusPin((index + 1) % total),
      ArrowUp: () => this.focusPin((index - 1 + total) % total),
      ArrowLeft: () => this.focusPin((index - 1 + total) % total),
      Home: () => this.focusPin(0),
      End: () => this.focusPin(total - 1),
      Enter: () => this.selectPin(index),
      ' ': () => this.selectPin(index),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  private focusPin(index: number): void {
    this.selectPin(index);
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const host = document.querySelector('sg-map-pin, synergos-map-pin');
      const root = host?.shadowRoot ?? document;
      const target = (root as ParentNode).querySelector<HTMLElement>(`[data-pin-index="${index}"]`);
      target?.focus();
    });
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
