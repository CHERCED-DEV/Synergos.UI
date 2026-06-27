import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynBookingWizard</c>.
 *
 * Orchestrates the full booking flow for the HOTELES vertical against the
 * booking engine API. The wizard is a 6-state machine (search → results →
 * guest → pay → confirmation, plus the implicit error/loading states each
 * step can enter) driven entirely by signals.
 *
 * It embeds the published <c>&lt;synergos-pax-selector&gt;</c> composition for
 * occupancy (it listens to its `occupancychange` CustomEvent) so room/pax
 * rules live in one place and are never duplicated here.
 *
 * The shared `@synergos/contracts` package does not (yet) declare a
 * `BookingWizardElementConfig`; the canonical shape lives here next to the
 * component until that contract lands in the registry ola.
 */
export interface BookingWizardRuntimeConfig {
  /** Base URL of the booking engine API. Default `/api/booking`. */
  readonly apiBase?: string;
  /** ISO currency for price display hints. Default `COP`. */
  readonly currency?: string;
  /** Pre-filled destination label (read-only banner in the search step). */
  readonly destinationLabel?: string;
}

/** The 6 canonical states of the wizard. */
export type BookingStep = 'search' | 'results' | 'guest' | 'pay' | 'confirmation';

export const BOOKING_STEPS: readonly BookingStep[] = [
  'search',
  'results',
  'guest',
  'pay',
  'confirmation',
];

/** One room's occupancy, mirrors the pax-selector emitted shape. */
export interface BookingRoom {
  readonly adults: number;
  readonly childAges: readonly number[];
}

/** A single bookable offer returned by `/search`. */
export interface BookingOffer {
  readonly offerId: string;
  readonly roomTypeName: string;
  readonly board: string;
  readonly totalPrice: number;
  readonly totalPriceFormatted: string;
  readonly currency: string;
  readonly refundable: boolean;
  readonly cancellationPolicy: string;
  readonly roomsLeft: number | null;
}

/** Guest contact captured in the guest step. */
export interface BookingGuest {
  readonly name: string;
  readonly email: string;
}

/** Confirmed voucher returned by `/pay`. */
export interface BookingVoucher {
  readonly reservationId: string;
  readonly status: string;
  readonly totalPrice: number;
  readonly totalPriceFormatted: string;
  readonly currency: string;
  readonly checkIn: string;
  readonly checkOut: string;
}

/** Persisted wizard session (localStorage). NS.Booking learning signal. */
export interface BookingSession {
  readonly step: BookingStep;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly rooms: readonly BookingRoom[];
  readonly offer: BookingOffer | null;
  readonly guest: BookingGuest | null;
  readonly reservationId: string | null;
}

const DEFAULT_API_BASE = '/api/booking';
const DEFAULT_CURRENCY = 'COP';
const SESSION_KEY_PREFIX = 'syn.booking.session';

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

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return false;
}

