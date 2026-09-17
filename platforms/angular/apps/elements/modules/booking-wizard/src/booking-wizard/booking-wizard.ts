import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FulfillmentContext,
  SessionStore,
  type FulfillmentProduct,
} from '@synergos/transaction-engine';
import {
  CheckoutWizardComponent,
  ConfirmationShellComponent,
  type CheckoutWizardConfig,
  type CheckoutWizardResult,
  type ConfirmationAction,
  type ConfirmationFact,
  type ConfirmationShellConfig,
  type ConfirmationStep,
} from '@synergos/shells';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  SynSkeletonComponent,
  SynEmptyStateComponent,
} from '@synergos/shared';
import { normalizeRooms } from './booking-api.client';
import {
  BOOKING_FLOW,
  BOOKING_HOLD_FAILED,
  type BookingGuest,
  type BookingOffer,
  type BookingRoom,
  type BookingSelection,
  type BookingVoucher,
} from './booking.model';

/**
 * Runtime config for the CMS element <c>elementSynBookingWizard</c>.
 *
 * El asistente de reserva del vertical HOTELES. Desde #24 **se compone**: era el
 * único consumidor del catálogo que no consumía nada —1.747 líneas con su propia
 * máquina de pasos, su propio indicador, su propio voucher y su propia sesión en
 * `localStorage`, al lado de un motor de transacción que existe para esto—.
 *
 * Hoy el esqueleto es **SH-3 `syn-checkout-wizard`** (pasos, atrás/continuar,
 * gating por paso y la ronda `pay → registrar → confirm → vouchers` contra el
 * motor) y el desenlace es **SH-11 `syn-confirmation-shell`**. Lo que queda acá
 * es lo del hotel: fechas, ocupación, ofertas y huésped.
 *
 * **Lo que NO monta, a propósito.** SH-1 discovery: no hay facetas ni orden —la
 * «búsqueda» son dos fechas y un `<synergos-pax-selector>`—, así que sería
 * andamiaje sin usar ninguna de sus razones de existir. SH-12 carrito: hay una
 * oferta, inmutable, sin cantidad y sin nada que quitar, y lo único suyo que
 * vendría bien —el reloj del apartado— no se puede pintar porque ni
 * `BookingOffer` ni `/hold` traen vencimiento. Eso es contrato con el backend.
 *
 * Sigue embebiendo el `<synergos-pax-selector>` publicado (escucha su
 * `occupancychange`) para que las reglas de habitación/pax vivan en un sitio.
 */
export interface BookingWizardRuntimeConfig {
  /** Base URL of the booking engine API. Default `/api/booking`. */
  readonly apiBase?: string;
  /** ISO currency for price display hints. Default `COP`. */
  readonly currency?: string;
  /** Pre-filled destination label (read-only banner in the search step). */
  readonly destinationLabel?: string;
}

/** Los pasos del asistente. Los ejecuta SH-3; acá sólo se declaran. */
export type BookingStep = 'fechas' | 'habitacion' | 'huesped' | 'revisar';

const STEP_LABELS: Readonly<Record<BookingStep, string>> = {
  fechas: 'Fechas',
  habitacion: 'Habitación',
  huesped: 'Huésped',
  revisar: 'Revisar',
};

const DEFAULT_API_BASE = '/api/booking';
const DEFAULT_CURRENCY = 'COP';
/**
 * La sesión del motor caduca; la de antes NO tenía caducidad ninguna, así que
 * abrir la página en marzo rehidrataba un intento de reserva para fechas de
 * enero. Treinta minutos es lo que usan Tienda y Viajes.
 */
