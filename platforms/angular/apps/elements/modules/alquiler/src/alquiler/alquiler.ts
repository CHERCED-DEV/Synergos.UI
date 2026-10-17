import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import {
  SynEmptyStateComponent,
  SynErrorStateComponent,
  SynSkeletonComponent,
  SynStatusBannerComponent,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import type { AlquilerProps } from '@synergos/contracts';
import {
  clasificarRechazo,
  elegirMensaje,
  formatearImporte,
  hayCoordinador,
  t,
  type ClaseDeRechazo,
  type RechazoDelFlujo,
} from '@synergos/vitals-core';
import {
  AlquilerApiClient,
  isRejected,
  isUnauthorized,
} from './alquiler-api.client';
import { diasEsperando, montoTecleado } from './alquiler-personal';
import {
  abrirRenta,
  cancelarRenta,
  cerrarRenta,
  consultarRenta,
  cotizarRenta,
  escribirYAsentar,
  FLUJO_RENTA,
  guardarIntencion,
  leerIntencion,
  llaveDeLaIntencion,
  olvidarIntencion,
  ventanaDeLasFechas,
  type CotizacionDeLaPuerta,
  type IntencionGuardada,
  type RentaLeida,
} from './alquiler-renta.strategy';
import type {
  CaminoDeLaRenta,
  EquipmentCard,
  EquipmentDetail,
  Rental,
  RentalAgreement,
  RentalQuote,
} from './alquiler.model';

/**
 * El `config` que manda el CMS tiene la forma de `AlquilerProps`, GENERADO del record C#
 * (ADR 0135): lo del editor y dónde vive la API para el sitio, que sale de
 * `Synergos:Features:Alquiler` y el editor no ve (ADR 0137). La moneda no es configuración:
 * llega con cada importe del catálogo.
 */
export type AlquilerConfig = Partial<AlquilerProps>;

/** En qué pantalla está la app. */
type Vista = 'catalogo' | 'ficha' | 'mios' | 'personal';

/** Lo que la pantalla sabe sobre una lectura que puede no haber llegado. */
type Carga<T> =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'ok'; readonly valor: T }
  | { readonly estado: 'sin-sesion' }
  | { readonly estado: 'error'; readonly mensaje: string };

/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeAlquilerConfig(value: AlquilerConfig): AlquilerConfig {
  return omitUndefinedProperties<AlquilerProps>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    category: coerceTrimmedStringInput(value.category),
    heading: coerceTrimmedStringInput(value.heading),
    subheading: coerceTrimmedStringInput(value.subheading),
    rentalPath: normalizeRentalPath(value.rentalPath),
  });
}

/** El día de hoy en el reloj del navegador, `YYYY-MM-DD`. */
function hoy(ahora: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
}

/** El día anterior a una fecha `YYYY-MM-DD`; la misma si no se puede leer. */
function diaAnterior(fecha: string): string {
  const ms = Date.parse(`${fecha}T00:00:00Z`);
  return Number.isNaN(ms) ? fecha : new Date(ms - 86_400_000).toISOString().slice(0, 10);
}

/** El camino de la renta que declara el CMS (ADR 0140): uno de los dos, o nada. */
function normalizeRentalPath(value: unknown): CaminoDeLaRenta | undefined {
  return value === 'puerta' || value === 'directa' ? value : undefined;
}

/**
 * Los textos de la pantalla, del diccionario `Alquiler` que declara `AlquilerProps` (ADR 0136).
 * El respaldo es el es-CO de uSync: es lo que se ve standalone, o si la página no publicó la
 * sección. Los que llevan un dato son métodos del componente, con marcadores con nombre.
 */