/** Format a numeric amount in es-CO for the given ISO currency. */
function formatPrice(amount: number, currency: string): string {
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

/** Normalize a raw API offer into the strict internal shape. */
export function normalizeOffer(value: unknown, fallbackCurrency: string): BookingOffer | null {
  if (!isRecord(value)) {
    return null;
  }

  const offerId =
    readString(value['offerId']).trim() ||
    readString(value['id']).trim() ||
    readString(value['rateKey']).trim();
  const roomTypeName =
    readString(value['roomTypeName']).trim() || readString(value['roomType']).trim();
  if (!offerId || !roomTypeName) {
    return null;
  }

  const currency = readString(value['currency']).trim() || fallbackCurrency;
  const totalPrice = readNumber(value['totalPrice']) ?? readNumber(value['price']) ?? 0;
  const formatted =
    readString(value['totalPriceFormatted']).trim() || formatPrice(totalPrice, currency);
  const roomsLeftRaw = readNumber(value['roomsLeft']);

  return {
    offerId,
    roomTypeName,
    board: readString(value['board']).trim(),
    totalPrice,
    totalPriceFormatted: formatted,
    currency,
    refundable: readBoolean(value['refundable']),
    cancellationPolicy: readString(value['cancellationPolicy']).trim(),
    roomsLeft: roomsLeftRaw,
  };
}

export function normalizeOffers(value: unknown, fallbackCurrency: string): readonly BookingOffer[] {
  const list = Array.isArray(value)
    ? value
    : isRecord(value)
      ? value['offers'] ?? value['results'] ?? value['rooms']
      : null;
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((entry) => normalizeOffer(entry, fallbackCurrency))
    .filter((offer): offer is BookingOffer => offer !== null);
}

/** Normalize the occupancy payload emitted by <synergos-pax-selector>. */
export function normalizeRooms(value: unknown): readonly BookingRoom[] {
  const source = isRecord(value) ? value['rooms'] : value;
  if (!Array.isArray(source)) {
    return [{ adults: 2, childAges: [] }];
  }
  const rooms = source
    .map((entry): BookingRoom | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const adults = Math.max(1, Math.trunc(readNumber(entry['adults']) ?? 1));
      const rawAges = Array.isArray(entry['childAges']) ? entry['childAges'] : [];
      const childAges = rawAges
        .map((age) => readNumber(age))
        .filter((age): age is number => age !== null)
        .map((age) => Math.max(0, Math.trunc(age)));
      return { adults, childAges };
    })
    .filter((room): room is BookingRoom => room !== null);
  return rooms.length > 0 ? rooms : [{ adults: 2, childAges: [] }];
}

function sanitizeBookingWizardConfig(
  value: Partial<BookingWizardRuntimeConfig>,
): BookingWizardRuntimeConfig {
  return omitUndefinedProperties<BookingWizardRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    currency: coerceTrimmedStringInput(value.currency),
    destinationLabel: coerceTrimmedStringInput(value.destinationLabel),
  });
}

let bookingWizardInstanceId = 0;

