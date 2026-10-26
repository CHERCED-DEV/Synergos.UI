import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  type OnInit,
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
  LiveRegionComponent,
  omitUndefinedProperties,
  resolveConfigValue,
  SynSkeletonComponent,
  SynEmptyStateComponent,
} from '@synergos/shared';
import type { BookingWizardProps } from '@synergos/contracts';
import { normalizeRooms } from './booking-api.client';
import { estadiaPendiente, sinEstadiaPendiente } from './booking-fulfillment.strategy';
import { cancelarEstadia, consultarEstadia, type EstadiaLeida } from './booking-viaje';
import {
  BOOKING_FLOW,
  BOOKING_HOLD_FAILED,
  caminoDeLaReserva,
  type BookingGuest,
  type BookingOffer,
  type BookingRoom,
  type BookingSelection,
  type BookingVoucher,
} from './booking.model';
import {
  FLUJO_VIAJES_RESERVA,
  avisoDelFlujo,
  clasificarRechazo,
  elegirMensaje,
  formatearImporte,
  hayCoordinador,
  t,
  type RechazoDelFlujo,
} from '@synergos/vitals-core';

/**
 * Lo que se dice de un rechazo de la estadía por la puerta, elegido por su `code` y nunca por su `title` (sección
 * `Travel.Booking`, línea 006). Lo que es de la habitación tiene texto propio; lo demás es el del viaje, que es lo que
 * la estadía es (un viaje de un ítem, 006-P4). Lo que no tiene texto propio cae al de su clase.
 */
export function mensajeDeLaEstadia(code: string): string {
  const vencido = t('Travel.Booking.HoldExpired', 'Tu reserva venció antes de confirmar. Vuelve a intentarlo.');
  const pago = t('Travel.Booking.PaymentFailed', 'No pudimos procesar el pago. No se te cobró nada.');
  const revisar = t('Travel.Booking.RoomBadRequest', 'Revisa tu reserva: a la habitación le falta un dato o no es válido.');
  const noSeReserva = t('Travel.Booking.RoomNotBookable', 'Esa habitación no se puede reservar en línea.');
  const porCodigo: Readonly<Record<string, string>> = {
    'booking.at_capacity': t('Travel.Booking.RoomTaken', 'Esa habitación ya no está disponible. Elige otra de las opciones.'),
    'booking.resource_not_found': noSeReserva,
    'cliente.sin_producto': noSeReserva,
    'booking.hold_expired': vencido,
    'booking.hold_released': vencido,
    'payments.payment_declined': pago,
    'payments.payment_failed': pago,
    'payments.voided': pago,
    'viajes.no_items': revisar,
    'viajes.too_many_items': revisar,
    'viajes.bad_product': revisar,
    'viajes.bad_window': revisar,
    'viajes.duplicate_item': revisar,
    'viajes.entrada_invalida': revisar,
    'cliente.sin_periodo': revisar,
    'viajes.not_continuable': t('Travel.Booking.NotConfirmable', 'Este viaje ya no se puede confirmar.'),
    'viajes.saga_not_found': t('Travel.Booking.NotFound', 'No encontramos ese viaje en tu cuenta.'),
  };
  if (code.startsWith('pricing.')) {
    return t('Travel.Booking.PriceUnavailable', 'No pudimos calcular el total de tu viaje. Intenta de nuevo en un momento.');
  }
  // Sólo se sabe el `code` (el asistente pasa el motivo): lo transitorio y lo negado dicen lo mismo.
  const rechazo: RechazoDelFlujo = { code, status: 0, transient: false, detail: '', origen: 'servidor', extra: {} };
  const generico = t('Travel.Booking.Generic', 'No pudimos reservar tu viaje. Intenta de nuevo.');
  return elegirMensaje(rechazo, porCodigo, {
    sesion: t('Travel.Booking.SignInRequired', 'Inicia sesión para reservar tu viaje.'),
    no_disponible: t('Travel.Booking.Unavailable', 'Las reservas en línea no están disponibles en este momento.'),
    reintentable: generico,
    defecto: generico,
    negado: generico,
  });
}

/** La habitación ya no está: por la directa no se pudo apartar, por la puerta la agenda dijo que no hay cupo. */
const HABITACION_PERDIDA: ReadonlySet<string> = new Set([BOOKING_HOLD_FAILED, 'booking.at_capacity']);

const LOGIN_PATH = '/account/login';

/** Lo que dice el comprobante de una estadía: el de esta página y el de la que abre el enlace del aviso. */
const DATOS_DE_LA_ESTADIA = {
  entrada: 'Entrada',
  salida: 'Salida',
  habitacion: 'Habitación',
  pagado: 'Monto pagado',
} as const;

