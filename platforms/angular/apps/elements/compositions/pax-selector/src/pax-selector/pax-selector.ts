import {
  ChangeDetectionStrategy,
  Component,
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
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynPaxSelector</c>.
 *
 * Booking occupancy selector for the HOTELES vertical. Occupancy is modelled
 * PER ROOM (not per reservation): the guest picks N rooms, and each room
 * carries its own adults + children, with an explicit age per child.
 *
 * Age bands (configurable per hotel, doc 17 "Reglas de ocupación"):
 *   infante 0-2 · niño 2-12 · adulto 12+.
 *
 * Occupancy rules enforced here:
 *   - min 1 adult per room;
 *   - children always require ≥1 adult (a room can never drop below 1 adult);
 *   - max occupancy per room (config `maxPerRoom`, fire-code cap, default 4);
 *   - up to `maxRooms` rooms (default 5).
 *
 * The shared `@synergos/contracts` package does not (yet) declare a
 * `PaxSelectorElementConfig`; the canonical shape lives here next to the
 * component until that contract is added in the registry ola.
 */
export interface PaxSelectorRuntimeConfig {
  readonly maxRooms?: number;
  readonly maxPerRoom?: number;
  readonly maxChildAge?: number;
  readonly initial?: PaxOccupancyConfig;
}

/** Shape of the `initial` config payload + the emitted occupancy event. */
export interface PaxOccupancyConfig {
  readonly rooms?: readonly PaxRoomConfig[];
}

export interface PaxRoomConfig {
  readonly adults?: number;
  readonly childAges?: readonly number[];
}

/** Internal, fully-resolved room (always valid against the active rules). */
export interface PaxRoom {
  readonly adults: number;
  readonly childAges: readonly number[];
}

/** Payload emitted on the `occupancychange` CustomEvent. */
export interface PaxOccupancy {
  readonly rooms: readonly PaxRoom[];
}

const DEFAULT_MAX_ROOMS = 5;
const DEFAULT_MAX_PER_ROOM = 4;
const DEFAULT_MAX_CHILD_AGE = 17;
const MIN_ADULTS_PER_ROOM = 1;
const CHILD_AGE_FLOOR = 2; // infante 0-2
const ADULT_AGE_FLOOR = 12; // adulto 12+

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createDefaultRoom(): PaxRoom {
  return { adults: MIN_ADULTS_PER_ROOM, childAges: [] };
}

/**
 * Normalizes a raw `initial` payload into valid rooms, clamping every value
 * against the active bounds so the component can never start in an illegal
 * occupancy state. Always returns at least one room.
 */
export function normalizeRooms(
  value: unknown,
  maxRooms: number,
  maxPerRoom: number,
  maxChildAge: number,
): readonly PaxRoom[] {
  const source = isRecord(value) ? value['rooms'] : value;
  if (!Array.isArray(source) || source.length === 0) {
    return [createDefaultRoom()];
  }

  const rooms = source
    .slice(0, maxRooms)
    .map((entry) => normalizeRoom(entry, maxPerRoom, maxChildAge))
    .filter((room): room is PaxRoom => room !== null);

  return rooms.length > 0 ? rooms : [createDefaultRoom()];
}

function normalizeRoom(
  entry: unknown,
  maxPerRoom: number,
  maxChildAge: number,
): PaxRoom | null {
  if (!isRecord(entry)) {
    return null;
  }

  const adults = clamp(
    Math.trunc(readNumber(entry['adults']) ?? MIN_ADULTS_PER_ROOM),
    MIN_ADULTS_PER_ROOM,
    Math.max(MIN_ADULTS_PER_ROOM, maxPerRoom),
  );

  const rawAges = Array.isArray(entry['childAges']) ? entry['childAges'] : [];
  const childAges = rawAges
    .map((age) => readNumber(age))
    .filter((age): age is number => age !== null)
    .map((age) => clamp(Math.trunc(age), 0, maxChildAge))
    // Enforce per-room max occupancy: adults + children ≤ maxPerRoom.
    .slice(0, Math.max(0, maxPerRoom - adults));

  return { adults, childAges };
}

function sanitizePaxSelectorConfig(
  value: Partial<PaxSelectorRuntimeConfig>,
): PaxSelectorRuntimeConfig {
  return omitUndefinedProperties<PaxSelectorRuntimeConfig>({
    maxRooms: coerceOptionalNumberInput(value.maxRooms),
    maxPerRoom: coerceOptionalNumberInput(value.maxPerRoom),
    maxChildAge: coerceOptionalNumberInput(value.maxChildAge),
    initial: isRecord(value.initial) ? (value.initial as PaxOccupancyConfig) : undefined,
  });
}

let paxSelectorInstanceId = 0;

@Component({
  selector: 'sg-pax-selector',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './pax-selector.html',
  styleUrl: './pax-selector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-pax-selector' },
})
export class PaxSelectorElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<PaxSelectorRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<PaxSelectorRuntimeConfig>(sanitizePaxSelectorConfig),
  });
  readonly maxRoomsInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxRooms',
    transform: coerceOptionalNumberInput,
  });
  readonly maxPerRoomInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxPerRoom',
    transform: coerceOptionalNumberInput,
  });
  readonly maxChildAgeInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxChildAge',
    transform: coerceOptionalNumberInput,
  });
  readonly initialInput = input<string | undefined>(undefined, { alias: 'initial' });

  /** Emits the full occupancy whenever it changes. */
  readonly occupancychange = output<PaxOccupancy>();

  readonly maxRooms = computed(() => {
    const resolved = resolveConfigValue(this.maxRoomsInput(), this.config()?.maxRooms, DEFAULT_MAX_ROOMS);
    return resolved >= 1 ? Math.trunc(resolved) : DEFAULT_MAX_ROOMS;
  });
  readonly maxPerRoom = computed(() => {
    const resolved = resolveConfigValue(
      this.maxPerRoomInput(),
      this.config()?.maxPerRoom,
      DEFAULT_MAX_PER_ROOM,
    );
    // A room always needs at least one adult.
    return resolved >= MIN_ADULTS_PER_ROOM ? Math.trunc(resolved) : DEFAULT_MAX_PER_ROOM;
  });
  readonly maxChildAge = computed(() => {
    const resolved = resolveConfigValue(
      this.maxChildAgeInput(),
      this.config()?.maxChildAge,
      DEFAULT_MAX_CHILD_AGE,
    );
    return resolved >= 0 ? Math.trunc(resolved) : DEFAULT_MAX_CHILD_AGE;
  });

  /** Selectable age options for a child (0 … maxChildAge inclusive). */
  readonly childAgeOptions = computed<readonly number[]>(() =>
    Array.from({ length: this.maxChildAge() + 1 }, (_value, index) => index),
  );

  readonly fieldId = `syn-pax-selector-${(paxSelectorInstanceId += 1)}`;

  /** The live occupancy state — always valid against the current bounds. */
  readonly rooms = signal<readonly PaxRoom[]>([createDefaultRoom()]);

  #initialSeeded = false;

  // ─── Derived totals / summary ──────────────────────────────────────────────
  readonly totalRooms = computed(() => this.rooms().length);
  readonly totalAdults = computed(() =>
    this.rooms().reduce((sum, room) => sum + room.adults, 0),
  );
  readonly totalChildren = computed(() =>
    this.rooms().reduce((sum, room) => sum + room.childAges.length, 0),
  );

  /** "N habitaciones · X adultos · Y niños" (es-CO, singular/plural aware). */
  readonly summary = computed(() => {
    const rooms = this.totalRooms();
    const adults = this.totalAdults();
    const children = this.totalChildren();
    const parts = [
      `${rooms} ${rooms === 1 ? 'habitación' : 'habitaciones'}`,
      `${adults} ${adults === 1 ? 'adulto' : 'adultos'}`,
      `${children} ${children === 1 ? 'niño' : 'niños'}`,
    ];
    return parts.join(' · ');
  });

  // ─── Per-room capability flags (drive disabled state on the controls) ───────
  readonly canAddRoom = computed(() => this.totalRooms() < this.maxRooms());
  readonly canRemoveRoom = computed(() => this.totalRooms() > 1);

  roomGuests(room: PaxRoom): number {
    return room.adults + room.childAges.length;
  }

  /** True while the room still has spare capacity (adults + children < cap). */
  hasRoomCapacity(room: PaxRoom): boolean {
    return this.roomGuests(room) < this.maxPerRoom();
  }

  canAddAdult(room: PaxRoom): boolean {
    return this.hasRoomCapacity(room);
  }

  /** Min 1 adult per room; children always require ≥1 adult to remain. */
  canRemoveAdult(room: PaxRoom): boolean {
    return room.adults > MIN_ADULTS_PER_ROOM;
  }

  canAddChild(room: PaxRoom): boolean {
    return this.hasRoomCapacity(room);
  }

  canRemoveChild(room: PaxRoom): boolean {
    return room.childAges.length > 0;
  }

  trackRoom(index: number): number {
    return index;
  }

  trackChild(index: number): number {
    return index;
  }

  // ─── Mutations ─────────────────────────────────────────────────────────────
  addRoom(): void {
    if (!this.canAddRoom()) {
      return;
    }
    this.commit([...this.rooms(), createDefaultRoom()]);
  }

  removeRoom(index: number): void {
    if (!this.canRemoveRoom() || index < 0 || index >= this.rooms().length) {
      return;
    }
    this.commit(this.rooms().filter((_room, i) => i !== index));
  }

  addAdult(index: number): void {
    this.mutateRoom(index, (room) => (this.canAddAdult(room) ? { ...room, adults: room.adults + 1 } : room));
  }

  removeAdult(index: number): void {
    this.mutateRoom(index, (room) =>
      this.canRemoveAdult(room) ? { ...room, adults: room.adults - 1 } : room,
    );
  }

  addChild(index: number): void {
    this.mutateRoom(index, (room) =>
      // New child defaults to the lowest selectable age (infante 0-2 band).
      this.canAddChild(room) ? { ...room, childAges: [...room.childAges, 0] } : room,
    );
  }

  removeChild(roomIndex: number, childIndex: number): void {
    this.mutateRoom(roomIndex, (room) => {
      if (childIndex < 0 || childIndex >= room.childAges.length) {
        return room;
      }
      return { ...room, childAges: room.childAges.filter((_age, i) => i !== childIndex) };
    });
  }

  setChildAge(roomIndex: number, childIndex: number, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    const age = clamp(Math.trunc(Number(target.value) || 0), 0, this.maxChildAge());
    this.mutateRoom(roomIndex, (room) => {
      if (childIndex < 0 || childIndex >= room.childAges.length) {
        return room;
      }
      const childAges = room.childAges.map((value, i) => (i === childIndex ? age : value));
      return { ...room, childAges };
    });
  }

  /** Apply a transform to one room, then re-commit the whole occupancy. */
  private mutateRoom(index: number, transform: (room: PaxRoom) => PaxRoom): void {
    const rooms = this.rooms();
    if (index < 0 || index >= rooms.length) {
      return;
    }
    const next = rooms.map((room, i) => (i === index ? transform(room) : room));
    this.commit(next);
  }

  /** Re-seed from `initial` config exactly once, lazily. */
  seedInitial(): void {
    if (this.#initialSeeded) {
      return;
    }
    this.#initialSeeded = true;

    const raw =
      this.initialInput() !== undefined
        ? this.#initialData.parseValue<unknown>(this.initialInput())
        : this.config()?.initial;

    if (raw === undefined || raw === null) {
      return;
    }

    this.rooms.set(normalizeRooms(raw, this.maxRooms(), this.maxPerRoom(), this.maxChildAge()));
  }

  ngOnInit(): void {
    this.seedInitial();
  }

  private commit(rooms: readonly PaxRoom[]): void {
    this.rooms.set(rooms);
    this.occupancychange.emit({
      rooms: rooms.map((room) => ({ adults: room.adults, childAges: [...room.childAges] })),
    });
  }

  /** Band label for a given child age (infante 0-2 · niño 2-12 · adulto 12+). */
  ageBandLabel(age: number): string {
    if (age < CHILD_AGE_FLOOR) {
      return 'infante';
    }
    if (age < ADULT_AGE_FLOOR) {
      return 'niño';
    }
    return 'adulto';
  }
}