function textosDeAlquiler() {
  return {
    secciones: t('Alquiler.Nav.Sections', 'Secciones'),
    equipos: t('Alquiler.Nav.Equipment', 'Equipos'),
    misAlquileres: t('Alquiler.Nav.Mine', 'Mis alquileres'),
    cargandoEquipos: t('Alquiler.Catalog.Loading', 'Cargando equipos'),
    catalogoFallo: t('Alquiler.Catalog.Failed', 'No pudimos leer el catálogo de equipos.'),
    catalogoVacio: t('Alquiler.Catalog.EmptyTitle', 'Todavía no hay equipos publicados'),
    catalogoVacioDetalle: t('Alquiler.Catalog.EmptyMessage', 'Cuando el editor publique el primero, aparece aquí.'),
    porDia: t('Alquiler.Catalog.PerDay', 'por día'),
    verYReservar: t('Alquiler.Catalog.Open', 'Ver y reservar'),
    cargandoFicha: t('Alquiler.Detail.Loading', 'Cargando la ficha'),
    volver: t('Alquiler.Detail.Back', '← Volver'),
    tarifas: t('Alquiler.Detail.Rates', 'Tarifas por duración'),
    desde: t('Alquiler.Form.From', 'Desde'),
    hasta: t('Alquiler.Form.To', 'Hasta'),
    unidades: t('Alquiler.Form.Units', 'Unidades'),
    calculando: t('Alquiler.Form.Quoting', 'Calculando…'),
    calcular: t('Alquiler.Form.Quote', 'Calcular'),
    reservando: t('Alquiler.Quote.Reserving', 'Reservando…'),
    reservar: t('Alquiler.Quote.Reserve', 'Reservar'),
    selloComprobado: t('Alquiler.Seal.Verified', 'Comprobante sellado y comprobado.'),
    selloNoCuadra: t('Alquiler.Seal.Mismatch', 'El sello de este comprobante NO cuadra.'),
    selloSinComprobar: t('Alquiler.Seal.Unverified', 'Comprobante emitido, sello sin comprobar.'),
    selloPendiente: t('Alquiler.Seal.Pending', 'Sello pendiente: lo ponemos en cuanto el servicio de firma responda.'),
    cargandoMios: t('Alquiler.Mine.Loading', 'Cargando tus alquileres'),
    sinSesion: t('Alquiler.Mine.SignInTitle', 'Inicia sesión para ver tus alquileres'),
    sinSesionDetalle: t('Alquiler.Mine.SignInMessage', 'Tus contratos van atados a tu cuenta, no a este navegador.'),
    miosFallo: t('Alquiler.Mine.Failed', 'No pudimos leer tus alquileres.'),
    miosVacio: t('Alquiler.Mine.EmptyTitle', 'Todavía no has alquilado nada'),
    miosVacioDetalle: t('Alquiler.Mine.EmptyMessage', 'Cuando reserves un equipo, su contrato aparece aquí.'),
    garantiaNoConsta: t('Alquiler.Mine.DepositUnknown', 'No sabemos si la garantía sigue retenida: escríbenos.'),
    contratoNoCuadra: t('Alquiler.Mine.SealMismatch', 'El sello NO cuadra con lo que dice este contrato.'),
    contratoSinComprobar: t('Alquiler.Mine.SealUnverified', 'Sello sin comprobar.'),
    devolvi: t('Alquiler.Mine.Returned', 'Devolví el equipo'),
    cancelar: t('Alquiler.Mine.Cancel', 'Cancelar'),
    confirmar: t('Alquiler.Quote.Confirm', 'Confirmar y pagar'),
    confirmando: t('Alquiler.Quote.Confirming', 'Confirmando…'),
    apartadas: t('Alquiler.Quote.Held', 'Apartamos tus unidades por unos minutos. Confírmalo para pagar.'),
    soltadas: t('Alquiler.Quote.HeldCancelled', 'Reserva cancelada: no se cobró nada.'),
    deshecha: t('Alquiler.Quote.Undone', 'El alquiler no se pudo confirmar y se deshizo: no queda nada cobrado ni apartado.'),
    noOfrecido: t('Alquiler.Quote.NotOffered', 'Este equipo no se puede alquilar ahora.'),
    personalTitulo: t('Alquiler.Staff.Title', 'Devoluciones por confirmar'),
    personalVacio: t('Alquiler.Staff.EmptyTitle', 'No hay devoluciones por confirmar'),
    personalFallo: t('Alquiler.Staff.Failed', 'No pudimos leer las devoluciones por confirmar.'),
    danio: t('Alquiler.Staff.Damage', 'Daño a cobrar de la garantía'),
    confirmarDevolucion: t('Alquiler.Staff.Confirm', 'Confirmar devolución'),
    cancelarAlquiler: t('Alquiler.Staff.Cancel', 'Cancelar alquiler'),
    penalidad: t('Alquiler.Staff.Penalty', 'Penalidad a cobrar de la garantía'),
    montoIlegible: t('Alquiler.Staff.BadAmount', 'Escribe el monto en pesos, sin centavos: 50000 o 50.000.'),
  } as const;
}

/**
 * Qué decir de un rechazo de la renta, por su `code` (ADR 0136: los textos los pone la funcionalidad, las hojas
 * reciben strings), y si el código no tiene texto, por su CLASE con el mensaje genérico de la operación. Los que
 * llevan un dato toman los límites de la ficha que se está alquilando.
 */
function rechazosDeAlquiler(eq: EquipmentDetail | null, generico: string): {
  readonly porCodigo: Readonly<Record<string, string>>;
  readonly porClase: Readonly<Record<ClaseDeRechazo, string>>;
} {
  const noOfrecido = t('Alquiler.Quote.NotOffered', 'Este equipo no se puede alquilar ahora.');
  return {
    porCodigo: {
      'alquiler.equipment_not_offered': noOfrecido,
      'booking.at_capacity': t('Alquiler.Errors.NoUnits', 'No quedan unidades de este equipo en esas fechas.'),
      'alquiler.window_out_of_bounds': t('Alquiler.Errors.WindowOutOfBounds', 'Este equipo se alquila entre {min} y {max} días.', {
        min: eq?.minDays ?? 1,
        max: eq?.maxDays ?? 1,
      }),
      'alquiler.window_too_long': t('Alquiler.Errors.WindowTooLong', 'No alquilamos por tantos días.'),
      'alquiler.bad_window': t('Alquiler.Errors.BadWindow', 'La devolución tiene que ser posterior al retiro.'),
      'alquiler.bad_quantity': t('Alquiler.Errors.BadQuantity', 'Elige entre 1 y {max} unidades.', { max: eq?.units ?? 1 }),
      'booking.hold_expired': t('Alquiler.Quote.Expired', 'Tu reserva venció y no se cobró nada. Vuelve a reservar.'),
      'flow.busy': t('Alquiler.Errors.Busy', 'Estamos terminando otra operación sobre este alquiler. Inténtalo en un momento.'),
      'alquiler.already_started': t('Alquiler.Errors.AlreadyStarted', 'El alquiler ya empezó: declara la devolución cuando entregues el equipo.'),
      'alquiler.staff_required': t('Alquiler.Errors.StaffRequired', 'Esta operación la hace el personal.'),
      'alquiler.damage_exceeds_deposit': t('Alquiler.Errors.DamageExceedsDeposit', 'El daño supera la garantía retenida.'),
      'alquiler.retention_expired': t('Alquiler.Errors.RetentionExpired', 'La retención de la garantía venció: no se puede cobrar el daño.'),
      'alquiler.settlement_in_flight': t('Alquiler.Errors.Busy', 'Estamos terminando otra operación sobre este alquiler. Inténtalo en un momento.'),
    },
    porClase: {
      sesion: t('Alquiler.Errors.SignInToRent', 'Hay que iniciar sesión para alquilar.'),
      reintentable: generico,
      no_disponible: noOfrecido,
      defecto: generico,
      negado: generico,
    },
  };
}

