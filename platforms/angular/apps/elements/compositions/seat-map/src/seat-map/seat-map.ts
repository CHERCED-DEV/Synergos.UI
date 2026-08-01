import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  IconComponent,
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynSeatMap</c>.
 *
 * Cabin seat map for the AEROLÍNEAS vertical (doc 18). The map renders the
 * physical seat layout of an aircraft cabin: an ordered list of rows, each
 * with its columns of seats split by the aisle. Every seat carries a type
 * (window/aisle/middle/extra-legroom), an availability flag and an optional
 * price (extra-legroom and premium seats usually cost extra).
 *
 * Inputs are flat for CMS authoring convenience:
 *   - `seatmap` (JSON): the cabin layout (rows + aisle position);
 *   - `currency` (ISO, default COP) for the per-seat price labels;
 *   - `maxSelectable` (default 1) for the number of seats a passenger may pick.
 *
 * The shared `@synergos/contracts` package does not (yet) declare a
 * `SeatMapElementConfig`; the canonical shape lives here next to the component
 * until that contract is added in a registry ola.
 */
export interface SeatMapRuntimeConfig {
  readonly seatmap?: SeatMapLayoutConfig;
  readonly currency?: string;
  readonly maxSelectable?: number;
}

/** Raw layout payload (the `seatmap` config). */
export interface SeatMapLayoutConfig {
  readonly rows?: readonly SeatRowConfig[];
  /** Aisle is drawn after this many columns (1-based). Default: half the row. */
  readonly aisleAfterColumns?: number;
}

export interface SeatRowConfig {
  readonly rowNumber?: number | string;
  readonly seats?: readonly SeatConfig[];
  /**
   * Clase de servicio de la fila: `first` | `business` | `premium` | `economy`
   * en una cabina, o el nombre de la zona en un recinto. Vive en la FILA y no
   * en la butaca porque las secciones de una cabina son rangos contiguos de
   * filas — es donde el dato es verdad sin repetirse seis veces por fila.
   *
   * Vocabulario ABIERTO: cualquier cadena vale y se rotula tal cual si no es
   * una de las conocidas. Una clase nueva de un proveedor no debe exigir
   * republicar este bundle.
   */
  readonly serviceClass?: string;
}

export type SeatType = 'window' | 'aisle' | 'middle' | 'extra-legroom';

export interface SeatConfig {
  readonly id?: string;
  /**
   * POSICIÓN de la butaca: `window` | `aisle` | `middle`.
   *
   * Acepta además el legado `extra-legroom`, que mezclaba posición con confort:
   * cuando llega, se traduce a la feature del mismo nombre y la posición cae a
   * `middle` — exactamente lo que hacía antes. Las cargas nuevas mandan la
   * posición aquí y el confort en `features`, y así dejan de pisarse.
   */
  readonly type?: string;
  readonly available?: boolean;
  readonly price?: number;
  /**
   * Rasgos que cambian lo que el pasajero recibe: `extra-legroom`, `exit-row`,
   * `bulkhead`, `recline-limited`… Vocabulario ABIERTO — uno desconocido se
   * pinta con su propio texto en vez de descartarse.
   *
   * `exit-row` se declara aparte de `extra-legroom` a propósito: una fila de
   * salida tiene consecuencias regulatorias (edad mínima, nada en el piso) que
   * "más espacio" no tiene.
   */
  readonly features?: readonly string[];
}

/** Internal, fully-resolved seat (always valid). */
export interface Seat {
  readonly id: string;
  readonly type: SeatType;
  readonly available: boolean;
  readonly price: number;
  /** 1-based column index within the row, used for the seat letter + aria. */
  readonly column: number;
  /** Column letter (A, B, C …) derived from the column index. */
  readonly letter: string;
  /** Rasgos normalizados (minúsculas, sin repetidos, sin vacíos). */
  readonly features: readonly string[];
}

/** Internal, fully-resolved row. */
export interface SeatRow {
  readonly rowNumber: string;
  readonly seats: readonly Seat[];
  /** Clase de servicio normalizada, o null si la carga no la declara. */
  readonly serviceClass: string | null;
}