const SESSION_TTL_MS = 30 * 60 * 1000;

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
  imports: [
    CheckoutWizardComponent,
    ConfirmationShellComponent,
    SynSkeletonComponent,
    SynEmptyStateComponent,
  ],
  templateUrl: './booking-wizard.html',
  styleUrl: './booking-wizard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Allow the embedded <synergos-pax-selector> custom element + its props.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-booking-wizard' },
})
export class BookingWizardElementComponent {
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<BookingWizardRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<BookingWizardRuntimeConfig>(sanitizeBookingWizardConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly currencyInput = input<string | undefined>(undefined, { alias: 'currency' });
  readonly destinationLabelInput = input<string | undefined>(undefined, {
    alias: 'destinationLabel',
  });
  /** Scopes the engine session so multiple wizards on a page never collide. */
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

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly stepchange = output<string>();
  readonly bookingconfirmed = output<BookingVoucher>();

  // ─── Lo del hotel ──────────────────────────────────────────────────────────
  readonly checkIn = signal('');
  readonly checkOut = signal('');
  readonly rooms = signal<readonly BookingRoom[]>([{ adults: 2, childAges: [] }]);
  readonly offers = signal<readonly FulfillmentProduct[]>([]);
  readonly searching = signal(false);
  readonly guestName = signal('');
  readonly guestEmail = signal('');
  readonly voucher = signal<BookingVoucher | null>(null);
  /** Motivo del último fallo, ya traducido a algo que se puede leer. */
  readonly errorMessage = signal('');
  readonly currentStep = signal<BookingStep>('fechas');

  constructor() {
    // La sesión del carrito unificado, con scope y caducidad — reemplaza a la
    // `BookingSession` a mano que vivía en localStorage sin ninguna de las dos.
    const explicit = coerceTrimmedStringInput(this.sessionKeyInput());
    this.#store.init({
      scope: `booking.${explicit ?? `i${this.instanceId}`}`,
      flow: BOOKING_FLOW,
      ttlMs: SESSION_TTL_MS,
      currency: DEFAULT_CURRENCY,
    });
  }

  // ─── Estado derivado ───────────────────────────────────────────────────────
  readonly selectedItem = computed(() => this.#store.items()[0] ?? null);

  readonly selection = computed<BookingSelection | null>(() => {
    const raw = this.selectedItem()?.selection as Partial<BookingSelection> | undefined;
    return raw?.offer ? (raw as BookingSelection) : null;
  });

  readonly selectedOffer = computed<BookingOffer | null>(() => this.selection()?.offer ?? null);

  readonly hasOffers = computed(() => this.offers().length > 0);

  readonly checkInDate = computed(() => parseDate(this.checkIn()));
  readonly checkOutDate = computed(() => parseDate(this.checkOut()));

  /** Válido cuando las dos fechas parsean y la salida es posterior a la entrada. */
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
  readonly canSearch = computed(() => this.datesValid() && !this.searching());

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

  readonly nightsLabel = computed(() => {
    const nights = this.nightCount();
    return `${nights} ${nights === 1 ? 'noche' : 'noches'}`;
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

  /** Ocupación inicial que se le entrega al pax-selector embebido. */
  readonly paxInitialJson = computed(() => JSON.stringify({ rooms: this.rooms() }));

  // ─── SH-3: configuración y gating ──────────────────────────────────────────
  readonly wizardConfig = computed<CheckoutWizardConfig>(() => ({
    steps: (['fechas', 'habitacion', 'huesped', 'revisar'] as const).map((id) => ({
      id,
      label: STEP_LABELS[id],
    })),
    stepsLabel: 'Pasos de la reserva',
    summaryHeading: 'Tu reserva',
    totalLabel: 'Total',
    emptyMessage: 'Todavía no has elegido una habitación.',
    backLabel: 'Volver',
    nextLabel: 'Continuar',
    submitLabel: 'Confirmar y pagar',
    processingLabel: 'Procesando…',
  }));

  /**
   * Quién puede avanzar. Es el mismo gating que el asistente tenía a mano, ahora
   * declarado: SH-3 deshabilita el botón y además exige línea en el carrito en el
   * último paso, que es más de lo que se comprobaba antes.
   */
  readonly wizardValidity = computed<Readonly<Record<string, boolean>>>(() => ({
    fechas: this.datesValid(),
    habitacion: this.selectedOffer() !== null,
    huesped: this.guestValid(),
    revisar: this.selectedOffer() !== null,
  }));

  /** Lo que la estrategia necesita para apartar: quién es el huésped. */
  readonly wizardInstrument = computed<Readonly<Record<string, unknown>>>(() => ({
    provider: 'booking',
    guest: { name: this.guestName().trim(), email: this.guestEmail().trim() } satisfies BookingGuest,
  }));

  // ─── SH-11: el desenlace ───────────────────────────────────────────────────
  readonly confirmationConfig = computed<ConfirmationShellConfig>(() => ({
    heading: 'Reserva confirmada',
    summary: 'Te enviamos el comprobante por correo. Preséntalo al llegar al hotel.',
    referenceLabel: 'Reserva',
    stepsLabel: 'Qué sigue',
  }));

  readonly confirmationFacts = computed<readonly ConfirmationFact[]>(() => {
    const v = this.voucher();
    if (!v) {
      return [];
    }
    return [
      { id: 'entrada', label: 'Entrada', value: v.checkIn },
      { id: 'salida', label: 'Salida', value: v.checkOut },
      { id: 'habitacion', label: 'Habitación', value: this.selectedOffer()?.roomTypeName ?? '—' },
      { id: 'total', label: 'Monto pagado', value: v.totalPriceFormatted },
    ];
  });

  readonly confirmationSteps = computed<readonly ConfirmationStep[]>(() => [
    { id: 'pagada', label: 'Pago recibido', done: true },
    { id: 'correo', label: 'Comprobante por correo', detail: this.guestEmail().trim() },
    { id: 'llegada', label: 'Check-in', detail: `Desde las 15:00 del ${this.voucher()?.checkIn ?? ''}` },
  ]);

  readonly confirmationActions = computed<readonly ConfirmationAction[]>(() => [
    { id: 'nueva', label: 'Nueva reserva', kind: 'primary' },
  ]);

  // ─── Formularios (nativo, sin FormsModule) ─────────────────────────────────
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

  onOccupancyChange(event: Event): void {
    this.rooms.set(normalizeRooms((event as CustomEvent<unknown>).detail));
  }

  trackOffer(_index: number, product: FulfillmentProduct): string {
    return product.productRef;
  }

  offerOf(product: FulfillmentProduct): BookingOffer {
    return (product.selection as unknown as BookingSelection).offer;
  }

  // ─── Disponibilidad ────────────────────────────────────────────────────────
  /**
   * Busca contra el motor. Se dispara al entrar al paso de habitación: pedirle a
   * la persona un botón «buscar» y luego otro «continuar» eran dos pulsaciones
   * para una sola intención.
   *
   * **Limpia el aviso anterior, y por eso no es la que usa `onFailed`.** Volver a
   * buscar tras un apartado fallido con ESTA borraba el «esa habitación ya no
   * está disponible» en el mismo tick en que se escribía, así que la persona se
   * encontraba de vuelta en la lista sin saber por qué. Lo cazó el spec.
   */
  async search(): Promise<void> {
    this.errorMessage.set('');
    await this.refreshAvailability();
  }

  /** La búsqueda sin tocar el aviso en pantalla. */
  private async refreshAvailability(): Promise<void> {
    if (!this.canSearch()) {
      return;
    }
    this.searching.set(true);
    try {
      const products = await this.#fulfillment.search({
        flow: BOOKING_FLOW,
        currency: this.currency(),
        criteria: {
          apiBase: this.apiBase(),
          checkIn: this.checkIn(),
          checkOut: this.checkOut(),
          rooms: this.rooms(),
        },
      });
      this.offers.set(products);
    } catch {
      this.offers.set([]);
      this.errorMessage.set('No pudimos buscar disponibilidad. Intenta de nuevo.');
    } finally {
      this.searching.set(false);
    }
  }

  /** La oferta elegida pasa a ser la línea del carrito. */
  async selectOffer(product: FulfillmentProduct): Promise<void> {
    this.errorMessage.set('');
    const { item } = await this.#fulfillment.select(product, this.#store.getValidSession());
    this.#store.addItem(item);
    const total = item.amount * item.quantity;
    this.#store.setPricing({
      currency: this.currency(),
      totalAmount: total,
      balanceDue: total,
      breakdown: [],
    });
  }

  // ─── Puentes con SH-3 ──────────────────────────────────────────────────────
  onStepChange(stepId: string): void {
    this.currentStep.set(stepId as BookingStep);
    this.errorMessage.set('');
    this.stepchange.emit(stepId);
    // Al entrar a elegir habitación, la disponibilidad se pide sola si no la hay.
    if (stepId === 'habitacion' && !this.hasOffers() && !this.searching()) {
      void this.refreshAvailability();
    }
  }

  onCompleted(result: CheckoutWizardResult): void {
    const detail = result.vouchers[0]?.detail as { voucher?: BookingVoucher } | undefined;
    const voucher = detail?.voucher ?? null;
    if (voucher) {
      this.voucher.set(voucher);
      this.bookingconfirmed.emit(voucher);
    }
  }

  /**
   * **El caso que justifica la HU** (#24). Apartar y cobrar fallan por razones
   * distintas y piden lo contrario: si la habitación ya no está, reintentar el
   * pago es reintentar contra algo que no va a existir y hay que volver a elegir;
   * si la tarjeta no pasó, reintentar ahí mismo es lo correcto. Antes las dos
   * caían al mismo `catch` con el mismo texto y en el mismo sitio.
   */
  onFailed(reason: string): void {
    if (reason === BOOKING_HOLD_FAILED) {
      this.errorMessage.set(
        'Esa habitación ya no está disponible. Elige otra de las opciones.',
      );
      // La selección muerta se quita: dejarla deja el botón de confirmar vivo
      // sobre algo que el motor ya rechazó.
      const item = this.selectedItem();
      if (item) {
        this.#store.removeItem(item.id);
      }
      this.offers.set([]);
      void this.refreshAvailability();
      return;
    }
    this.errorMessage.set('No pudimos completar el pago. Revisa tus datos e intenta de nuevo.');
  }

  /** Vuelve al carrito/búsqueda desde el primer paso. */
  onExit(): void {
    this.currentStep.set('fechas');
  }

  /** Empieza de cero, con la sesión del motor limpia. */
  startOver(): void {
    this.#store.reset();
    this.offers.set([]);
    this.voucher.set(null);
    this.errorMessage.set('');
    this.guestName.set('');
    this.guestEmail.set('');
    this.currentStep.set('fechas');
  }

  onConfirmationAction(id: string): void {
    if (id === 'nueva') {
      this.startOver();
    }
  }
}

function parseDate(value: string): Date | null {
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
