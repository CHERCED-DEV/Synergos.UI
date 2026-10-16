import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  InjectionToken,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { HostIdentityService } from '@synergos/core';
import {
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import type { ReservaProps, ServicioReservable } from '@synergos/contracts';
import {
  AVISOS_DE_LOS_FLUJOS,
  clasificarRechazo,
  elegirMensaje,
  formatearImporte,
  hayCoordinador,
  t,
  type ClaseDeRechazo,
  type RechazoDelFlujo,
} from '@synergos/vitals-core';
import {
  diasAbiertos,
  esDiaDeLaSemana,
  franjaLegible,
  horasDelDia,
  minutosDe,
  ventanaDe,
  zonaValida,
  type Ventana,
} from './reserva.horario';
import {
  FLUJO_RESERVA,
  abrirReserva,
  cancelarReserva,
  cerrarReserva,
  consultarReserva,
  cotizarReserva,
  escribirYAsentar,
  guardarPendiente,
  leerPendiente,
  llaveDeLaIntencion,
  olvidarPendiente,
  type Importe,
  type PendienteGuardada,
  type ReservaAsentada,
  type ReservaLeida,
} from './reserva.strategy';

/**
 * El `config` que manda el CMS tiene la forma de `ReservaProps`, GENERADO del record C# (ADR 0135):
 * lo del editor, el servicio reservable que eligió (leído de su ficha) y, del sitio (ADR 0137), por
 * dónde reserva y en qué zona horaria. El precio NO viaja: lo dice la cotización del servidor.
 */
export type ReservaConfig = Partial<ReservaProps>;

/** Por dónde reserva el elemento, como lo decide el CMS. Otra palabra no reserva. */
const CAMINOS = ['puerta', 'apagada', 'no-disponible'] as const;
type Camino = (typeof CAMINOS)[number];

/** El servicio tal como llega, o `undefined` si le falta algo para reservarse: no se completa. */
function servicioSaneado(valor: unknown): ServicioReservable | undefined {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return undefined;
  const v = valor as Partial<Record<keyof ServicioReservable, unknown>>;
  const id = coerceTrimmedStringInput(v.id);
  const nombre = coerceTrimmedStringInput(v.nombre);
  const duracion = typeof v.duracionMinutos === 'number' && Number.isInteger(v.duracionMinutos) ? v.duracionMinutos : 0;
  const dias = Array.isArray(v.dias) ? [...new Set(v.dias.filter(esDiaDeLaSemana))] : [];
  const abre = coerceTrimmedStringInput(v.abre);
  const cierra = coerceTrimmedStringInput(v.cierra);
  const desde = abre === undefined ? null : minutosDe(abre);
  const hasta = cierra === undefined ? null : minutosDe(cierra);
  if (!id || !nombre || duracion <= 0 || dias.length === 0 || desde === null || hasta === null || desde >= hasta) {
    return undefined;
  }
  return { id, nombre, duracionMinutos: duracion, dias, abre: abre as string, cierra: cierra as string };
}

/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeReservaConfig(value: ReservaConfig): ReservaConfig {
  return omitUndefinedProperties<ReservaProps>({
    heading: coerceTrimmedStringInput(value.heading),
    subheading: coerceTrimmedStringInput(value.subheading),
    servicio: servicioSaneado(value.servicio),
    enlaceAlternativo: coerceTrimmedStringInput(value.enlaceAlternativo),
    camino: coerceStringEnumInput(value.camino, CAMINOS),
    zona: coerceTrimmedStringInput(value.zona),
  });
}

/** El reloj de la pantalla: qué horas de hoy ya pasaron. Los specs lo fijan. */
export const RESERVA_RELOJ = new InjectionToken<() => number>('RESERVA_RELOJ', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});

/**
 * El parámetro de la consulta con el que llega la reserva del enlace del aviso: el de
 * `Synergos:Puerta:Flujos:reservas.servicio:Aviso:Ruta` del CMS, que `gate:avisos` (G-15) cruza.
 */
export const PARAMETRO_DE_LA_RESERVA = AVISOS_DE_LOS_FLUJOS[FLUJO_RESERVA].parametro;