/**
 * `<synergos-alquiler>` — la app del vertical de alquiler de equipos (#147).
 *
 * <p>Los tres ejes del molde, cada uno en su sitio: el <b>catálogo</b> sale del contenido del
 * CMS (`GET /equipment`), la <b>transacción</b> cruza al orquestador cuando el despliegue lo
 * enciende (`POST /rentals`), y el <b>comprobante</b> se lee de este lado con su sello ya
 * comprobado por el servidor — que es lo que permite que «mis alquileres» siga sirviendo con el
 * orquestador caído.</p>
 *
 * <p><b>Lo que esta app NO hace, dicho en vez de disimulado.</b> No usa `DiscoveryShell`,
 * `DetailShell` ni `CheckoutWizard`, que es como están escritos los siete verticales anteriores:
 * monta markup propio con los cuatro componentes de estado del design system. Es un atajo tomado
 * a conciencia y anotado, que es lo que la HU #147 pide de un atajo — el vertical tiene ocho
 * rutas y tres pantallas, y aprender cinco APIs de shell para eso habría costado más que el
 * vertical entero. Migrarlo es trabajo real y no urgente; lo que NO se podía posponer era que
 * cada ruta del borde tuviera un lector, porque una escritura sin camino de lectura está
 * enterrada, no guardada.</p>
 *
 * <p><b>Y nada se fabrica.</b> Reservar no inventa un identificador cuando el borde no contesta,
 * devolver no inventa un acuse, y el sello de un comprobante se pinta como comprobado sólo si el
 * servidor lo dijo: `verified` en nulo es «no consta» y se ve distinto de «no cuadra».</p>
 */
@Component({
  selector: 'synergos-alquiler',
  standalone: true,
  imports: [
    SynEmptyStateComponent,
    SynErrorStateComponent,
    SynSkeletonComponent,
    SynStatusBannerComponent,
  ],
  templateUrl: './alquiler.html',
  styleUrl: './alquiler.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-alquiler' },
})
export class AlquilerElementComponent implements OnInit {
  readonly #api = inject(AlquilerApiClient);
  readonly #host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;

  // ── Lo que el CMS pasa ─────────────────────────────────────────────────