/** Una fila con el encabezado de sección que le corresponde, si abre una. */
export interface SeatRowView {
  readonly row: SeatRow;
  /**
   * Rótulo de la sección que ESTA fila abre, o null si continúa la anterior.
   * Se calcula al vuelo y no se guarda en la fila: es presentación, y una fila
   * no sabe si es la primera de su tramo.
   */
  readonly sectionLabel: string | null;
}

/** Payload emitted on the `seatselect` CustomEvent. */
export interface SeatSelection {
  readonly selected: readonly string[];
}

const DEFAULT_CURRENCY = 'COP';
const DEFAULT_MAX_SELECTABLE = 1;
const SEAT_TYPES: readonly SeatType[] = ['window', 'aisle', 'middle', 'extra-legroom'];
const COLUMN_LETTERS = 'ABCDEFGHJK'; // skip "I" (looks like 1), airline convention

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readSeatType(value: unknown): SeatType {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (SEAT_TYPES.find((type) => type === normalized) as SeatType) ?? 'middle';
}

function columnLetter(column: number): string {
  const index = column - 1;
  return index >= 0 && index < COLUMN_LETTERS.length
    ? COLUMN_LETTERS[index]
    : String(column);
}

/** Format a numeric amount in es-CO for the given ISO currency. */
export function formatSeatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${new Intl.NumberFormat('es-CO').format(amount)}`;
  }
}

/**
 * Rasgos que este bundle sabe rotular. La lista es ABIERTA: uno que no esté
 * aquí se pinta con su propio texto en vez de descartarse, porque el
 * vocabulario lo pone el proveedor del mapa y no este componente.
 */
const FEATURE_LABELS: Readonly<Record<string, string>> = {
  'extra-legroom': 'Espacio extra',
  'exit-row': 'Fila de salida',
  bulkhead: 'Mamparo',
  'recline-limited': 'Reclinación limitada',
};

/**
 * Clases de servicio conocidas. Misma regla: una desconocida se rotula tal cual
 * en vez de descartarse.
 */
const SERVICE_CLASS_LABELS: Readonly<Record<string, string>> = {
  first: 'Primera',
  business: 'Ejecutiva',
  premium: 'Premium',
  economy: 'Económica',
};

/** Rótulo es-CO de un rasgo. Uno desconocido se muestra tal cual llegó. */
export function seatFeatureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

/** Rótulo es-CO de una clase de servicio. Una desconocida se muestra tal cual. */
export function serviceClassLabel(serviceClass: string): string {
  return SERVICE_CLASS_LABELS[serviceClass] ?? serviceClass;
}

/**
 * Normaliza la lista de rasgos: minúsculas, sin espacios, sin vacíos y sin
 * repetidos, conservando el orden en que llegaron.
 */
function readFeatures(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    const normalized = entry.trim().toLowerCase();
    if (normalized !== '') {
      seen.add(normalized);
    }
  }
  return [...seen];
}

/** Human label for a seat type (es-CO), used in aria + the legend. */
export function seatTypeLabel(type: SeatType): string {
  switch (type) {
    case 'window':
      return 'Ventana';
    case 'aisle':
      return 'Pasillo';
    case 'extra-legroom':
      return 'Espacio extra';
    case 'middle':
    default:
      return 'Centro';
  }
}

/**
 * Normalizes a raw `seatmap` payload into valid rows. Out-of-shape entries are
 * dropped; seats without an id are skipped (an id is required to select them).
 */
export function normalizeRows(value: unknown): readonly SeatRow[] {
  const source = isRecord(value) ? value['rows'] : value;
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((entry, index) => normalizeRow(entry, index))
    .filter((row): row is SeatRow => row !== null);
}

function normalizeRow(entry: unknown, rowIndex: number): SeatRow | null {
  if (!isRecord(entry)) {
    return null;
  }

  const rawSeats = Array.isArray(entry['seats']) ? entry['seats'] : [];
  const seats = rawSeats
    .map((seat, seatIndex) => normalizeSeat(seat, seatIndex))
    .filter((seat): seat is Seat => seat !== null);

  if (seats.length === 0) {
    return null;
  }

  const rowNumberRaw = entry['rowNumber'];
  const rowNumber =
    typeof rowNumberRaw === 'string' && rowNumberRaw.trim() !== ''
      ? rowNumberRaw.trim()
      : String(readNumber(rowNumberRaw) ?? rowIndex + 1);

  const serviceClassRaw = entry['serviceClass'];
  const serviceClass =
    typeof serviceClassRaw === 'string' && serviceClassRaw.trim() !== ''
      ? serviceClassRaw.trim().toLowerCase()
      : null;

  return { rowNumber, seats, serviceClass };
}

function normalizeSeat(entry: unknown, seatIndex: number): Seat | null {
  if (!isRecord(entry)) {
    return null;
  }

  const id = typeof entry['id'] === 'string' ? entry['id'].trim() : '';
  if (!id) {
    return null;
  }

  const column = seatIndex + 1;
  const priceRaw = readNumber(entry['price']);
  const price = priceRaw !== null && priceRaw > 0 ? priceRaw : 0;

  // El legado mandaba `type: 'extra-legroom'`, que PISABA la posición. Se
  // traduce a la feature del mismo nombre y la posición cae a 'middle' —
  // exactamente lo que hacía antes, pero sin perder el rasgo.
  const rawType = readSeatType(entry['type']);
  const legacyLegroom = rawType === 'extra-legroom';

  const features = readFeatures(entry['features']);
  const merged = legacyLegroom && !features.includes('extra-legroom')
    ? ['extra-legroom', ...features]
    : features;

  return {
    id,
    type: legacyLegroom ? 'middle' : rawType,
    available: entry['available'] !== false,
    price,
    column,
    letter: columnLetter(column),
    features: merged,
  };
}

function sanitizeSeatMapConfig(
  value: Partial<SeatMapRuntimeConfig>,
): SeatMapRuntimeConfig {
  return omitUndefinedProperties<SeatMapRuntimeConfig>({
    seatmap: isRecord(value.seatmap) ? (value.seatmap as SeatMapLayoutConfig) : undefined,
    currency: coerceTrimmedStringInput(value.currency),
    maxSelectable: coerceOptionalNumberInput(value.maxSelectable),
  });
}

let seatMapInstanceId = 0;

@Component({
  selector: 'sg-seat-map',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './seat-map.html',
  styleUrl: './seat-map.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-seat-map' },
})
export class SeatMapElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly config = input<SeatMapRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SeatMapRuntimeConfig>(sanitizeSeatMapConfig),
  });
  readonly seatmapInput = input<string | undefined>(undefined, { alias: 'seatmap' });
  readonly currencyInput = input<string | undefined>(undefined, { alias: 'currency' });
  readonly maxSelectableInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxSelectable',
    transform: coerceOptionalNumberInput,
  });

  /** Emits the full selection (seat ids) whenever it changes. */
  readonly seatselect = output<SeatSelection>();

  readonly fieldId = `syn-seat-map-${(seatMapInstanceId += 1)}`;

  readonly currency = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.currencyInput()),
      this.config()?.currency,
      DEFAULT_CURRENCY,
    ),
  );

  readonly maxSelectable = computed(() => {
    const resolved = resolveConfigValue(
      this.maxSelectableInput(),
      this.config()?.maxSelectable,
      DEFAULT_MAX_SELECTABLE,
    );
    return resolved >= 1 ? Math.trunc(resolved) : DEFAULT_MAX_SELECTABLE;
  });

  /** The resolved cabin rows (seeded once from config/attribute). */
  readonly rows = signal<readonly SeatRow[]>([]);

  /** The live set of selected seat ids (insertion order preserved). */
  readonly selected = signal<readonly string[]>([]);

  /** Aisle is drawn after this 1-based column index (0 = no aisle). */
  readonly aisleAfterColumns = signal(0);

  #seeded = false;

  // ─── Derived state ─────────────────────────────────────────────────────────
  readonly hasRows = computed(() => this.rows().length > 0);

  readonly totalSeats = computed(() =>
    this.rows().reduce((sum, row) => sum + row.seats.length, 0),
  );

  readonly availableSeats = computed(() =>
    this.rows().reduce(
      (sum, row) => sum + row.seats.filter((seat) => seat.available).length,
      0,
    ),
  );

  /**
   * Las filas con el encabezado de sección que abre cada una.
   *
   * El encabezado se emite cuando la clase de servicio CAMBIA respecto de la
   * fila anterior, que es como una cabina se lee de verdad: tramos contiguos.
   * Si la carga no declara ninguna clase, no se emite ni un encabezado y el
   * mapa se ve exactamente como antes.
   */
  readonly rowViews = computed<readonly SeatRowView[]>(() => {
    let previous: string | null = null;
    return this.rows().map((row) => {
      const opensSection = row.serviceClass !== null && row.serviceClass !== previous;
      previous = row.serviceClass;
      return {
        row,
        sectionLabel: opensSection ? serviceClassLabel(row.serviceClass!) : null,
      };
    });
  });

  /**
   * Los rasgos PRESENTES en este mapa, para la leyenda.
   *
   * Se derivan del contenido y no de una lista fija: un mapa sin filas de
   * salida no debe explicar qué es una fila de salida.
   */
  readonly presentFeatures = computed<readonly string[]>(() => {
    const seen = new Set<string>();
    for (const row of this.rows()) {
      for (const seat of row.seats) {
        for (const feature of seat.features) {
          seen.add(feature);
        }
      }
    }
    return [...seen];
  });

  /** Total price of the current selection. */
  readonly selectedTotal = computed(() => {
    const ids = new Set(this.selected());
    return this.rows().reduce(
      (sum, row) =>
        sum + row.seats.reduce((acc, seat) => (ids.has(seat.id) ? acc + seat.price : acc), 0),
      0,
    );
  });

  readonly selectedTotalFormatted = computed(() =>
    formatSeatPrice(this.selectedTotal(), this.currency()),
  );

  /** "N de M asientos · $X" live summary (es-CO, singular/plural aware). */
  readonly summary = computed(() => {
    const count = this.selected().length;
    const max = this.maxSelectable();
    const seatWord = max === 1 ? 'asiento' : 'asientos';
    const head = `${count} de ${max} ${seatWord} seleccionado${count === 1 ? '' : 's'}`;
    return this.selectedTotal() > 0 ? `${head} · ${this.selectedTotalFormatted()}` : head;
  });

  readonly atSelectionLimit = computed(() => this.selected().length >= this.maxSelectable());

  trackRow(_index: number, row: SeatRow): string {
    return row.rowNumber;
  }

  trackSeat(_index: number, seat: Seat): string {
    return seat.id;
  }

  isSelected(seat: Seat): boolean {
    return this.selected().includes(seat.id);
  }

  /** A seat is pickable if available AND (already selected OR below the cap). */
  canSelect(seat: Seat): boolean {
    if (!seat.available) {
      return false;
    }
    return this.isSelected(seat) || !this.atSelectionLimit();
  }

  /** True when the aisle gap should be drawn AFTER this seat's column. */
  showAisleAfter(seat: Seat): boolean {
    return this.aisleAfterColumns() > 0 && seat.column === this.aisleAfterColumns();
  }

  priceLabel(seat: Seat): string {
    return seat.price > 0 ? formatSeatPrice(seat.price, this.currency()) : '';
  }

  /** Full state label for a seat (used by aria + tooltip). */
  seatStateLabel(seat: Seat): string {
    if (!seat.available) {
      return 'ocupado';
    }
    return this.isSelected(seat) ? 'seleccionado' : 'disponible';
  }

  /** Composed aria-label: row, column letter, type, price, state. */
  seatAriaLabel(seat: Seat, row: SeatRow): string {
    const parts = [
      `Asiento ${row.rowNumber}${seat.letter}`,
      seatTypeLabel(seat.type),
    ];
    // La clase de servicio va en el aria aunque el encabezado de sección ya la
    // diga: quien navega con lector de pantalla salta de botón en botón y no
    // necesariamente oyó el encabezado.
    if (row.serviceClass !== null) {
      parts.push(serviceClassLabel(row.serviceClass));
    }
    for (const feature of seat.features) {
      parts.push(seatFeatureLabel(feature));
    }
    if (seat.price > 0) {
      parts.push(this.priceLabel(seat));
    }
    parts.push(this.seatStateLabel(seat));
    return parts.join(', ');
  }

  // ─── Selection ─────────────────────────────────────────────────────────────
  toggleSeat(seat: Seat): void {
    if (!seat.available) {
      return;
    }

    const current = this.selected();
    if (current.includes(seat.id)) {
      this.commit(current.filter((id) => id !== seat.id));
      return;
    }

    // When the cap is 1, picking a new seat replaces the previous one.
    if (this.maxSelectable() === 1) {
      this.commit([seat.id]);
      return;
    }

    if (this.atSelectionLimit()) {
      return;
    }
    this.commit([...current, seat.id]);
  }

  // ─── Keyboard navigation (arrow keys move focus across the grid) ────────────
  onSeatKeydown(event: KeyboardEvent, rowIndex: number, seatIndex: number): void {
    const rows = this.rows();
    let nextRow = rowIndex;
    let nextSeat = seatIndex;

    switch (event.key) {
      case 'ArrowRight':
        nextSeat = seatIndex + 1;
        break;
      case 'ArrowLeft':
        nextSeat = seatIndex - 1;
        break;
      case 'ArrowDown':
        nextRow = rowIndex + 1;
        break;
      case 'ArrowUp':
        nextRow = rowIndex - 1;
        break;
      default:
        return;
    }

    if (nextRow < 0 || nextRow >= rows.length) {
      return;
    }
    const targetRow = rows[nextRow];
    if (nextSeat < 0 || nextSeat >= targetRow.seats.length) {
      return;
    }

    event.preventDefault();
    this.focusSeat(targetRow.seats[nextSeat].id);
  }

  /** Si la butaca trae un rasgo. Lo usa la plantilla para las clases CSS. */
  hasFeature(seat: Seat, feature: string): boolean {
    return seat.features.includes(feature);
  }

  /** Rótulo es-CO de un rasgo, para la leyenda y el aria. */
  featureLabel(feature: string): string {
    return seatFeatureLabel(feature);
  }

  trackFeature(_index: number, feature: string): string {
    return feature;
  }

  private focusSeat(seatId: string): void {
    const host = this.#host.nativeElement;
    const target = host.querySelector<HTMLElement>(
      `[data-seat-id="${this.fieldId}-${seatId}"]`,
    );
    target?.focus();
  }

  seedLayout(): void {
    if (this.#seeded) {
      return;
    }
    this.#seeded = true;

    const raw =
      this.seatmapInput() !== undefined
        ? this.#initialData.parseValue<unknown>(this.seatmapInput())
        : this.config()?.seatmap;

    if (raw === undefined || raw === null) {
      return;
    }

    const rows = normalizeRows(raw);
    this.rows.set(rows);

    const aisleRaw = isRecord(raw) ? readNumber(raw['aisleAfterColumns']) : null;
    if (aisleRaw !== null && aisleRaw > 0) {
      this.aisleAfterColumns.set(Math.trunc(aisleRaw));
    } else if (rows.length > 0) {
      // Default: split the widest row roughly in half.
      const widest = rows.reduce((max, row) => Math.max(max, row.seats.length), 0);
      this.aisleAfterColumns.set(widest > 2 ? Math.ceil(widest / 2) : 0);
    }
  }

  ngOnInit(): void {
    this.seedLayout();
  }

  private commit(selected: readonly string[]): void {
    this.selected.set(selected);
    this.seatselect.emit({ selected: [...selected] });
  }
}