/** Qué pinta el elemento. Las cuatro primeras no llaman a nada. */
export type Pantalla =
  | 'apagada'
  | 'no-disponible'
  | 'sin-servicio'
  | 'sesion'
  | 'elegir'
  | 'revisando'
  | 'apartada'
  | 'sin-respuesta'
  | 'desconocida'
  | 'confirmada';

/** En qué punto de la reserva está la pantalla. */
type Paso =
  | { readonly tipo: 'elegir' }
  | { readonly tipo: 'revisando' }
  | { readonly tipo: 'apartada'; readonly reserva: ReservaLeida }
  | { readonly tipo: 'sin-respuesta'; readonly pendiente: PendienteGuardada }
  | { readonly tipo: 'desconocida'; readonly id: string }
  | { readonly tipo: 'confirmada'; readonly reserva: ReservaLeida };

/** La cotización de la franja elegida: el total es SIEMPRE el del servidor. */
type Cotizacion =
  | { readonly estado: 'nada' }
  | { readonly estado: 'cotizando' }
  | { readonly estado: 'ok'; readonly total: Importe | null };

/** Los rechazos que piden elegir otra hora: la franja ya no sirve. */
const DE_LA_FRANJA = new Set([
  'booking.at_capacity',
  'booking.slot_taken',
  'booking.insufficient_capacity',
  'booking.outside_opening_hours',
  'booking.crosses_midnight',
  'booking.bad_slot_length',
  'reservas.franja_invalida',
  'booking.window_in_the_past',
  'booking.hold_expired',
  'booking.hold_released',
]);

/** Una reserva deshecha sin rechazo que la explique: la franja venció (el abandono la suelta). */
const SIN_MOTIVO: RechazoDelFlujo = {
  code: 'booking.hold_expired',
  status: 0,
  transient: false,
  detail: '',
  origen: 'servidor',
  extra: {},
};

/**
 * Los textos de la pantalla, del diccionario `Booking.Slot` que declara `ReservaProps` (ADR 0136).
 * El respaldo es el es-CO de uSync: es lo que se ve standalone, o si la página no publicó la sección.
 */
function textosDeReserva() {
  return {
    dia: t('Booking.Slot.Day', 'Día'),
    hora: t('Booking.Slot.Time', 'Hora'),
    duracion: t('Booking.Slot.Duration', 'Duración'),
    minutos: t('Booking.Slot.Minutes', 'min'),
    total: t('Booking.Slot.Total', 'Total'),
    cotizando: t('Booking.Slot.Quoting', 'Calculando el total'),
    iniciarSesion: t('Booking.Slot.SignIn', 'Inicia sesión para reservar'),
    reservar: t('Booking.Slot.Reserve', 'Reservar esta hora'),
    apartada: t('Booking.Slot.Pending', 'Tu franja está apartada. Confirma para pagar y asegurarla.'),
    confirmar: t('Booking.Slot.Confirm', 'Confirmar y pagar'),
    cancelar: t('Booking.Slot.Cancel', 'Cancelar la reserva'),
    confirmada: t('Booking.Slot.Confirmed', 'Reserva confirmada'),
    numero: t('Booking.Slot.Number', 'Número de reserva'),
    cancelada: t('Booking.Slot.Cancelled', 'Reserva cancelada: no se cobró nada.'),
    revisando: t('Booking.Slot.Checking', 'Revisando el estado de tu reserva'),
    revisar: t('Booking.Slot.Check', 'Revisar mi reserva'),
    noDisponible: t('Booking.Slot.Unavailable', 'La reserva en línea no está disponible ahora.'),
    alternativa: t('Booking.Slot.Alternative', 'Escríbenos para reservar'),
    noConfigurado: t('Booking.Slot.NotConfigured', 'Este bloque todavía no tiene un servicio reservable.'),
    conElNegocio: t('Booking.Slot.ManageWithBusiness', 'Para cambiar o cancelar una reserva confirmada, contacta al negocio.'),
  } as const;
}