@Component({
  selector: 'sg-booking-wizard',
  standalone: true,
  // No imports: the pax-selector is consumed as a registered custom element
  // (<synergos-pax-selector>), kept out of Angular's template schema below.
  imports: [],
  templateUrl: './booking-wizard.html',
  styleUrl: './booking-wizard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Allow the embedded <synergos-pax-selector> custom element + its props.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-booking-wizard' },
})
export class BookingWizardElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<BookingWizardRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<BookingWizardRuntimeConfig>(sanitizeBookingWizardConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly currencyInput = input<string | undefined>(undefined, { alias: 'currency' });
  readonly destinationLabelInput = input<string | undefined>(undefined, {
    alias: 'destinationLabel',
  });
  /** Scopes the localStorage session key so multiple wizards never collide. */
  readonly sessionKeyInput = input<string | undefined>(undefined, { alias: 'sessionKey' });

  readonly apiBase = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.apiBaseInput()),
      this.config()?.apiBase,
      DEFAULT_API_BASE,
    ).replace(/\/+$/, ''),
  );
  readonly currency = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.currencyInput()),
      this.config()?.currency,
      DEFAULT_CURRENCY,
    ),
  );
  readonly destinationLabel = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.destinationLabelInput()),
      this.config()?.destinationLabel,
      '',
    ),
  );

  readonly instanceId = (bookingWizardInstanceId += 1);
  readonly fieldId = `syn-booking-wizard-${this.instanceId}`;
  readonly sessionKey = computed(() => {
    const explicit = coerceTrimmedStringInput(this.sessionKeyInput());
    return `${SESSION_KEY_PREFIX}.${explicit ?? `i${this.instanceId}`}`;
  });

  readonly steps = BOOKING_STEPS;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly stepchange = output<BookingStep>();
  readonly bookingconfirmed = output<BookingVoucher>();

  // ─── Machine state ─────────────────────────────────────────────────────────
  readonly step = signal<BookingStep>('search');
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  // Search inputs
  readonly checkIn = signal('');
  readonly checkOut = signal('');
  readonly rooms = signal<readonly BookingRoom[]>([{ adults: 2, childAges: [] }]);

  // Results
  readonly offers = signal<readonly BookingOffer[]>([]);
  readonly selectedOffer = signal<BookingOffer | null>(null);

  // Guest
  readonly guestName = signal('');
  readonly guestEmail = signal('');

  // Pay / confirmation
  readonly reservationId = signal<string | null>(null);
  readonly voucher = signal<BookingVoucher | null>(null);

  #rehydrating = false;
  #seeded = false;

  // ─── Derived view state ────────────────────────────────────────────────────
  readonly stepIndex = computed(() => BOOKING_STEPS.indexOf(this.step()));
  readonly hasOffers = computed(() => this.offers().length > 0);

  readonly checkInDate = computed(() => this.parseDate(this.checkIn()));
  readonly checkOutDate = computed(() => this.parseDate(this.checkOut()));

  /** Valid when both dates parse and check-out is strictly after check-in. */
  readonly datesValid = computed(() => {
    const inDate = this.checkInDate();
    const outDate = this.checkOutDate();
    return inDate !== null && outDate !== null && outDate.getTime() > inDate.getTime();
  });
  readonly dateError = computed(() => {
    if (!this.checkIn() || !this.checkOut()) {
      return '';
    }
    return this.datesValid() ? '' : 'La fecha de salida debe ser posterior a la de entrada.';
  });
  readonly canSearch = computed(() => this.datesValid() && !this.loading());

  readonly guestNameValid = computed(() => this.guestName().trim().length >= 2);
  readonly guestEmailValid = computed(() => /.+@.+\..+/.test(this.guestEmail().trim()));
  readonly guestValid = computed(() => this.guestNameValid() && this.guestEmailValid());

  readonly nightCount = computed(() => {
    const inDate = this.checkInDate();
    const outDate = this.checkOutDate();
    if (inDate === null || outDate === null) {
      return 0;
    }
    const ms = outDate.getTime() - inDate.getTime();
    return ms > 0 ? Math.round(ms / 86_400_000) : 0;
  });

  readonly summaryLabel = computed(() => {
    const rooms = this.rooms();
    const adults = rooms.reduce((sum, room) => sum + room.adults, 0);
    const children = rooms.reduce((sum, room) => sum + room.childAges.length, 0);
    const parts = [
      `${rooms.length} ${rooms.length === 1 ? 'habitación' : 'habitaciones'}`,
      `${adults} ${adults === 1 ? 'adulto' : 'adultos'}`,
    ];
    if (children > 0) {
      parts.push(`${children} ${children === 1 ? 'niño' : 'niños'}`);
    }
    return parts.join(' · ');
  });

  /** Initial occupancy payload handed to the embedded pax-selector. */
  readonly paxInitialJson = computed(() => JSON.stringify({ rooms: this.rooms() }));

  constructor() {
    // Persist every meaningful state change to localStorage (BookingSession).
    effect(() => {
      const snapshot: BookingSession = {
        step: this.step(),
        checkIn: this.checkIn(),
        checkOut: this.checkOut(),
        rooms: this.rooms(),
        offer: this.selectedOffer(),
        guest:
          this.guestName() || this.guestEmail()
            ? { name: this.guestName(), email: this.guestEmail() }
            : null,
        reservationId: this.reservationId(),
      };
      this.persistSession(snapshot);
    });
  }

  ngOnInit(): void {
    this.seedFromConfig();
    this.rehydrate();
  }

  // ─── Step navigation ───────────────────────────────────────────────────────
  stepLabel(step: BookingStep): string {
    switch (step) {
      case 'search':
        return 'Buscar';
      case 'results':
        return 'Ofertas';
      case 'guest':
        return 'Huésped';
      case 'pay':
        return 'Pago';
      case 'confirmation':
        return 'Confirmación';
    }
  }

  isCurrent(step: BookingStep): boolean {
    return this.step() === step;
  }

  isComplete(step: BookingStep): boolean {
    return BOOKING_STEPS.indexOf(step) < this.stepIndex();
  }

  goTo(step: BookingStep): void {
    if (this.step() === step) {
      return;
    }
    this.step.set(step);
    this.errorMessage.set('');
    this.stepchange.emit(step);
  }

  back(): void {
    const index = this.stepIndex();
    if (index <= 0) {
      return;
    }
    // Confirmation is terminal; never step back into it via the back button.
    const previous = BOOKING_STEPS[index - 1];
    this.goTo(previous);
  }

  // ─── Pax-selector bridge ───────────────────────────────────────────────────
  onOccupancyChange(event: Event): void {
    const detail = (event as CustomEvent<unknown>).detail;
    this.rooms.set(normalizeRooms(detail));
  }

  // ─── Form bindings (native, no FormsModule) ────────────────────────────────
  onCheckInInput(event: Event): void {
    this.checkIn.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  onCheckOutInput(event: Event): void {
    this.checkOut.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  onGuestNameInput(event: Event): void {
    this.guestName.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  onGuestEmailInput(event: Event): void {
    this.guestEmail.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  trackOffer(_index: number, offer: BookingOffer): string {
    return offer.offerId;
  }

  // ─── Step 1 → 2: search ────────────────────────────────────────────────────
  search(): void {
    if (!this.canSearch()) {
      return;
    }
    const payload = {
      checkIn: this.checkIn(),
      checkOut: this.checkOut(),
      rooms: this.rooms().map((room) => ({
        adults: room.adults,
        childAges: [...room.childAges],
      })),
    };

    this.runRequest(
      `${this.apiBase()}/search`,
      payload,
      (data) => {
        const offers = normalizeOffers(data, this.currency());
        this.offers.set(offers);
        this.selectedOffer.set(null);
        this.goTo('results');
      },
      'No pudimos buscar disponibilidad. Intenta de nuevo.',
    );
  }

  // ─── Step 2 → 3: pick offer ────────────────────────────────────────────────
  selectOffer(offer: BookingOffer): void {
    this.selectedOffer.set(offer);
    this.goTo('guest');
  }

  // ─── Step 3 → 4: capture guest ─────────────────────────────────────────────
  continueToPay(): void {
    if (!this.guestValid()) {
      return;
    }
    this.goTo('pay');
  }

  // ─── Step 4 → 5: hold then pay ─────────────────────────────────────────────
  pay(): void {
    const offer = this.selectedOffer();
    if (!offer || this.loading()) {
      return;
    }

    const guest: BookingGuest = {
      name: this.guestName().trim(),
      email: this.guestEmail().trim(),
    };
    const holdPayload = {
      offerId: offer.offerId,
      offer,
      checkIn: this.checkIn(),
      checkOut: this.checkOut(),
      rooms: this.rooms().map((room) => ({ adults: room.adults, childAges: [...room.childAges] })),
      guest,
    };

    this.loading.set(true);
    this.errorMessage.set('');

    this.fetchJson(`${this.apiBase()}/hold`, holdPayload)
      .then((holdData) => {
        const reservationId =
          readString(isRecord(holdData) ? holdData['reservationId'] : '').trim() ||
          readString(isRecord(holdData) ? holdData['id'] : '').trim();
        if (!reservationId) {
          throw new Error('missing-reservation-id');
        }
        this.reservationId.set(reservationId);
        return this.fetchJson(`${this.apiBase()}/pay`, { reservationId });
      })
      .then((payData) => {
        const voucher = this.toVoucher(payData);
        if (!voucher || voucher.status.toLowerCase() !== 'confirmed') {
          throw new Error('not-confirmed');
        }
        this.voucher.set(voucher);
        this.loading.set(false);
        this.goTo('confirmation');
        this.bookingconfirmed.emit(voucher);
        // Booking complete — clear the persisted session.
        this.clearSession();
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        this.loading.set(false);
        this.errorMessage.set('No pudimos completar el pago. Intenta de nuevo.');
      });
  }

  /** Restart the whole flow from a clean session. */
  startOver(): void {
    this.offers.set([]);
    this.selectedOffer.set(null);
    this.reservationId.set(null);
    this.voucher.set(null);
    this.errorMessage.set('');
    this.guestName.set('');
    this.guestEmail.set('');
    this.goTo('search');
  }

  // ─── Networking ────────────────────────────────────────────────────────────
  private runRequest(
    url: string,
    payload: unknown,
    onSuccess: (data: unknown) => void,
    errorLabel: string,
  ): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.fetchJson(url, payload)
      .then((data) => {
        onSuccess(data);
        this.loading.set(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        this.loading.set(false);
        this.errorMessage.set(errorLabel);
      });
  }

  private fetchJson(url: string, payload: unknown): Promise<unknown> {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch-unavailable'));
    }
    const controller = new AbortController();
    this.#destroyRef.onDestroy(() => controller.abort());

    return fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    }).then((response) =>
      response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)),
    );
  }

  private toVoucher(data: unknown): BookingVoucher | null {
    if (!isRecord(data)) {
      return null;
    }
    const reservationId =
      readString(data['reservationId']).trim() ||
      this.reservationId() ||
      readString(data['id']).trim();
    if (!reservationId) {
      return null;
    }
    const currency = readString(data['currency']).trim() || this.currency();
    const totalPrice =
      readNumber(data['totalPrice']) ?? this.selectedOffer()?.totalPrice ?? 0;
    const formatted =
      readString(data['totalPriceFormatted']).trim() || formatPrice(totalPrice, currency);

    return {
      reservationId,
      status: readString(data['status']).trim() || 'Confirmed',
      totalPrice,
      totalPriceFormatted: formatted,
      currency,
      checkIn: readString(data['checkIn']).trim() || this.checkIn(),
      checkOut: readString(data['checkOut']).trim() || this.checkOut(),
    };
  }

  // ─── BookingSession persistence (NS.Booking) ───────────────────────────────
  private persistSession(snapshot: BookingSession): void {
    if (this.#rehydrating || !this.#seeded) {
      return;
    }
    const storage = this.getStorage();
    if (!storage) {
      return;
    }
    // Nothing worth persisting yet — keep storage clean on a pristine wizard.
    if (snapshot.step === 'search' && !snapshot.checkIn && !snapshot.checkOut && !snapshot.offer) {
      return;
    }
    try {
      storage.setItem(this.sessionKey(), JSON.stringify(snapshot));
    } catch {
      // Quota / private-mode — persistence is best-effort.
    }
  }

  private rehydrate(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }
    let raw: string | null = null;
    try {
      raw = storage.getItem(this.sessionKey());
    } catch {
      raw = null;
    }
    if (!raw) {
      return;
    }
    const parsed = this.#initialData.parseValue<Partial<BookingSession>>(raw);
    if (!isRecord(parsed)) {
      return;
    }

    this.#rehydrating = true;
    try {
      if (typeof parsed.checkIn === 'string') {
        this.checkIn.set(parsed.checkIn);
      }
      if (typeof parsed.checkOut === 'string') {
        this.checkOut.set(parsed.checkOut);
      }
      this.rooms.set(normalizeRooms(parsed.rooms));
      const offer = normalizeOffer(parsed.offer, this.currency());
      this.selectedOffer.set(offer);
      this.offers.set(offer ? [offer] : []);
      if (isRecord(parsed.guest)) {
        this.guestName.set(readString(parsed.guest['name']));
        this.guestEmail.set(readString(parsed.guest['email']));
      }
      if (typeof parsed.reservationId === 'string') {
        this.reservationId.set(parsed.reservationId);
      }
      const step = this.resolveRehydratedStep(parsed.step, offer);
      this.step.set(step);
    } finally {
      this.#rehydrating = false;
    }
  }

  /** Never rehydrate into a step the captured data cannot support. */
  private resolveRehydratedStep(
    step: BookingSession['step'] | undefined,
    offer: BookingOffer | null,
  ): BookingStep {
    const candidate: BookingStep =
      step && (BOOKING_STEPS as readonly string[]).includes(step) ? step : 'search';
    // Confirmation is terminal + the session is cleared on confirm; resume earlier.
    if (candidate === 'confirmation') {
      return 'search';
    }
    if ((candidate === 'guest' || candidate === 'pay') && !offer) {
      return 'search';
    }
    if (candidate === 'results' && !offer) {
      return 'search';
    }
    return candidate;
  }

  private clearSession(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }
    try {
      storage.removeItem(this.sessionKey());
    } catch {
      // best-effort
    }
  }

  private getStorage(): Storage | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  }

  // ─── Config seeding / helpers ──────────────────────────────────────────────
  private seedFromConfig(): void {
    if (this.#seeded) {
      return;
    }
    this.#seeded = true;
  }

  private parseDate(value: string): Date | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    const date = new Date(parsed);
    date.setHours(0, 0, 0, 0);
    return date;
  }
}