  readonly config = input<AlquilerConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AlquilerProps>(sanitizeAlquilerConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly categoryInput = input<string | undefined>(undefined, { alias: 'category' });
  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });
  readonly subheadingInput = input<string | undefined>(undefined, { alias: 'subheading' });

  readonly txt = textosDeAlquiler();

  /**
   * Dónde vive la API. Sin ella no se llama a nada y el catálogo dice que no se pudo leer: no
   * hay una base de respaldo compilada (ADR 0137) — la fija cada sitio, no el bloque.
   */
  readonly apiBase = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.apiBaseInput()), this.config()?.apiBase, '').replace(
      /\/+$/,
      '',
    ),
  );
  readonly category = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.categoryInput()), this.config()?.category, ''),
  );
  readonly heading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.headingInput()),
      this.config()?.heading,
      t('Alquiler.Defaults.Heading', 'Alquiler de equipos'),
    ),
  );
  readonly subheading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.subheadingInput()),
      this.config()?.subheading,
      t(
        'Alquiler.Defaults.Subheading',
        'Elige el equipo, las fechas y cuántas unidades. La garantía se retiene, no se cobra.',
      ),
    ),
  );

  /**
   * Por dónde alquila este sitio, como lo DECLARA el CMS (`rentalPath`, ADR 0140): la puerta o la ruta directa.
   * Sin declaración —el elemento suelto, fuera del CMS— es la directa de siempre. Se lee al EMPEZAR una
   * intención y queda anotado en ella: confirmar va por el camino por el que se abrió, no por el de hoy.
   */
  readonly camino = computed<CaminoDeLaRenta>(() => normalizeRentalPath(this.config()?.rentalPath) ?? 'directa');

  // ── Estado de pantalla ─────────────────────────────────────────────────

  readonly vista = signal<Vista>('catalogo');
  readonly catalogo = signal<Carga<readonly EquipmentCard[]>>({ estado: 'cargando' });
  readonly ficha = signal<Carga<EquipmentDetail> | null>(null);
  readonly mios = signal<Carga<readonly RentalAgreement[]> | null>(null);
  /**
   * Las devoluciones que esperan al personal (T035). `null` es que quien está en sesión NO es del personal —o no se
   * sabe todavía—: la pestaña no se enseña, ni vacía. Se sabe preguntándole al servidor, nunca mirando un rol aquí.
   */
  readonly personal = signal<Carga<readonly RentalAgreement[]> | null>(null);

  readonly desde = signal('');
  readonly hasta = signal('');
  readonly unidades = signal(1);

  readonly cotizacion = signal<RentalQuote | null>(null);
  readonly cotizando = signal(false);
  readonly reservando = signal(false);
  readonly reserva = signal<Rental | null>(null);

  // ── La renta por la puerta (T032) ──────────────────────────────────────

  /** Lo que cotizó el servidor por la puerta: el total y la garantía, nunca calculados aquí. */
  readonly cotizacionPuerta = signal<CotizacionDeLaPuerta | null>(null);
  /** La renta abierta o confirmada por la puerta, tal como la leyó el servidor. */
  readonly renta = signal<RentaLeida | null>(null);
  readonly confirmando = signal(false);
  /** El contrato de la renta de la puerta, emitido por el CMS al leerlo. */
  readonly contratoPuerta = signal<RentalAgreement | null>(null);
  /** Lo que pasó y no es un problema: la reserva soltada sin cobrar nada. */
  readonly aviso = signal('');

  /** Si la renta de la puerta está apartada y espera a que la confirmen. */
  readonly apartada = computed(() => this.renta()?.estado === 'Running');

  /**
   * Lo que NO se pudo hacer, dicho tal cual.
   *
   * Una escritura que falla no degrada: se conserva lo tecleado y se nombra lo que quedó. Decir
   * «listo» a quien acaba de intentar reservar y no reservó es la invitación a intentarlo otra
   * vez sobre un equipo que nadie apartó.
   */
  readonly problema = signal('');

  readonly puedeCotizar = computed(() => {
    const f = this.ficha();
    if (!f || f.estado !== 'ok') return false;
    const dias = this.dias();
    return dias !== null && dias >= f.valor.minDays && dias <= f.valor.maxDays && this.unidades() >= 1;
  });

  /** Cuántos días pide la ventana, o `null` si todavía no es una ventana. */
  readonly dias = computed<number | null>(() => {
    const d = Date.parse(this.desde());
    const h = Date.parse(this.hasta());
    if (Number.isNaN(d) || Number.isNaN(h) || h <= d) return null;
    return Math.round((h - d) / 86400000);
  });

  // ── Lecturas ───────────────────────────────────────────────────────────

  /**
   * La primera lectura, aquí y no en el constructor: en un custom element las entradas del CMS
   * —la `apiBase` del sitio— llegan después de construirlo y antes de `ngOnInit`. Sin esta
   * llamada nadie pedía el catálogo y la pantalla se quedaba en el esqueleto (UI#96).
   */
  ngOnInit(): void {
    void this.cargarCatalogo();
  }

  /** Carga el catálogo. Es lo primero que la pantalla hace. */
  async cargarCatalogo(): Promise<void> {
    this.catalogo.set({ estado: 'cargando' });
    if (!this.apiBase()) {
      this.catalogo.set({ estado: 'error', mensaje: this.txt.catalogoFallo });
      return;
    }
    try {
      const equipos = await this.#api.equipment(this.apiBase(), this.category());
      this.catalogo.set({ estado: 'ok', valor: equipos });
    } catch {
      // No hay seed de este lado: sin catálogo se dice que no se pudo leer el catálogo.
      this.catalogo.set({ estado: 'error', mensaje: this.txt.catalogoFallo });
    }
  }

  /** Abre la ficha de un equipo. */
  async abrir(equipmentId: string): Promise<void> {
    this.vista.set('ficha');
    this.ficha.set({ estado: 'cargando' });
    this.cotizacion.set(null);
    this.reserva.set(null);
    this.cotizacionPuerta.set(null);
    this.renta.set(null);
    this.contratoPuerta.set(null);
    this.aviso.set('');
    this.problema.set('');
    try {
      const detalle = await this.#api.detail(this.apiBase(), equipmentId);
      this.ficha.set(
        detalle
          ? { estado: 'ok', valor: detalle }
          : { estado: 'error', mensaje: t('Alquiler.Errors.DetailGone', 'Ese equipo ya no está publicado.') },
      );
      if (detalle) {
        this.unidades.set(1);
        await this.#retomar(detalle.equipmentId);
      }
    } catch {
      this.ficha.set({
        estado: 'error',
        mensaje: t('Alquiler.Errors.DetailFailed', 'No pudimos leer la ficha del equipo.'),
      });
    }
  }

  /** Mis contratos. Sin sesión NO se enseña una bandeja vacía. */
  async cargarMios(): Promise<void> {
    this.vista.set('mios');
    this.mios.set({ estado: 'cargando' });
    try {
      const contratos = await this.#api.mine(this.apiBase());
      this.mios.set({ estado: 'ok', valor: contratos });
      void this.#sondearPersonal();
    } catch (error) {
      this.mios.set(
        isUnauthorized(error)
          ? { estado: 'sin-sesion' }
          : { estado: 'error', mensaje: this.txt.miosFallo },
      );
    }
  }

  // ── La cara del personal (T035) ────────────────────────────────────────

  /**
   * Pregunta al servidor si quien está en sesión es del personal: con 200 la pestaña aparece; con 403, 401 o un
   * fallo, no (nada se enseña de lo que no se pudo confirmar).
   */
  async #sondearPersonal(): Promise<void> {
    try {
      const lista = await this.#api.staffReturns(this.apiBase());
      if (lista === null) {
        this.personal.set(null);
        if (this.vista() === 'personal') this.vista.set('mios');
      } else if (this.vista() !== 'personal') {
        this.personal.set({ estado: 'ok', valor: lista });
      }
    } catch {
      if (this.vista() !== 'personal') this.personal.set(null);
    }
  }

  /** Abre la cara del personal y la lee de nuevo. */
  async cargarPersonal(): Promise<void> {
    this.vista.set('personal');
    this.personal.set({ estado: 'cargando' });
    try {
      const lista = await this.#api.staffReturns(this.apiBase());
      if (lista === null) {
        this.personal.set(null);
        this.vista.set('mios');
        return;
      }
      this.personal.set({ estado: 'ok', valor: lista });
    } catch {
      this.personal.set({ estado: 'error', mensaje: this.txt.personalFallo });
    }
  }

  /**
   * El personal confirma la devolución con el daño que tecleó: libera la garantía o cobra de ella. Un monto que no
   * se puede leer no se manda.
   */
  async confirmarDevolucion(rentalId: string, danioTecleado: string): Promise<void> {
    const danio = montoTecleado(danioTecleado);
    if (danio === null) {
      this.problema.set(this.txt.montoIlegible);
      return;
    }
    await this.#comoPersonal(() => this.#api.return(this.apiBase(), rentalId, danio),
      t('Alquiler.Errors.ReturnFailed', 'No pudimos registrar la devolución. El alquiler sigue abierto.'));
  }

  /** El personal cancela un alquiler confirmado con la penalidad que fije. */
  async cancelarComoPersonal(rentalId: string, penalidadTecleada: string): Promise<void> {
    const penalidad = montoTecleado(penalidadTecleada);
    if (penalidad === null) {
      this.problema.set(this.txt.montoIlegible);
      return;
    }
    await this.#comoPersonal(() => this.#api.cancel(this.apiBase(), rentalId, penalidad),
      t('Alquiler.Errors.CancelFailed', 'No pudimos cancelar el alquiler. Sigue reservado.'));
  }

  async #comoPersonal(escribir: () => Promise<Rental>, generico: string): Promise<void> {
    this.problema.set('');
    try {
      await escribir();
      await this.cargarPersonal();
    } catch (error) {
      this.problema.set(this.porQue(error, generico));
    }
  }

  /** «Declarada hace 3 día(s)», o vacío si no consta cuándo. */
  esperando(a: RentalAgreement): string {
    const dias = diasEsperando(a, this.ahora());
    return dias === null ? '' : t('Alquiler.Staff.Waiting', 'Declarada hace {dias} día(s)', { dias });
  }

  /** Lo cotizado deja de valer en cuanto cambian las fechas o las unidades, por cualquiera de los dos caminos. */
  limpiarCotizacion(): void {
    this.cotizacion.set(null);
    this.cotizacionPuerta.set(null);
  }

  /** Vuelve al catálogo. */
  volver(): void {
    this.vista.set('catalogo');
    this.ficha.set(null);
    this.problema.set('');
  }

  // ── Escrituras ─────────────────────────────────────────────────────────

  /** Cotiza sin comprometer nada. Su fallo deja la ficha sin precio, no con uno inventado. */
  async cotizar(): Promise<void> {
    const f = this.ficha();
    if (!f || f.estado !== 'ok' || !this.puedeCotizar()) return;
    if (this.camino() === 'puerta') {
      await this.#cotizarPorLaPuerta(f.valor);
      return;
    }

    this.cotizando.set(true);
    this.problema.set('');
    try {
      const quote = await this.#api.quote(
        this.apiBase(), f.valor.equipmentId, this.unidades(), this.desde(), this.hasta(),
      );
      this.cotizacion.set(quote);
      if (!quote) {
        this.problema.set(this.#cotizacionFallo());
      }
    } catch (error) {
      this.cotizacion.set(null);
      this.problema.set(this.porQue(error, this.#cotizacionFallo()));
    } finally {
      this.cotizando.set(false);
    }
  }

  /**
   * Reserva.
   *
   * <b>Nada se da por hecho si el borde no contesta:</b> el formulario se queda como está y el
   * mensaje dice qué NO ocurrió. Repetir es seguro — la llave que manda el cliente es la misma,
   * así que el servidor devuelve la reserva que ya existe en vez de apartar una segunda vez.
   */
  async reservar(): Promise<void> {
    const f = this.ficha();
    if (!f || f.estado !== 'ok' || !this.puedeCotizar()) return;
    if (this.camino() === 'puerta') {
      await this.#abrirPorLaPuerta(f.valor);
      return;
    }

    this.reservando.set(true);
    this.problema.set('');
    try {
      const rental = await this.#api.reserve(
        this.apiBase(), f.valor.equipmentId, this.unidades(), this.desde(), this.hasta(),
      );
      this.reserva.set(rental);
    } catch (error) {
      this.reserva.set(null);
      this.problema.set(
        this.porQue(
          error,
          t('Alquiler.Errors.ReserveFailed', 'No pudimos reservar el equipo. Vuelve a intentarlo.'),
        ),
      );
    } finally {
      this.reservando.set(false);
    }
  }

  /**
   * Confirma y paga la renta apartada. Va por el camino ANOTADO en la intención cuando se abrió —nunca por el que
   * diga la página ahora—: lo que se apartó por la puerta se confirma por la puerta, y la ruta directa no tiene un
   * «confirmar» al que caer (reservar por ella ya confirma; caer ahí apartaría otra vez).
   */
  async confirmar(): Promise<void> {
    const f = this.ficha();
    if (!f || f.estado !== 'ok') return;
    const intencion = leerIntencion(f.valor.equipmentId);
    if (intencion?.camino !== 'puerta' || !intencion.id) return;

    this.confirmando.set(true);
    this.problema.set('');
    try {
      const asentada = await escribirYAsentar(this.#host, intencion.id, cerrarRenta);
      if (asentada.tipo === 'sesion') {
        this.problema.set(this.#porClase('sesion', this.txt.confirmar, f.valor));
        return;
      }
      if (asentada.tipo === 'desconocida') {
        this.problema.set(this.#mensaje(asentada.rechazo, f.valor, this.#confirmacionFallo()));
        return;
      }
      await this.#asentar(intencion, asentada.renta, asentada.rechazo, f.valor);
    } finally {
      this.confirmando.set(false);
    }
  }

  /** Suelta la renta apartada sin confirmarla: no se cobra nada. */
  async soltar(): Promise<void> {
    const f = this.ficha();
    if (!f || f.estado !== 'ok') return;
    const intencion = leerIntencion(f.valor.equipmentId);
    if (intencion?.camino !== 'puerta' || !intencion.id) return;

    this.problema.set('');
    const asentada = await escribirYAsentar(this.#host, intencion.id, cancelarRenta);
    if (asentada.tipo === 'leida') {
      await this.#asentar(intencion, asentada.renta, asentada.rechazo, f.valor);
    } else {
      this.problema.set(this.#mensaje(asentada.rechazo, f.valor,
        t('Alquiler.Errors.CancelFailed', 'No pudimos cancelar el alquiler. Sigue reservado.')));
    }
  }

  /** Cotiza por la puerta: el servidor pone el total y la garantía con la oferta publicada del equipo. */
  async #cotizarPorLaPuerta(eq: EquipmentDetail): Promise<void> {
    if (!hayCoordinador(this.#host, FLUJO_RENTA)) {
      this.problema.set(this.txt.noOfrecido);
      return;
    }
    this.cotizando.set(true);
    this.problema.set('');
    this.cotizacionPuerta.set(null);
    try {
      const r = await cotizarRenta(this.#host, eq.equipmentId, this.unidades(), ventanaDeLasFechas(this.desde(), this.hasta()));
      if (r.ok && r.valor.total) {
        this.cotizacionPuerta.set(r.valor);
      } else {
        this.problema.set(r.ok ? this.#cotizacionFallo() : this.#mensaje(r.rechazo, eq, this.#cotizacionFallo()));
      }
    } finally {
      this.cotizando.set(false);
    }
  }

  /**
   * Aparta por la puerta. La intención —con su camino y su llave— se guarda ANTES de salir a la red: si la
   * respuesta no llega, reintentar repite la misma llave y el orquestador devuelve la renta que ya abrió.
   */
  async #abrirPorLaPuerta(eq: EquipmentDetail): Promise<void> {
    const desde = this.desde();
    const hasta = this.hasta();
    const unidades = this.unidades();
    const intencion: IntencionGuardada = {
      camino: 'puerta', equipo: eq.equipmentId, unidades, desde, hasta,
      llave: llaveDeLaIntencion(eq.equipmentId, unidades, desde, hasta), id: null,
    };
    guardarIntencion(intencion);

    this.reservando.set(true);
    this.problema.set('');
    this.aviso.set('');
    try {
      const r = await abrirRenta(this.#host, eq.equipmentId, unidades, ventanaDeLasFechas(desde, hasta), intencion.llave);
      if (r.ok) {
        await this.#asentar({ ...intencion, id: r.valor.id }, r.valor, null, eq);
      } else {
        this.problema.set(this.#mensaje(r.rechazo, eq,
          t('Alquiler.Errors.ReserveFailed', 'No pudimos reservar el equipo. Vuelve a intentarlo.')));
      }
    } finally {
      this.reservando.set(false);
    }
  }

  /**
   * Lo que quedó de una renta de la puerta, LEÍDO del servidor: apartada, confirmada (con su contrato) o deshecha.
   * El rechazo de la operación, si lo hubo, dice por qué no avanzó.
   */
  async #asentar(
    intencion: IntencionGuardada, renta: RentaLeida, rechazo: RechazoDelFlujo | null, eq: EquipmentDetail,
    alDeshacerse: string = this.txt.soltadas,
  ): Promise<void> {
    this.renta.set(renta);
    if (renta.estado === 'Running') {
      guardarIntencion({ ...intencion, id: renta.id });
      if (rechazo) this.problema.set(this.#mensaje(rechazo, eq, this.#confirmacionFallo()));
      return;
    }

    olvidarIntencion(intencion.equipo);
    this.cotizacionPuerta.set(null);
    if (renta.estado === 'Completed') {
      this.contratoPuerta.set(await this.#api.agreement(this.apiBase(), renta.id).catch(() => null));
      return;
    }
    // Deshecha (Compensated) o deshaciéndose: no se dice «no se cobró» mientras quede algo por deshacer.
    if (rechazo && clasificarRechazo(rechazo) !== 'negado') {
      this.problema.set(this.#mensaje(rechazo, eq, this.#confirmacionFallo()));
    } else if (renta.deshaciendo) {
      this.problema.set(this.#confirmacionFallo());
    } else if (rechazo) {
      this.problema.set(`${this.#mensaje(rechazo, eq, this.#confirmacionFallo())} ${this.txt.deshecha}`);
    } else {
      this.aviso.set(alDeshacerse);
    }
  }

  /**
   * Si esta pestaña dejó una renta de la puerta sin resolver para este equipo —se recargó, o se fue a iniciar
   * sesión—, se lee del servidor y se retoma donde quedó. Lo que se pidió por la ruta directa no se retoma: ya
   * quedó confirmado o no existe.
   */
  async #retomar(equipo: string): Promise<void> {
    const intencion = leerIntencion(equipo);
    if (intencion?.camino !== 'puerta' || !intencion.id || !hayCoordinador(this.#host, FLUJO_RENTA)) return;
    this.desde.set(intencion.desde);
    this.hasta.set(intencion.hasta);
    this.unidades.set(intencion.unidades);
    const r = await consultarRenta(this.#host, intencion.id);
    const f = this.ficha();
    if (r.ok && f?.estado === 'ok') {
      // Una que se deshizo sin que nadie la soltara desde aquí es la que venció: lo apartado dura minutos.
      await this.#asentar(intencion, r.valor, null, f.valor,
        t('Alquiler.Quote.Expired', 'Tu reserva venció y no se cobró nada. Vuelve a reservar.'));
    } else if (!r.ok && clasificarRechazo(r.rechazo) === 'negado') {
      olvidarIntencion(equipo);
    }
  }

  #mensaje(rechazo: RechazoDelFlujo, eq: EquipmentDetail | null, generico: string): string {
    const tabla = rechazosDeAlquiler(eq, generico);
    return elegirMensaje(rechazo, tabla.porCodigo, tabla.porClase);
  }

  #porClase(clase: ClaseDeRechazo, generico: string, eq: EquipmentDetail | null): string {
    return rechazosDeAlquiler(eq, generico).porClase[clase];
  }

  #confirmacionFallo(): string {
    return t('Alquiler.Errors.ConfirmFailed', 'No pudimos confirmar el alquiler. Vuelve a intentarlo.');
  }

  /** Cancela un alquiler antes de que el equipo salga. */
  async cancelar(rentalId: string, penalidad: number): Promise<void> {
    await this.cerrar(rentalId, penalidad, 'cancel');
  }

  /**
   * «Devolví el equipo»: DECLARA la devolución, sin monto. La garantía sigue retenida hasta que el personal la
   * confirme con el daño que haya (decisión 5 del lote 1).
   */
  async declarar(rentalId: string): Promise<void> {
    this.problema.set('');
    try {
      await this.#api.declareReturn(this.apiBase(), rentalId);
      await this.cargarMios();
    } catch (error) {
      this.problema.set(this.porQue(error,
        t('Alquiler.Errors.ReturnFailed', 'No pudimos registrar la devolución. El alquiler sigue abierto.')));
    }
  }

  /** Registra que el equipo volvió, con el daño que haya. */
  async devolver(rentalId: string, dano: number): Promise<void> {
    await this.cerrar(rentalId, dano, 'return');
  }

  private async cerrar(rentalId: string, monto: number, accion: 'return' | 'cancel'): Promise<void> {
    this.problema.set('');
    try {
      const rental = accion === 'return'
        ? await this.#api.return(this.apiBase(), rentalId, monto)
        : await this.#api.cancel(this.apiBase(), rentalId, monto);
      this.reserva.set(rental);
      await this.cargarMios();
    } catch (error) {
      this.problema.set(
        this.porQue(error, accion === 'return'
          ? t('Alquiler.Errors.ReturnFailed', 'No pudimos registrar la devolución. El alquiler sigue abierto.')
          : t('Alquiler.Errors.CancelFailed', 'No pudimos cancelar el alquiler. Sigue reservado.')),
      );
    }
  }

  /**
   * Qué decirle a quien está delante.
   *
   * Un rechazo de negocio trae su motivo y ése es el que sirve; cualquier otra cosa no se
   * traduce a un mensaje que suene concreto, porque un mensaje concreto sobre una causa que no
   * se conoce manda a alguien a arreglar lo que no está roto.
   */
  private porQue(error: unknown, generico: string): string {
    if (isUnauthorized(error)) {
      return t('Alquiler.Errors.SignInToRent', 'Hay que iniciar sesión para alquilar.');
    }
    if (isRejected(error)) {
      // El texto se elige por el `code` (sección Alquiler.Errors); sin texto para él, el motivo del borde.
      const f = this.ficha();
      const porCodigo = rechazosDeAlquiler(f?.estado === 'ok' ? f.valor : null, generico).porCodigo;
      return Object.prototype.hasOwnProperty.call(porCodigo, error.code)
        ? (porCodigo[error.code] as string)
        : error.detail || generico;
    }
    return generico;
  }

  /**
   * El sello de un comprobante, en las CUATRO respuestas posibles: comprobado, no cuadra, pendiente (el servicio de
   * firma no contestó al emitirlo) y sin comprobar. Pendiente no es «no cuadra»: el contrato es bueno, falta el sello.
   */
  sello(a: RentalAgreement): 'comprobado' | 'no-cuadra' | 'pendiente' | 'sin-comprobar' {
    if (a.verified === true) return 'comprobado';
    if (a.verified === false) return 'no-cuadra';
    if (a.sealPending) return 'pendiente';
    return 'sin-comprobar';
  }

  /** Lo que el registro dice del alquiler, en palabras; vacío si el borde no lo dijo. */
  estadoDelContrato(a: RentalAgreement): string {
    switch (a.state) {
      case 'reserved': return t('Alquiler.Mine.StateConfirmed', 'Confirmado');
      case 'declared': return t('Alquiler.Mine.StateDeclared', 'Devolución declarada: el personal la está revisando');
      case 'returned': return t('Alquiler.Mine.StateReturned', 'Devuelto');
      case 'cancelled': return t('Alquiler.Mine.StateCancelled', 'Cancelado');
      default: return '';
    }
  }

  /** Cómo se cerró la devolución: el daño y lo liberado, o que lo liberado no consta. Vacío si no se cerró. */
  desenlace(a: RentalAgreement): string {
    const d = a.outcome;
    if (!d) return '';
    const fecha = d.confirmedUtc.slice(0, 10);
    return d.depositReleased === null
      ? t('Alquiler.Mine.OutcomeUnknown', 'Devuelto el {fecha}. No sabemos si la garantía ya se liberó: escríbenos.', { fecha })
      : t('Alquiler.Mine.Outcome', 'Devuelto el {fecha}. Daño cobrado: {danio}. Garantía liberada: {liberada}.', {
          fecha,
          danio: this.plata(d.damage, a.currency),
          liberada: this.plata(d.depositReleased, a.currency),
        });
  }

  /** Si quien alquiló puede declarar la devolución: sólo de lo confirmado. */
  puedeDeclarar(a: RentalAgreement): boolean {
    return a.state === 'reserved';
  }

  /**
   * Si quien alquiló puede cancelarlo: lo confirmado, ANTES del día de inicio. Desde ese día lo cancela el personal
   * (la regla la aplica el servidor en el huso del despliegue; aquí sólo no se ofrece lo que se negaría).
   */
  puedeCancelar(a: RentalAgreement): boolean {
    return a.state === 'reserved' && hoy(this.ahora()) < a.start;
  }

  /** «Puedes cancelar hasta el 2026-11-04.»: el día anterior al de inicio. */
  cancelableHasta(a: RentalAgreement): string {
    return t('Alquiler.Mine.CancelUntil', 'Puedes cancelar hasta el {fecha}.', { fecha: diaAnterior(a.start) });
  }

  /** Cuándo es ahora; un campo para que las pruebas lo fijen. */
  ahora: () => Date = () => new Date();

  #cotizacionFallo(): string {
    return t('Alquiler.Errors.QuoteFailed', 'No pudimos calcular el valor de esas fechas.');
  }

  // ── Textos con un dato dentro ──────────────────────────────────────────

  /** Un importe con la moneda que trajo ESE dato; sin moneda, el número solo (CMS#196). */
  plata(valor: number, moneda: string): string {
    return formatearImporte(valor, moneda);
  }

  /** «Altura · 8 unidad(es)». */
  meta(e: EquipmentCard): string {
    return t('Alquiler.Catalog.Units', '{categoria} · {unidades} unidad(es)', {
      categoria: e.category,
      unidades: e.units,
    });
  }

  /** Lo que queda retenido, que no se cobra. */
  garantiaRetenida(valor: number, moneda: string): string {
    return t('Alquiler.Catalog.DepositHeld', 'Garantía retenida: {monto}', { monto: this.plata(valor, moneda) });
  }

  /** «desde 7 día(s)», en la tabla de tramos. */
  tramoDesde(dias: number): string {
    return t('Alquiler.Detail.RateFrom', 'desde {dias} día(s)', { dias });
  }

  /** «$ 38.000 / día», en la tabla de tramos. */
  tramoPorDia(valor: number, moneda: string): string {
    return t('Alquiler.Detail.RatePerDay', '{monto} / día', { monto: this.plata(valor, moneda) });
  }

  /** Lo que trae el equipo. */
  incluye(lista: readonly string[]): string {
    return t('Alquiler.Detail.Includes', 'Incluye: {lista}', { lista: lista.join(' · ') });
  }

  /** Lo que hace falta para alquilarlo. */
  requiere(lista: readonly string[]): string {
    return t('Alquiler.Detail.Requires', 'Hace falta: {lista}', { lista: lista.join(' · ') });
  }

  /** La ventana que el equipo admite. */
  limites(eq: EquipmentDetail): string {
    return t('Alquiler.Form.Bounds', 'Entre {min} y {max} día(s).', { min: eq.minDays, max: eq.maxDays });
  }

  /** Cuántos días pide la ventana elegida. */
  pedidos(dias: number): string {
    return t('Alquiler.Form.Asked', 'Pediste {dias}.', { dias });
  }

  /** «7 día(s) × 2 unidad(es) a $ 38.000». */
  lineaDeCotizacion(q: RentalQuote): string {
    return t('Alquiler.Quote.Line', '{dias} día(s) × {unidades} unidad(es) a {monto}', {
      dias: q.days,
      unidades: q.quantity,
      monto: this.plata(q.perDay, q.currency),
    });
  }

  /** La garantía de la cotización, dicha como lo que es: una retención. */
  garantiaDeCotizacion(q: RentalQuote): string {
    return t(
      'Alquiler.Quote.Deposit',
      'Además se RETIENEN {monto} de garantía. No es un cobro: se libera al devolver el equipo.',
      { monto: this.plata(q.deposit, q.currency) },
    );
  }

  /** «2 unidad(es), del 2026-11-05 al 2026-11-08.», de lo que se está pidiendo por la puerta. */
  lineaDeLaPuerta(): string {
    return t('Alquiler.Done.Line', '{unidades} unidad(es), del {desde} al {hasta}.', {
      unidades: this.unidades(),
      desde: this.desde(),
      hasta: this.hasta(),
    });
  }

  /** La garantía que cotizó el servidor por la puerta, dicha como lo que es: una retención. */
  garantiaDeLaPuerta(q: CotizacionDeLaPuerta): string {
    const g = q.garantia ?? { amount: 0, currency: q.total?.currency ?? '' };
    return t(
      'Alquiler.Quote.Deposit',
      'Además se RETIENEN {monto} de garantía. No es un cobro: se libera al devolver el equipo.',
      { monto: this.plata(g.amount, g.currency) },
    );
  }

  /** «Alquiler BB1A3E18»: el número que da el servidor a la renta de la puerta. */
  tituloDeRenta(r: RentaLeida): string {
    return t('Alquiler.Done.Title', 'Alquiler {id}', { id: r.numero || r.id });
  }

  /** «Alquiler alq-1». */
  tituloDeReserva(r: Rental): string {
    return t('Alquiler.Done.Title', 'Alquiler {id}', { id: r.rentalId });
  }

  /** «2 unidad(es), del 2026-10-05 al 2026-10-12.» */
  lineaDeReserva(r: Rental): string {
    return t('Alquiler.Done.Line', '{unidades} unidad(es), del {desde} al {hasta}.', {
      unidades: r.quantity,
      desde: r.start,
      hasta: r.end,
    });
  }

  /** «2 unidad(es) · del 2026-10-05 al 2026-10-12», en la bandeja. */
  lineaDeContrato(a: RentalAgreement): string {
    return t('Alquiler.Mine.Line', '{unidades} unidad(es) · del {desde} al {hasta}', {
      unidades: a.quantity,
      desde: a.start,
      hasta: a.end,
    });
  }

  /** El sello comprobado, con el sello a la vista. */
  contratoComprobado(a: RentalAgreement): string {
    return t('Alquiler.Mine.SealVerified', 'Sello comprobado · {sello}', { sello: a.seal });
  }

  /** El identificador estable de una tarjeta, para `@for`. */
  porId(_: number, item: { readonly equipmentId: string }): string {
    return item.equipmentId;
  }

  /** El identificador estable de un contrato, para `@for`. */
  porContrato(_: number, item: RentalAgreement): string {
    return item.rentalId;
  }
}