/** Un texto por `code` (los de `contracts/puerta-y-orquestador.md` de la línea) y uno por clase. */
function rechazosDeReserva(): {
  readonly porCodigo: Readonly<Record<string, string>>;
  readonly porClase: Readonly<Record<ClaseDeRechazo, string>>;
} {
  const tomada = t('Booking.Slot.Errors.Taken', 'Esa hora ya no está. Elige otra.');
  const fuera = t('Booking.Slot.Errors.OutsideHours', 'Esa hora está fuera del horario del servicio.');
  const pasada = t('Booking.Slot.Errors.Past', 'Esa hora ya pasó.');
  const vencida = t(
    'Booking.Slot.Errors.Expired',
    'Tu franja venció antes de confirmar. Si se alcanzó a cobrar, se devuelve entero. Elige otra hora.',
  );
  const noReservable = t('Booking.Slot.Errors.NotBookable', 'Este servicio no se puede reservar en línea ahora.');
  const pago = t('Booking.Slot.Errors.Payment', 'El pago no pasó. Puedes intentar de nuevo.');
  const ocupada = t('Booking.Slot.Errors.Busy', 'Estamos terminando otra operación sobre esta reserva. Intenta en un momento.');
  const generico = t('Booking.Slot.Errors.Generic', 'Algo falló. Revisa el estado de tu reserva antes de intentar de nuevo.');
  return {
    porCodigo: {
      'booking.at_capacity': tomada,
      'booking.slot_taken': tomada,
      'booking.insufficient_capacity': tomada,
      'booking.outside_opening_hours': fuera,
      'booking.crosses_midnight': fuera,
      'booking.bad_slot_length': fuera,
      'reservas.franja_invalida': fuera,
      'booking.window_in_the_past': pasada,
      'booking.hold_expired': vencida,
      'booking.hold_released': vencida,
      'reservas.servicio_no_reservable': noReservable,
      'reservas.servicio_invalido': noReservable,
      'booking.resource_not_found': noReservable,
      'pricing.price_not_found': noReservable,
      'pricing.price_not_in_effect': noReservable,
      'pricing.no_price': noReservable,
      'payments.declined': pago,
      'payments.payment_declined': pago,
      'payments.payment_failed': pago,
      'payments.capture_failed': pago,
      'flow.busy': ocupada,
      'reservas.compensation_in_flight': ocupada,
    },
    porClase: {
      sesion: t('Booking.Slot.SignIn', 'Inicia sesión para reservar'),
      reintentable: generico,
      no_disponible: t('Booking.Slot.Unavailable', 'La reserva en línea no está disponible ahora.'),
      defecto: generico,
      negado: generico,
    },
  };
}

/** La reserva del enlace del aviso: `?reserva={id}`. Vacío sin ella. */
function reservaDelEnlace(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(PARAMETRO_DE_LA_RESERVA)?.trim() ?? '';
}

/** La consulta de la página sin `?reserva=`: se usa una vez, y lo que quede lo reabriría cada recarga. */
function consultaSinLaReserva(): URLSearchParams {
  const consulta = new URLSearchParams(window.location.search);
  consulta.delete(PARAMETRO_DE_LA_RESERVA);
  return consulta;
}