/**
 * Con qué parámetro llega a la página el enlace del correo de la estadía: el de la tabla GENERADA de las rutas del CMS
 * (`viajes.reserva`; una estadía es un viaje de un ítem, núcleo N3), no un literal de aquí. La ruta del aviso por sitio
 * (D-006-AVISO, `/hoteles/?viaje={id}`) lleva el mismo. Vacío si nadie avisa.
 */
function parametroDelAviso(): string {
  return avisoDelFlujo(FLUJO_VIAJES_RESERVA)?.parametro ?? '';
}

/** La estadía del enlace del aviso (`?viaje={id}`), o vacío. */
function estadiaDelEnlace(): string {
  const parametro = parametroDelAviso();
  if (typeof window === 'undefined' || !parametro) return '';
  return new URLSearchParams(window.location.search).get(parametro)?.trim() ?? '';
}

/** Quita el parámetro del aviso de la URL: se usa una vez, y lo que quede la reabriría en cada recarga. */
function consumirEstadiaDelEnlace(): void {
  const parametro = parametroDelAviso();
  if (typeof window === 'undefined' || !parametro) return;
  const consulta = new URLSearchParams(window.location.search);
  if (!consulta.has(parametro)) return;
  consulta.delete(parametro);
  const texto = consulta.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${texto ? `?${texto}` : ''}${window.location.hash}`);
}

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
 *
 * El `config` que manda el CMS tiene la forma de `BookingWizardProps`, GENERADO del record C#
 * (ADR 0135): el alojamiento que eligió el editor y dónde vive la API para el sitio, que sale de
 * `Synergos:Features:BookingWizard` y el editor no ve (ADR 0137, CMS#196). La moneda no es
 * configuración: llega con cada oferta.
 */
export type BookingWizardConfig = Partial<BookingWizardProps>;

/** Los pasos del asistente. Los ejecuta SH-3; acá sólo se declaran. */
export type BookingStep = 'fechas' | 'habitacion' | 'huesped' | 'revisar';

const STEP_LABELS: Readonly<Record<BookingStep, string>> = {
  fechas: 'Fechas',
  habitacion: 'Habitación',
  huesped: 'Huésped',
  revisar: 'Revisar',
};

/**
 * La sesión del motor caduca; la de antes NO tenía caducidad ninguna, así que
 * abrir la página en marzo rehidrataba un intento de reserva para fechas de
 * enero. Treinta minutos es lo que usan Tienda y Viajes.
 */
const SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeBookingWizardConfig(value: BookingWizardConfig): BookingWizardConfig {
  return omitUndefinedProperties<BookingWizardProps>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    destinationLabel: coerceTrimmedStringInput(value.destinationLabel),
    // Por dónde reserva (ADR 0140; línea 006), como lo DECLARA el CMS: uno de los dos, o nada (la directa).
    bookingPath: value.bookingPath === 'puerta' || value.bookingPath === 'directa' ? value.bookingPath : undefined,
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
    LiveRegionComponent,
  ],
  templateUrl: './booking-wizard.html',
  styleUrl: './booking-wizard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Allow the embedded <synergos-pax-selector> custom element + its props.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-booking-wizard' },
})
export class BookingWizardElementComponent implements OnInit {
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<BookingWizardConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<BookingWizardProps>(sanitizeBookingWizardConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly destinationLabelInput = input<string | undefined>(undefined, {
    alias: 'destinationLabel',
  });
  /** Scopes the engine session so multiple wizards on a page never collide. */
  readonly sessionKeyInput = input<string | undefined>(undefined, { alias: 'sessionKey' });

  /**
   * Dónde vive la API. Sin ella no se llama a nada y la búsqueda avisa que no pudo: no hay una
   * base de respaldo compilada (ADR 0137).
   */
  readonly apiBase = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.apiBaseInput()), this.config()?.apiBase, '').replace(
      /\/+$/,
      '',
    ),
  );
  /**
   * La moneda de la oferta elegida: la que trae cada precio de la API. No es configuración: sería
   * una segunda fuente para un dato del precio. Sin oferta todavía, vacía.
   */
  readonly currency = computed(() => this.selection()?.offer.currency || '');
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

  /**
   * La sesión del carrito unificado, con scope y caducidad — reemplaza a la `BookingSession` a
   * mano que vivía en localStorage sin ninguna de las dos.
   *
   * No va en el constructor: en un custom element los inputs —el `sessionKey` del tag— se aplican
   * DESPUÉS de crear el componente y ANTES del primer ciclo, así que el constructor los ve vacíos
   * y la sesión caía siempre en el scope por instancia (el defecto que el piloto de la ADR 0137
   * encontró en `eventos`, CMS#194).
   */
  ngOnInit(): void {
    const explicit = coerceTrimmedStringInput(this.sessionKeyInput());
    this.#store.init({
      scope: `booking.${explicit ?? `i${this.instanceId}`}`,
      flow: BOOKING_FLOW,
      ttlMs: SESSION_TTL_MS,
    });
    // Por la puerta sin `<synergos-flujo>` arriba no se reserva: se dice, sin tocar la red, y nunca se cae a la
    // directa (una misma estadía por los dos caminos apartaría dos veces).
    this.sinCoordinador.set(this.porLaPuerta() && !hayCoordinador(this.#host, FLUJO_VIAJES_RESERVA));
    const delAviso = estadiaDelEnlace();
    if (delAviso && this.porLaPuerta() && !this.sinCoordinador()) {
      void this.abrirDelAviso(delAviso);
    }
  }

  /**
   * La estadía del enlace del correo (lote 10, 006-H5): la que el servidor dice de ese id, para quien tiene la sesión de
   * su dueño. Confirmada, su comprobante; si no, lo que dice su estado, encima del asistente. Sin sesión se ofrece entrar
   * y la vuelta conserva el enlace; una estadía ajena es el mismo «no encontramos» que una que no existe.
   */
  async abrirDelAviso(id: string): Promise<void> {
    const r = await consultarEstadia(this.#host, id);
    if (!r.ok && clasificarRechazo(r.rechazo) === 'sesion') {
      this.estadiaDelEnlaceSinSesion.set(true);
      return;
    }
    consumirEstadiaDelEnlace();
    if (!r.ok) {
      this.avisoDeLaEstadia.set(mensajeDeLaEstadia(r.rechazo.code));
      return;
    }
    if (r.valor.estado === 'Completed') {
      this.estadiaDelAviso.set(r.valor);
      return;
    }
    this.avisoDeLaEstadia.set(
      r.valor.estado === 'Compensated'
        ? t('Travel.Booking.CancelledNoCharge', 'Cancelamos tu reserva sin confirmar. No se te cobró nada.')
        : r.valor.estado === 'Running'
          ? t('Travel.Booking.StillPending', 'Tu reserva sigue pendiente. Intenta de nuevo en un momento.')
          : t('Travel.Booking.NotConfirmable', 'Este viaje ya no se puede confirmar.'),
    );
  }

  /** La estadía CONFIRMADA del enlace del aviso: su comprobante, con lo que dijo el servidor. */
  readonly estadiaDelAviso = signal<EstadiaLeida | null>(null);

  /** El enlace del aviso llegó sin sesión: se ofrece entrar, y la vuelta lo trae de nuevo. */
  readonly estadiaDelEnlaceSinSesion = signal(false);
  readonly textoEntrarParaVerLaEstadia = t('Travel.Booking.StaySignIn', 'Inicia sesión para ver tu estadía.');
  readonly textoIniciarSesion = t('Travel.Booking.SignIn', 'Iniciar sesión');

  /** El login del sitio con la vuelta a ESTA página, enlace del aviso incluido. */
  loginUrl(): string {
    if (typeof window === 'undefined') {
      return LOGIN_PATH;
    }
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return `${LOGIN_PATH}?returnUrl=${encodeURIComponent(here)}`;
  }

  readonly factsDelAviso = computed<readonly ConfirmationFact[]>(() => {
    const e = this.estadiaDelAviso();
    if (!e) {
      return [];
    }
    return [
      { id: 'entrada', label: DATOS_DE_LA_ESTADIA.entrada, value: e.entrada || '—' },
      { id: 'salida', label: DATOS_DE_LA_ESTADIA.salida, value: e.salida || '—' },
      { id: 'habitacion', label: DATOS_DE_LA_ESTADIA.habitacion, value: e.habitacion || '—' },
      { id: 'total', label: DATOS_DE_LA_ESTADIA.pagado, value: e.total ? formatearImporte(e.total.amount, e.total.currency) : '—' },
    ];
  });

  /**
   * Por dónde reserva ESTE asistente: lo DECLARA el CMS en `bookingPath` —la puerta o la ruta directa, «directa» por
   * defecto— y el elemento no lo adivina. Una estadía que ya salió se termina por el suyo (la estrategia lo mira).
   */
  readonly caminoDeLaReserva = computed(() => caminoDeLaReserva(this.config()?.bookingPath));
  readonly porLaPuerta = computed(() => this.caminoDeLaReserva() === 'puerta');

  /** Por la puerta sin `<synergos-flujo>` arriba no se reserva: se dice, sin tocar la red. */
  readonly sinCoordinador = signal(false);
  readonly textoNoDisponible = t('Travel.Booking.Unavailable', 'Las reservas en línea no están disponibles en este momento.');
  readonly textoCancelarPendiente = t('Travel.Booking.CancelPending', 'Cancelar la reserva sin confirmar');

  /** Lo que la puerta contestó a una acción sobre la estadía pendiente (cancelarla). */
  readonly avisoDeLaEstadia = signal('');

  /**
   * La estadía abierta por la puerta y sin confirmar de esta sesión: la única que se ofrece cancelar (defecto 3). Lo
   * confirmado lo gestiona quien vende (006-P3).
   */
  readonly estadiaPendienteId = computed(() => estadiaPendiente(this.#store.session()));

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
    // El fallo lo dice el ASISTENTE, una vez (UI#91). Acá el `pay` APARTA la habitación y el
    // cobro es el `confirm`, así que el texto por defecto decía «Ya recibimos tu pago» justo
    // cuando lo que había fallado era el pago.
    payFailedMessage: 'Esa habitación ya no está disponible. Elige otra de las opciones.',
    confirmFailedMessage: 'No pudimos completar el pago de tu reserva. Revisa tus datos e intenta de nuevo.',
    // Por la puerta el aviso lo elige el `code`. Cerrar captura ANTES de confirmar: si lo que falló fue el apartado,
    // el total ya se había cobrado y se devuelve.
    mensajeDeFallo: (motivo, referenciaCapturada) =>
      !this.porLaPuerta()
        ? null
        : motivo.startsWith('booking.hold_') && referenciaCapturada
          ? t('Travel.Booking.RefundIssued', 'No pudimos confirmar tu viaje; te devolvimos el pago.')
          : mensajeDeLaEstadia(motivo),
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

  /** Lo que la estrategia necesita para apartar: quién es el huésped, y por dónde y desde dónde reserva. */
  readonly wizardInstrument = computed<Readonly<Record<string, unknown>>>(() => ({
    provider: 'booking',
    guest: { name: this.guestName().trim(), email: this.guestEmail().trim() } satisfies BookingGuest,
    // Desde aquí la estrategia encuentra, por ancestro, el `<synergos-flujo>` de la página.
    host: this.#host,
    camino: this.caminoDeLaReserva(),
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
      { id: 'entrada', label: DATOS_DE_LA_ESTADIA.entrada, value: v.checkIn },
      { id: 'salida', label: DATOS_DE_LA_ESTADIA.salida, value: v.checkOut },
      { id: 'habitacion', label: DATOS_DE_LA_ESTADIA.habitacion, value: this.selectedOffer()?.roomTypeName ?? '—' },
      { id: 'total', label: DATOS_DE_LA_ESTADIA.pagado, value: v.totalPriceFormatted },
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
   *
   * **El aviso lo pone el asistente** (`payFailedMessage` = no se pudo apartar,
   * `confirmFailedMessage` = no se pudo cobrar; ver `wizardConfig`). Esta ficha lo
   * repetía en su banner y el lector de pantalla oía dos `role="alert"` (UI#91). Lo que
   * queda acá es lo que el asistente no puede hacer: soltar la habitación que ya no está.
   */
  onFailed(reason: string): void {
    // Con una estadía todavía abierta por la puerta, la habitación es suya: no se suelta la elección.
    if (!HABITACION_PERDIDA.has(reason) || this.estadiaPendienteId()) {
      return;
    }
    // La selección muerta se quita: dejarla deja el botón de confirmar vivo
    // sobre algo que el motor ya rechazó.
    const item = this.selectedItem();
    if (item) {
      this.#store.removeItem(item.id);
    }
    this.offers.set([]);
    void this.refreshAvailability();
  }

  /**
   * Cancela la estadía PENDIENTE: suelta el apartado y anula la autorización. Lo confirmado no se cancela aquí: lo
   * gestiona quien vende (006-P3). Lo que queda lo dice el servidor.
   */
  async cancelarEstadiaPendiente(): Promise<void> {
    const id = this.estadiaPendienteId();
    if (!id) {
      return;
    }
    const r = await cancelarEstadia(this.#host, id);
    if (r.ok && r.valor.estado === 'Compensated') {
      this.#store.setSession(sinEstadiaPendiente(this.#store.getValidSession()));
      this.avisoDeLaEstadia.set(t('Travel.Booking.CancelledNoCharge', 'Cancelamos tu reserva sin confirmar. No se te cobró nada.'));
    } else {
      this.avisoDeLaEstadia.set(
        r.ok ? t('Travel.Booking.StillPending', 'Tu reserva sigue pendiente. Intenta de nuevo en un momento.') : mensajeDeLaEstadia(r.rechazo.code),
      );
    }
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
    this.estadiaDelAviso.set(null);
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