function consumirReservaDelEnlace(): void {
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has(PARAMETRO_DE_LA_RESERVA)) return;
  const texto = consultaSinLaReserva().toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${texto ? `?${texto}` : ''}${window.location.hash}`);
}

/**
 * `<synergos-reserva>` — la reserva de un servicio por franja (011-booking-reserva, ADR 0140).
 *
 * <p>El servicio es el de la página: lo eligió el editor y el CMS lo manda con su duración, sus
 * días y su horario. Se elige día y hora DENTRO de ese horario —sin marcar ninguna como libre: sin
 * la lectura de disponibilidad del núcleo no se sabe— y el total lo cotiza el servidor. Reservar
 * es de miembros: sin sesión, el enlace al login que vuelve aquí, y ninguna llamada.</p>
 *
 * <p>Todo va por el `<synergos-flujo>` que la vista coloca alrededor (`reserva.strategy.ts`): abrir
 * aparta y autoriza, confirmar captura y confirma, cancelar deshace lo no confirmado. Lo que la
 * pantalla afirma sale de la respuesta del servidor; si no contestó con la reserva, se consulta
 * antes de decir nada. Una reserva pendiente se resuelve —terminar o cancelar— antes de abrir otra.</p>
 *
 * <p>Con `apagada` el elemento muestra el enlace alternativo del editor; con `no-disponible`, o sin
 * coordinador arriba, lo dice. En los dos casos no llama a nada.</p>
 */
@Component({
  selector: 'synergos-reserva',
  standalone: true,
  templateUrl: './reserva.html',
  styleUrl: './reserva.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-reserva' },
})
export class ReservaElementComponent implements OnInit {
  readonly #identidad = inject(HostIdentityService);
  readonly #reloj = inject(RESERVA_RELOJ);
  /** El `<synergos-reserva>`: desde él la reserva encuentra, por ancestro, su `<synergos-flujo>`. */
  readonly #host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;

  // ── Lo que el CMS pasa ─────────────────────────────────────────────────

  readonly config = input<ReservaConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ReservaProps>(sanitizeReservaConfig),
  });
  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });
  readonly subheadingInput = input<string | undefined>(undefined, { alias: 'subheading' });

  readonly txt = textosDeReserva();
  readonly #rechazos = rechazosDeReserva();

  readonly heading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.headingInput()),
      this.config()?.heading,
      t('Booking.Slot.Defaults.Heading', 'Reserva tu cita'),
    ),
  );
  readonly subheading = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.subheadingInput()), this.config()?.subheading, ''),
  );
  readonly servicio = computed(() => this.config()?.servicio ?? null);
  readonly enlaceAlternativo = computed(() => this.config()?.enlaceAlternativo ?? '');
  /** Sin camino declarado no se reserva: el CMS lo manda siempre, y standalone no hay puerta. */
  readonly camino = computed<Camino>(() => (this.config()?.camino as Camino | undefined) ?? 'no-disponible');
  readonly zona = computed(() => {
    const zona = this.config()?.zona;
    return zonaValida(zona) ? zona : null;
  });

  readonly #locale = typeof document !== 'undefined' && document.documentElement.lang ? document.documentElement.lang : 'es-CO';

  // ── Estado de pantalla ─────────────────────────────────────────────────

  readonly paso = signal<Paso>({ tipo: 'elegir' });
  /** La puerta o el coordinador dijeron que la reserva no está abierta aquí. */
  readonly noDisponible = signal(false);
  /** La puerta contestó que falta la sesión (venció, o se llegó por el enlace del aviso sin ella). */
  readonly sesionRequerida = signal(false);
  /** Una escritura en vuelo: no se pide dos veces. */
  readonly ocupado = signal(false);
  /** Lo que se le dice a la persona: la región viva existe siempre y sólo cambia su texto (regla 42). */
  readonly aviso = signal('');

  readonly dia = signal('');
  readonly hora = signal('');
  readonly cotizacion = signal<Cotizacion>({ estado: 'nada' });
  #cotizacionEnCurso = 0;

  /** La reserva del enlace del aviso, ya fuera de la URL: sólo el login la devuelve al volver. */
  #reservaDelEnlace = '';

  /** Con el CMS delante y sin miembro: reservar pide la sesión ANTES de cualquier llamada. */
  readonly sinMiembro = computed(() => this.#identidad.hasHost() && !this.#identidad.isAuthenticated());

  readonly pantalla = computed<Pantalla>(() => {
    const camino = this.camino();
    if (camino === 'apagada') return 'apagada';
    if (camino !== 'puerta' || this.noDisponible()) return 'no-disponible';
    if (!this.servicio() || !this.zona()) return 'sin-servicio';
    if (this.sesionRequerida()) return 'sesion';
    return this.paso().tipo;
  });

  readonly dias = computed(() => {
    const servicio = this.servicio();
    const zona = this.zona();
    return servicio && zona ? diasAbiertos(servicio, zona, this.#reloj(), this.#locale) : [];
  });

  readonly horas = computed(() => {
    const servicio = this.servicio();
    const zona = this.zona();
    const dia = this.dia();
    return servicio && zona && dia ? horasDelDia(servicio, dia, zona, this.#reloj()) : [];
  });

  /** La franja elegida, como viaja. */
  readonly ventana = computed<Ventana | null>(() => {
    const servicio = this.servicio();
    const zona = this.zona();
    return servicio && zona && this.dia() && this.hora() ? ventanaDe(servicio, this.dia(), this.hora(), zona) : null;
  });

  /** Reservar exige la franja, el total ya cotizado por el servidor y nada en vuelo. */
  readonly puedeReservar = computed(
    () => this.ventana() !== null && this.cotizacion().estado === 'ok' && !this.ocupado() && !this.sinMiembro(),
  );

  readonly duracion = computed(() => {
    const servicio = this.servicio();
    return servicio ? `${this.txt.duracion}: ${servicio.duracionMinutos} ${this.txt.minutos}` : '';
  });

  /** La reserva en pantalla (apartada o confirmada), para el comprobante. */
  readonly reserva = computed<ReservaLeida | null>(() => {
    const paso = this.paso();
    return paso.tipo === 'apartada' || paso.tipo === 'confirmada' ? paso.reserva : null;
  });

  ngOnInit(): void {
    const servicio = this.servicio();
    if (this.camino() !== 'puerta' || !servicio || !this.zona()) return;
    if (!hayCoordinador(this.#host, FLUJO_RESERVA)) {
      this.noDisponible.set(true);
      return;
    }

    const delEnlace = reservaDelEnlace();
    consumirReservaDelEnlace();
    if (delEnlace) {
      this.#reservaDelEnlace = delEnlace;
      if (this.sinMiembro()) {
        this.sesionRequerida.set(true);
        return;
      }
      void this.revisar(delEnlace);
      return;
    }

    const pendiente = leerPendiente(servicio.id);
    if (pendiente?.id) {
      void this.revisar(pendiente.id);
    } else if (pendiente) {
      this.paso.set({ tipo: 'sin-respuesta', pendiente });
      this.aviso.set(this.#rechazos.porClase.reintentable);
    }
  }

  // ── Elegir ─────────────────────────────────────────────────────────────

  elegirDia(evento: Event): void {
    this.dia.set((evento.target as HTMLSelectElement | null)?.value ?? '');
    this.hora.set('');
    this.#cotizacionEnCurso++;
    this.cotizacion.set({ estado: 'nada' });
  }

  elegirHora(evento: Event): void {
    this.hora.set((evento.target as HTMLSelectElement | null)?.value ?? '');
    void this.cotizar();
  }

  /** El total de la franja elegida, del servidor. Sin miembro no se pide: la puerta es de miembros. */
  async cotizar(): Promise<void> {
    const servicio = this.servicio();
    const ventana = this.ventana();
    const turno = ++this.#cotizacionEnCurso;
    if (!servicio || !ventana || this.sinMiembro() || this.pantalla() !== 'elegir') {
      this.cotizacion.set({ estado: 'nada' });
      return;
    }
    this.cotizacion.set({ estado: 'cotizando' });
    const r = await cotizarReserva(this.#host, { servicio: servicio.id, ventana });
    if (turno !== this.#cotizacionEnCurso) return;
    if (r.ok) {
      this.cotizacion.set({ estado: 'ok', total: r.valor });
      this.aviso.set('');
      return;
    }
    this.cotizacion.set({ estado: 'nada' });
    this.#rechazado(r.rechazo);
  }

  /**
   * Abre la reserva de la franja elegida. Si hay una pendiente de este servicio —la dejó otro bloque
   * de la página, o una vuelta del login— no abre otra: la pone en pantalla para terminarla o
   * cancelarla.
   */
  async reservar(): Promise<void> {
    const servicio = this.servicio();
    const ventana = this.ventana();
    if (!servicio || !ventana || !this.puedeReservar() || this.pantalla() !== 'elegir') return;
    const pendiente = leerPendiente(servicio.id);
    if (pendiente) {
      if (pendiente.id) {
        await this.revisar(pendiente.id);
      } else {
        this.paso.set({ tipo: 'sin-respuesta', pendiente });
        this.aviso.set(this.#rechazos.porClase.reintentable);
      }
      return;
    }
    await this.#abrir({ servicio: servicio.id, ventana, llave: llaveDeLaIntencion(servicio.id, ventana), id: null });
  }

  /** Abrir no contestó: se vuelve a pedir la MISMA intención, con la misma llave. */
  async reintentar(): Promise<void> {
    const paso = this.paso();
    if (paso.tipo !== 'sin-respuesta' || this.ocupado()) return;
    await this.#abrir(paso.pendiente);
  }

  async #abrir(pendiente: PendienteGuardada): Promise<void> {
    // Se guarda ANTES de pedir: si la respuesta no llega, al volver se sabe qué se pidió y con qué llave.
    guardarPendiente(pendiente);
    this.ocupado.set(true);
    try {
      const r = await abrirReserva(this.#host, { servicio: pendiente.servicio, ventana: pendiente.ventana }, pendiente.llave);
      if (r.ok) {
        guardarPendiente({ ...pendiente, id: r.valor.id });
        this.#asentar(r.valor, null, 'abrir');
        return;
      }
      // Sin una respuesta del servidor no se sabe si apartó: nada se reintenta solo, y la persona
      // vuelve a pedir la misma intención (la misma llave devuelve la reserva si existe).
      if (r.rechazo.transient || r.rechazo.origen !== 'servidor') {
        this.paso.set({ tipo: 'sin-respuesta', pendiente });
        this.aviso.set(this.#mensaje(r.rechazo));
        return;
      }
      olvidarPendiente(pendiente.servicio);
      this.paso.set({ tipo: 'elegir' });
      this.#rechazado(r.rechazo);
    } finally {
      this.ocupado.set(false);
    }
  }

  // ── La reserva abierta ─────────────────────────────────────────────────

  async confirmar(): Promise<void> {
    const paso = this.paso();
    if (paso.tipo !== 'apartada' || this.ocupado()) return;
    await this.#escribir(paso.reserva.id, cerrarReserva, 'cerrar');
  }

  async cancelar(): Promise<void> {
    const paso = this.paso();
    if (paso.tipo !== 'apartada' || this.ocupado()) return;
    await this.#escribir(paso.reserva.id, cancelarReserva, 'cancelar');
  }

  /** Lee en qué quedó una reserva y la pone en pantalla. */
  async revisar(id: string): Promise<void> {
    this.paso.set({ tipo: 'revisando' });
    this.aviso.set(this.txt.revisando);
    const r = await consultarReserva(this.#host, id);
    if (r.ok) {
      this.#asentar(r.valor, null, 'consultar');
      return;
    }
    if (clasificarRechazo(r.rechazo) === 'sesion') {
      this.sesionRequerida.set(true);
      return;
    }
    if (r.rechazo.status === 404) {
      const servicio = this.servicio();
      if (servicio) olvidarPendiente(servicio.id);
      this.paso.set({ tipo: 'elegir' });
      this.aviso.set(this.#mensaje(r.rechazo));
      return;
    }
    this.paso.set({ tipo: 'desconocida', id });
    this.aviso.set(this.#mensaje(r.rechazo));
  }

  revisarDeNuevo(): void {
    const paso = this.paso();
    if (paso.tipo === 'desconocida') void this.revisar(paso.id);
  }

  async #escribir(
    id: string,
    escribir: (desde: Element, id: string) => ReturnType<typeof cerrarReserva>,
    operacion: 'cerrar' | 'cancelar',
  ): Promise<void> {
    this.ocupado.set(true);
    try {
      const asentada: ReservaAsentada = await escribirYAsentar(this.#host, id, escribir);
      if (asentada.tipo === 'sesion') {
        this.sesionRequerida.set(true);
      } else if (asentada.tipo === 'desconocida') {
        this.paso.set({ tipo: 'desconocida', id });
        this.aviso.set(this.#mensaje(asentada.rechazo));
      } else {
        this.#asentar(asentada.reserva, asentada.rechazo, operacion);
      }
    } finally {
      this.ocupado.set(false);
    }
  }

  /**
   * Lo que dice la pantalla de una reserva LEÍDA del servidor. «No se cobró nada» sólo cuando la
   * persona la canceló, el servidor la dio por deshecha y no queda nada por deshacer.
   */
  #asentar(reserva: ReservaLeida, rechazo: RechazoDelFlujo | null, operacion: 'abrir' | 'cerrar' | 'cancelar' | 'consultar'): void {
    const servicio = this.servicio();
    switch (reserva.estado) {
      case 'Completed':
        if (servicio) olvidarPendiente(servicio.id);
        this.paso.set({ tipo: 'confirmada', reserva });
        this.aviso.set(this.txt.confirmada);
        return;
      case 'Running':
        if (servicio && reserva.ventana) {
          const guardada = leerPendiente(servicio.id);
          guardarPendiente({
            servicio: servicio.id,
            ventana: reserva.ventana,
            llave: guardada?.llave ?? llaveDeLaIntencion(servicio.id, reserva.ventana),
            id: reserva.id,
          });
        }
        this.paso.set({ tipo: 'apartada', reserva });
        this.aviso.set(rechazo ? this.#mensaje(rechazo) : this.txt.apartada);
        return;
      case 'Compensated':
        if (!reserva.deshaciendo) {
          if (servicio) olvidarPendiente(servicio.id);
          this.paso.set({ tipo: 'elegir' });
          if (operacion === 'cancelar' && !rechazo) {
            this.aviso.set(this.txt.cancelada);
          } else {
            this.#rechazado(rechazo ?? SIN_MOTIVO);
          }
          return;
        }
        break;
      default:
        break;
    }
    // Deshaciéndose (o rendida): no se afirma qué pasó con la plata hasta que termine.
    this.paso.set({ tipo: 'desconocida', id: reserva.id });
    this.aviso.set(rechazo ? this.#mensaje(rechazo) : this.txt.revisando);
  }

  /** Un rechazo en pantalla: la sesión, «no disponible», o su texto (y otra hora si la franja ya no sirve). */
  #rechazado(rechazo: RechazoDelFlujo): void {
    const clase = clasificarRechazo(rechazo);
    if (clase === 'sesion') {
      this.sesionRequerida.set(true);
      return;
    }
    if (clase === 'no_disponible') {
      this.noDisponible.set(true);
      return;
    }
    if (DE_LA_FRANJA.has(rechazo.code)) {
      this.hora.set('');
      this.cotizacion.set({ estado: 'nada' });
    }
    this.aviso.set(this.#mensaje(rechazo));
  }

  #mensaje(rechazo: RechazoDelFlujo): string {
    return elegirMensaje(rechazo, this.#rechazos.porCodigo, this.#rechazos.porClase);
  }

  // ── Lo que se pinta ────────────────────────────────────────────────────

  plata(importe: Importe): string {
    return formatearImporte(importe.amount, importe.currency, { locale: this.#locale });
  }

  franja(ventana: Ventana | null): string {
    const zona = this.zona();
    return ventana && zona ? franjaLegible(ventana, zona, this.#locale) : '';
  }

  /** El total cotizado, o `null`: sin total del servidor no se muestra precio. */
  totalCotizado(): Importe | null {
    const c = this.cotizacion();
    return c.estado === 'ok' ? c.total : null;
  }

  /**
   * Login del CMS de vuelta a ESTA página. Método y no `computed`: la URL cambia con la navegación.
   * `?reserva=` viaja sólo si se llegó por el enlace del aviso: es la reserva que esa persona vino a ver.
   */
  loginUrl(): string {
    if (typeof window === 'undefined') return '/account/login';
    const consulta = consultaSinLaReserva();
    if (this.#reservaDelEnlace) consulta.set(PARAMETRO_DE_LA_RESERVA, this.#reservaDelEnlace);
    const texto = consulta.toString();
    const aqui = `${window.location.pathname}${texto ? `?${texto}` : ''}${window.location.hash}`;
    return `/account/login?returnUrl=${encodeURIComponent(aqui)}`;
  }
}
