import {
  type OnInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  AuthoringWizardComponent,
  ConsoleShellComponent,
  MessageCenterComponent,
  type AuthoringDraft,
  type AuthoringWizardConfig,
  type ConsoleColumn,
  type ConsoleFilter,
  type ConsoleKpi,
  type ConsoleRowAction,
  type ConsoleRowActionEvent,
  type ConsoleShellConfig,
  type MessageCenterConfig,
  type MessageSendEvent,
} from '@synergos/shells';
import {
  LiveRegionComponent,
  SynEmptyStateComponent,
  SynErrorStateComponent,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import type { SellerProps } from '@synergos/contracts';
import { HostIdentityService } from '@synergos/core';
import { SellerApiClient, type LecturaDeLaConsola } from './seller-api.client';
import { momentoDeLaConsola } from './fechas-de-la-consola';
import {
  ACTOS_DEL_DESPACHO,
  ETAPAS_DEL_DESPACHO,
  GUIA_MAXIMA,
  type ActoDelDespacho,
  type BandejaDeLaTienda,
  type DestinoDelEnvio,
  type DetalleDelPedido,
  type DevolucionDeLaTienda,
  type EstadoDeLaDevolucion,
  type EtapaDelDespacho,
  type MovimientoDeLaDevolucion,
  type PedidoDeLaTienda,
  type ResultadoDelActo,
  type ResultadoDelMovimiento,
  type SellerKpiMetric,
  type SellerListing,
  type SellerMessage,
  type SellerPublishRequest,
  type SellerPublishReceipt,
  type SellerReputation,
  type SellerReturn,
  type SellerSectionId,
  type SellerThread,
  type SellerView,
} from './seller.model';
import { formatearImporte, t } from '@synergos/vitals-core';

/**
 * Runtime config for the CMS element <c>elementSynSeller</c>.
 *
 * Seller console — the Tienda **cara B** (Ola 1 doc 21, entrega B) built as the
 * first consumer of the back-office rungs of `@synergos/shells`: SH-5
 * `syn-console-shell` (KPIs + colas Ventas/Publicaciones/Devoluciones +
 * Reputación), SH-6 `syn-authoring-wizard` (publicar producto con borrador
 * persistente) and SH-7 `syn-message-center` (preguntas/mensajes de
 * compradores). The component only contributes domain data, templates and API
 * wiring — the shells stay domain-free (contrato D3).
 *
 * El `config` que manda el CMS tiene la forma de `SellerProps`, GENERADO del record C# (ADR 0135):
 * lo del editor y dónde vive la API para el sitio, que sale de `Synergos:Features:Seller` y el
 * editor no ve (ADR 0137, CMS#196). La moneda no es configuración: llega con cada precio. Lo que
 * sólo entraba por el JSON libre queda como atributo del tag crudo con su valor del componente.
 */
export type SellerConfig = Partial<SellerProps>;

/**
 * One pre-rendered row for the SH-5 table: the shell treats rows as opaque, so
 * the component projects each domain record into formatted `cells` keyed by
 * column and keeps the raw record for actions.
 */
interface SellerRowVm {
  readonly id: string;
  readonly kind: 'order' | 'listing' | 'return';
  readonly cells: Readonly<Record<string, string>>;
  /** Visual tone of the `estado` chip. */
  readonly tone: 'ok' | 'warn' | 'info' | 'muted';
  readonly pedido?: PedidoDeLaTienda;
  readonly listing?: SellerListing;
  readonly devolucion?: DevolucionDeLaTienda;
}

/** El detalle abierto: el pedido de la fila, cómo va su lectura y lo que trajo. */
interface DetalleAbierto {
  readonly pedido: PedidoDeLaTienda;
  readonly estado: EstadoDeLectura;
  readonly datos: DetalleDelPedido | null;
}

/** Las lecturas de la consola, cada una con su estado (013-seller-operaciones, T006). */
type Lectura = 'resumen' | 'ventas' | 'publicaciones' | 'devoluciones' | 'mensajes';

/** Dónde está una lectura: sin pedir, en vuelo, leída, vacía, de ejemplo (sólo con la marca) o por qué no. */
type EstadoDeLectura = 'sin-cargar' | 'cargando' | LecturaDeLaConsola<unknown>['tipo'];

/** Qué lectura llena cada sección del panel: Reputación sale del resumen, como los indicadores. */
const LECTURA_DE_LA_SECCION: Readonly<Record<SellerSectionId, Lectura>> = {
  ventas: 'ventas',
  publicaciones: 'publicaciones',
  devoluciones: 'devoluciones',
  reputacion: 'resumen',
};

const DEFAULT_HEADING = 'Centro de vendedores';

const SECTION_IDS: readonly SellerSectionId[] = [
  'ventas',
  'publicaciones',
  'devoluciones',
  'reputacion',
];

const ORDER_COLUMNS: readonly ConsoleColumn[] = [
  { key: 'orden', label: 'Orden' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'comprador', label: 'Comprador' },
  { key: 'productos', label: 'Productos' },
  { key: 'total', label: 'Total', align: 'end' },
  { key: 'estado', label: 'Estado' },
];

const LISTING_COLUMNS: readonly ConsoleColumn[] = [
  { key: 'titulo', label: 'Publicación' },
  { key: 'sku', label: 'SKU' },
  { key: 'precio', label: 'Precio', align: 'end' },
  { key: 'stock', label: 'Stock', align: 'end' },
  { key: 'preguntas', label: 'Preguntas', align: 'end' },
  { key: 'estado', label: 'Estado' },
];

const RETURN_COLUMNS: readonly ConsoleColumn[] = [
  { key: 'rma', label: 'RMA' },
  { key: 'orden', label: 'Orden' },
  { key: 'producto', label: 'Producto' },
  { key: 'motivo', label: 'Motivo' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'estado', label: 'Estado' },
];

const LISTING_FILTERS: readonly ConsoleFilter[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'activas', label: 'Activas' },
  { key: 'pausadas', label: 'Pausadas' },
  { key: 'agotadas', label: 'Agotadas' },
];

/** El prefijo del id de la acción de fila de un acto del despacho: `acto:preparar`, `acto:enviar`, `acto:entregar`. */
const PREFIJO_DEL_ACTO = 'acto:';
/** Lo que dice una celda sin dato: una raya, y no un texto que lo invente. */
const SIN_DATO = '—';

/** El prefijo del id de la acción de fila que mueve una devolución: `devolucion:approved`, `devolucion:refunded`… */
const PREFIJO_DE_LA_DEVOLUCION = 'devolucion:';

/** Si una devolución pide algo al personal: las de «Abiertas», y las que cuenta su insignia. */
const estaAbierta = (estado: EstadoDeLaDevolucion): boolean =>
  estado === 'Requested' || estado === 'Received' || estado === 'Approved';

/** Lo que puede pasarle a una devolución desde cada estado (la máquina del CMS: `StubReturnService`). */
const MOVIMIENTOS_DESDE: Readonly<Record<EstadoDeLaDevolucion, readonly MovimientoDeLaDevolucion[]>> = {
  Requested: ['approved', 'rejected'],
  Approved: ['received'],
  Received: ['refunded'],
  Refunded: [],
  Rejected: [],
};

/** Wizard steps: datos → media (URLs) → precio/stock → preview → publicar. */
const PUBLISH_STEPS = [
  { id: 'datos', label: 'Datos' },
  { id: 'media', label: 'Fotos' },
  { id: 'precio', label: 'Precio y stock' },
  { id: 'preview', label: 'Revisar' },
] as const;

/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeSellerConfig(value: SellerConfig): SellerConfig {
  return omitUndefinedProperties<SellerProps>({
    heading: coerceTrimmedStringInput(value.heading),
    subheading: coerceTrimmedStringInput(value.subheading),
    apiBase: coerceTrimmedStringInput(value.apiBase),
    zonaHoraria: coerceTrimmedStringInput(value.zonaHoraria),
  });
}

let sellerInstanceId = 0;

@Component({
  selector: 'sg-seller',
  standalone: true,
  imports: [
    ConsoleShellComponent,
    AuthoringWizardComponent,
    MessageCenterComponent,
    LiveRegionComponent,
    SynEmptyStateComponent,
    SynErrorStateComponent,
  ],
  templateUrl: './seller.html',
  styleUrl: './seller.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-seller' },
})
export class SellerElementComponent implements OnInit {
  readonly #api = inject(SellerApiClient);
  readonly #identity = inject(HostIdentityService);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<SellerConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SellerProps>(sanitizeSellerConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });
  readonly subheadingInput = input<string | undefined>(undefined, { alias: 'subheading' });

  /**
   * Dónde vive la API. Sin ella no se llama a nada y cada lectura dice que no se pudo (con la marca
   * de la demo, enseña su muestra y lo dice): no hay una base de respaldo compilada (ADR 0137).
   */
  readonly apiBase = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.apiBaseInput()), this.config()?.apiBase, '').replace(
      /\/+$/,
      '',
    ),
  );
  /**
   * Quién atiende la consola: el miembro de la SESIÓN (CMS#197). Era `sellerName`, que sólo
   * entraba por el JSON libre del editor —un nombre escrito a mano en la página, el mismo para
   * todo vendedor que la abriera—. Sin host o sin sesión, vacío: el chip no se pinta, como
   * hasta ahora sin el atributo.
   */
  readonly sellerName = this.#identity.displayName;
  readonly heading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.headingInput()),
      this.config()?.heading,
      DEFAULT_HEADING,
    ),
  );
  /**
   * El subtítulo que escribe el editor (CMS#196: viajaba y nadie lo pintaba). Sin texto por defecto:
   * si el editor no escribió nada, no se pinta un párrafo vacío.
   */
  readonly subheading = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.subheadingInput()), this.config()?.subheading, ''),
  );
  /**
   * La moneda de lo que se muestra: la que trae cada precio de la API. No es configuración: sería
   * una segunda fuente para un dato del precio. Sin datos todavía, vacía (`formatPrice` pinta el
   * número solo).
   */
  readonly currency = computed(() => this.pedidos()[0]?.moneda || this.listings()[0]?.currency || '');

  /** La zona en que se dicen las fechas: la del sitio (la de los listados), que manda el CMS. */
  readonly zonaHoraria = computed(() => this.config()?.zonaHoraria ?? '');

  readonly instanceId = (sellerInstanceId += 1);
  readonly fieldId = `syn-seller-${this.instanceId}`;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly productpublished = output<SellerPublishReceipt>();

  // ─── Shell references ──────────────────────────────────────────────────────
  readonly wizard = viewChild(AuthoringWizardComponent);

  // ─── Top-level router (3 vistas) ───────────────────────────────────────────
  readonly view = signal<SellerView>('panel');

  // ─── Data (from the API; the samples only behind MUESTRAS_DE_LA_CONSOLA) ───
  readonly kpiMetrics = signal<readonly SellerKpiMetric[]>([]);
  readonly reputation = signal<SellerReputation | null>(null);
  /**
   * Placeholder metric cards for the reputation skeleton. Three, because the
   * real grid is always hero + exactly three metrics (on-time / claims /
   * answered) — the mould is a fixed shape, not a guess.
   */
  readonly repSkeletonCards = [0, 1, 2];

  /**
   * La bandeja del personal (013-seller-operaciones, T012): una página de los pedidos pagados de la tienda entera,
   * filtrada y paginada en el servidor, con las cuentas de la tienda. Antes «Ventas» leía `GET orders`, que es «Mis
   * compras» del comprador: el personal veía sus propias compras como ventas.
   */
  readonly bandeja = signal<BandejaDeLaTienda | null>(null);
  readonly pedidos = computed(() => this.bandeja()?.pedidos ?? []);
  /** Cuántos pedidos hay con el filtro, en todas las páginas; sin bandeja, el shell cuenta sus filas. */
  readonly totalDeLaBandeja = computed(() => this.bandeja()?.total ?? null);
  readonly paginaDeVentas = signal(1);
  /** El pedido cuyo detalle está abierto, y cómo va su lectura. */
  readonly detalle = signal<DetalleAbierto | null>(null);
  /** Cuántas veces se pidió la bandeja: una respuesta que llega tarde (otro filtro u otra página) no se pinta. */
  private bandejaPedida = 0;

  readonly listings = signal<readonly SellerListing[]>([]);
  /** La cola de devoluciones de la tienda entera, en el orden del servidor (013-seller-operaciones, T025). */
  readonly devoluciones = signal<readonly DevolucionDeLaTienda[]>([]);
  readonly threads = signal<readonly SellerThread[]>([]);

  /**
   * Cómo quedó cada lectura (013-seller-operaciones, T006). Reemplaza los `*Loaded`/`*Loading` y el
   * `degraded` del cliente: «cargó o no» no alcanzaba para no mentir. Una lista vacía, una sesión
   * vencida, un miembro que no es del personal y un servidor caído se pintaban igual: con los
   * ejemplos y su cartel.
   */
  readonly lecturas = signal<Readonly<Record<Lectura, EstadoDeLectura>>>({
    resumen: 'sin-cargar',
    ventas: 'sin-cargar',
    publicaciones: 'sin-cargar',
    devoluciones: 'sin-cargar',
    mensajes: 'sin-cargar',
  });

  /** Los textos de la consola, de la sección `Seller.Operaciones` del diccionario (ADR 0136). */
  readonly textoSinSesion = t('Seller.Operaciones.SignIn', 'Inicia sesión para atender la tienda.');
  readonly textoIniciarSesion = t('Seller.Operaciones.SignInAction', 'Iniciar sesión');
  readonly textoSinPermiso = t('Seller.Operaciones.StaffOnly', 'Esta consola es del personal de la tienda.');
  readonly textoCaida = t('Seller.Operaciones.LoadFailed', 'No pudimos cargar esta sección.');
  readonly textoReintentar = t('Seller.Operaciones.Retry', 'Reintentar');
  readonly textoDeMuestras = t('Seller.Operaciones.Samples', 'Estás viendo datos de ejemplo, no los de la tienda.');
  readonly textoBandejaVacia = t('Seller.Operaciones.OrdersEmpty', 'No hay pedidos pagados en esta etapa.');
  readonly textoVerDetalle = t('Seller.Operaciones.ViewDetail', 'Ver detalle');
  readonly textoDestino = t('Seller.Operaciones.Destination', 'Destino');
  readonly textoTransportadora = t('Seller.Operaciones.Carrier', 'Transportadora');
  readonly textoCerrar = t('Seller.Operaciones.Close', 'Cerrar');
  readonly textoCargando = t('Seller.Operaciones.Loading', 'Cargando…');
  readonly textoSinDireccion = t('Seller.Operaciones.NoAddress', 'Este pedido no tiene una dirección registrada.');
  readonly textoSinEnvio = t('Seller.Operaciones.NoShipment', 'Este pedido todavía no tiene envío.');
  readonly textoEnvioNoDisponible = t('Seller.Operaciones.ShipmentUnavailable', 'No pudimos leer el envío ahora.');
  /** Cómo se llama cada etapa del despacho: en la columna, en los filtros y en las cuentas. */
  readonly textoEtapas: Readonly<Record<EtapaDelDespacho, string>> = {
    paid: t('Seller.Operaciones.StagePaid', 'Por preparar'),
    preparing: t('Seller.Operaciones.StagePreparing', 'En preparación'),
    shipped: t('Seller.Operaciones.StageShipped', 'En camino'),
    delivered: t('Seller.Operaciones.StageDelivered', 'Entregado'),
  };

  /**
   * Los filtros de la bandeja: todos, o una etapa. Las etiquetas no llevan las cuentas, y es a propósito: el shell lleva
   * el filtro activo atado a la lista de filtros, y una lista que cambia con cada lectura lo devolvería a «Todos» con
   * la bandeja filtrada. Las cuentas de la tienda van en la banda de indicadores de Ventas.
   */
  readonly filtrosDeVentas: readonly ConsoleFilter[] = [
    { key: 'todas', label: t('Seller.Operaciones.StageAll', 'Todos') },
    ...ETAPAS_DEL_DESPACHO.map((etapa) => ({ key: etapa, label: this.textoEtapas[etapa] })),
  ];

  /** Ver el detalle de un pedido: su envío, a dónde va y con quién. */
  readonly accionDetalle: ConsoleRowAction = { id: 'detalle', label: this.textoVerDetalle };

  // ─── Los actos del despacho (013-seller-operaciones, T021) ─────────────────
  /** El botón de cada acto: sale sólo si el servidor lo pone en `actos`. */
  readonly accionDelActo: Readonly<Record<ActoDelDespacho, ConsoleRowAction>> = {
    preparar: { id: `${PREFIJO_DEL_ACTO}preparar`, label: t('Seller.Operaciones.ActPrepare', 'Preparar'), kind: 'primary' },
    enviar: { id: `${PREFIJO_DEL_ACTO}enviar`, label: t('Seller.Operaciones.ActShip', 'Marcar enviado'), kind: 'primary' },
    entregar: { id: `${PREFIJO_DEL_ACTO}entregar`, label: t('Seller.Operaciones.ActDeliver', 'Marcar entregado'), kind: 'primary' },
  };
  /** Lo que ocupa el lugar del acto mientras vuela: no hace nada, y el acto no se puede pedir dos veces. */
  readonly accionEnVuelo: ConsoleRowAction = { id: 'acto-en-vuelo', label: t('Seller.Operaciones.ActInFlight', 'Guardando…') };
  /** El pedido cuyo acto está en vuelo. */
  readonly actoEnVuelo = signal<string | null>(null);
  /** El pedido que se va a marcar enviado, con su guía a medio escribir. */
  readonly envioAbierto = signal<PedidoDeLaTienda | null>(null);
  readonly guia = signal('');
  readonly guiaMaxima = GUIA_MAXIMA;
  readonly textoGuia = t('Seller.Operaciones.TrackingNumber', 'Guía (opcional)');
  readonly textoAyudaDeLaGuia = t('Seller.Operaciones.TrackingHint', 'Hasta 80 caracteres, en una línea.');
  readonly textoCancelar = t('Seller.Operaciones.Cancel', 'Cancelar');
  readonly textoGuiaInvalida = t('Seller.Operaciones.TrackingInvalid', 'La guía: hasta 80 caracteres, en una línea.');
  readonly textoDespachoNoDisponible = t(
    'Seller.Operaciones.DispatchUnavailable',
    'Los pedidos de la puerta no se despachan desde este sitio.',
  );

  // ─── La cola de devoluciones (013-seller-operaciones, T025) ────────────────
  /** El botón de cada movimiento; salen por el estado EXACTO de la devolución. */
  readonly accionDeLaDevolucion: Readonly<Record<MovimientoDeLaDevolucion, ConsoleRowAction>> = {
    approved: { id: `${PREFIJO_DE_LA_DEVOLUCION}approved`, label: t('Seller.Operaciones.ReturnApprove', 'Aprobar'), kind: 'primary' },
    rejected: { id: `${PREFIJO_DE_LA_DEVOLUCION}rejected`, label: t('Seller.Operaciones.ReturnReject', 'Rechazar'), kind: 'danger' },
    received: { id: `${PREFIJO_DE_LA_DEVOLUCION}received`, label: t('Seller.Operaciones.ReturnReceive', 'Marcar recibida'), kind: 'primary' },
    refunded: { id: `${PREFIJO_DE_LA_DEVOLUCION}refunded`, label: t('Seller.Operaciones.ReturnRefund', 'Reembolsar'), kind: 'primary' },
  };
  /** Cómo se llama cada estado de una devolución: en la columna y en lo que no se movió. */
  readonly textoEstadosDeDevolucion: Readonly<Record<EstadoDeLaDevolucion, string>> = {
    Requested: t('Seller.Operaciones.ReturnRequested', 'Pedida'),
    Approved: t('Seller.Operaciones.ReturnApproved', 'Aprobada'),
    Received: t('Seller.Operaciones.ReturnReceived', 'Recibida'),
    Refunded: t('Seller.Operaciones.ReturnRefunded', 'Reembolsada'),
    Rejected: t('Seller.Operaciones.ReturnRejected', 'Rechazada'),
  };
  /** Los filtros de la cola: todas, las que piden algo y las cerradas. */
  readonly filtrosDeDevoluciones: readonly ConsoleFilter[] = [
    { key: 'todas', label: t('Seller.Operaciones.ReturnsAll', 'Todas') },
    { key: 'abiertas', label: t('Seller.Operaciones.ReturnsOpen', 'Abiertas') },
    { key: 'resueltas', label: t('Seller.Operaciones.ReturnsClosed', 'Resueltas') },
  ];
  /** La devolución que se está moviendo. */
  readonly devolucionEnVuelo = signal<string | null>(null);
  /** La devolución que se va a reembolsar, esperando que se confirme. */
  readonly reembolsoAbierto = signal<DevolucionDeLaTienda | null>(null);
  readonly textoConfirmarReembolso = t('Seller.Operaciones.RefundConfirmAction', 'Sí, reembolsar');

  /** El aviso de las compras que el servidor no alcanzó a confirmar en esta lectura. */
  readonly avisoSinConciliar = computed(() => {
    const n = this.bandeja()?.sinConciliar ?? 0;
    return n > 0
      ? t('Seller.Operaciones.Unreconciled', '{n} compras recientes todavía no se confirman aquí: vuelve a cargar en un momento.', { n })
      : '';
  });

  /**
   * Lo que una ESCRITURA no consiguió, dicho donde el vendedor lo ve (#77).
   *
   * Es distinto del cartel de `muestras()`, y por eso no se reusa: aquél dice «estás viendo
   * datos de ejemplo» sobre LECTURAS, sólo con la marca de la demo; esto dice «lo que acabás de
   * pedir no ocurrió». Meter las dos cosas en el mismo cartel haría que la segunda se leyera
   * como la primera, que es de lo que quien publica un producto no se entera.
   */
  readonly actionError = signal<string | null>(null);

  /** Cuántas respuestas no salieron en esta pestaña: el id local de su burbuja marcada. */
  private unsentReplies = 0;

  /** Alguna lectura enseña ejemplos: sólo pasa con la marca de la demo, y entonces se dice. */
  readonly muestras = computed(() => Object.values(this.lecturas()).includes('muestras'));

  /**
   * Lo que cierra la consola entera. Sin sesión o sin permiso no es de una sección —es de quien
   * la abre—, así que se dice una vez, en lugar de las vistas: con su salida (iniciar sesión), o
   * sin ninguna (no es del personal).
   */
  readonly acceso = computed<'sin-sesion' | 'sin-permiso' | null>(() => {
    const estados = Object.values(this.lecturas());
    if (estados.includes('sin-sesion')) {
      return 'sin-sesion';
    }
    return estados.includes('sin-permiso') ? 'sin-permiso' : null;
  });

  // ─── SH-5 console: sections + KPIs + rows ──────────────────────────────────
  readonly activeSection = signal<SellerSectionId>('ventas');
  readonly sectionFilter = signal('todas');
  readonly lecturaActiva = computed(() => LECTURA_DE_LA_SECCION[this.activeSection()]);

  readonly consoleConfig = computed<ConsoleShellConfig>(() => ({
    heading: 'Panel',
    navLabel: 'Secciones del panel de vendedor',
    kpisLabel: 'Indicadores del negocio',
    actionsLabel: 'Acciones',
    emptyMessage: this.activeSection() === 'ventas' ? this.textoBandejaVacia : 'No hay registros en esta cola.',
    loadingMessage: 'Cargando…',
    // La cola que no se pudo leer lo dice, con su «Reintentar» (`retry`): una cola vacía sería
    // otra respuesta, la que el servidor no dio.
    errorMessage: this.lecturas()[this.lecturaActiva()] === 'caida' ? this.textoCaida : undefined,
    sections: [
      { id: 'ventas', label: 'Ventas', badge: this.bandeja()?.cuentas.paid || undefined },
      {
        id: 'publicaciones',
        label: 'Publicaciones',
        badge: this.listings().length || undefined,
      },
      {
        id: 'devoluciones',
        label: 'Devoluciones',
        badge: this.openReturnsCount() || undefined,
      },
      { id: 'reputacion', label: 'Reputación', kind: 'custom' },
    ],
  }));

  readonly openReturnsCount = computed(
    () =>
      this.devoluciones().filter((d) => estaAbierta(d.estado)).length,
  );

  /**
   * En Ventas, las cuentas de la bandeja: cuántos pedidos hay en cada etapa en la tienda ENTERA, que no dependen del
   * filtro ni de la página. En las demás secciones, los indicadores del resumen.
   */
  readonly consoleKpis = computed<readonly ConsoleKpi[]>(() => {
    const cuentas = this.bandeja()?.cuentas;
    if (this.activeSection() === 'ventas' && cuentas) {
      return ETAPAS_DEL_DESPACHO.map((etapa) => ({
        id: etapa,
        label: this.textoEtapas[etapa],
        value: this.formatNumber(cuentas[etapa]),
        trend: 'flat' as const,
      }));
    }
    return this.indicadoresDelResumen();
  });

  private readonly indicadoresDelResumen = computed<readonly ConsoleKpi[]>(() =>
    this.kpiMetrics().map((metric) => ({
      id: metric.id,
      label: metric.label,
      value: this.formatKpiValue(metric),
      delta:
        metric.delta === undefined || metric.delta === 0
          ? undefined
          : `${metric.delta > 0 ? '+' : ''}${this.formatNumber(metric.delta)} %`,
      trend: metric.delta === undefined || metric.delta === 0 ? 'flat' : metric.delta > 0 ? 'up' : 'down',
      hint: metric.hint,
    })),
  );

  readonly consoleColumns = computed<readonly ConsoleColumn[]>(() => {
    switch (this.activeSection()) {
      case 'publicaciones':
        return LISTING_COLUMNS;
      case 'devoluciones':
        return RETURN_COLUMNS;
      default:
        return ORDER_COLUMNS;
    }
  });

  readonly consoleFilters = computed<readonly ConsoleFilter[]>(() => {
    switch (this.activeSection()) {
      case 'publicaciones':
        return LISTING_FILTERS;
      case 'devoluciones':
        return this.filtrosDeDevoluciones;
      case 'reputacion':
        return [];
      default:
        return this.filtrosDeVentas;
    }
  });

  /** Reputación pinta su propio esqueleto; las colas, el del shell. */
  readonly sectionLoading = computed(
    () => this.activeSection() !== 'reputacion' && this.enVuelo(this.lecturaActiva()),
  );

  readonly consoleRows = computed<readonly SellerRowVm[]>(() => {
    switch (this.activeSection()) {
      case 'publicaciones':
        return this.filteredListings().map((listing) => this.listingRow(listing));
      case 'devoluciones':
        return this.filteredReturns().map((rma) => this.returnRow(rma));
      case 'reputacion':
        return [];
      default:
        // La bandeja viene filtrada y paginada del servidor: se pinta tal cual.
        return this.pedidos().map((pedido) => this.pedidoRow(pedido));
    }
  });

  /**
   * Per-row actions: only status-appropriate verbs surface. Un pedido ofrece los actos que el servidor pone en `actos`, y
   * ninguno más (T021); mientras uno vuela, en su lugar dice que se está guardando. Su detalle se ve siempre.
   */
  readonly rowActionsFor = (row: SellerRowVm): readonly ConsoleRowAction[] => {
    if (row.kind === 'order' && row.pedido) {
      if (this.actoEnVuelo() === row.pedido.orderRef) {
        return [this.accionEnVuelo, this.accionDetalle];
      }
      const actos = row.pedido.actos.filter((a): a is ActoDelDespacho => ACTOS_DEL_DESPACHO.includes(a as ActoDelDespacho));
      return [...actos.map((acto) => this.accionDelActo[acto]), this.accionDetalle];
    }
    if (row.kind === 'return' && row.devolucion) {
      if (this.devolucionEnVuelo() === row.devolucion.rmaId) {
        return [this.accionEnVuelo];
      }
      return MOVIMIENTOS_DESDE[row.devolucion.estado].map((movimiento) => this.accionDeLaDevolucion[movimiento]);
    }
    return [];
  };

  // ─── SH-6 wizard: publicar producto ────────────────────────────────────────
  readonly wizardConfig: AuthoringWizardConfig = {
    heading: 'Publicar producto',
    steps: [...PUBLISH_STEPS],
    stepsLabel: 'Pasos para publicar',
    backLabel: 'Atrás',
    nextLabel: 'Continuar',
    publishLabel: 'Publicar',
    publishingLabel: 'Publicando…',
    draftScope: 'seller-publish',
  };

  /** Mirror of the wizard's persisted draft, for validity + preview. */
  readonly draft = signal<AuthoringDraft>({});
  readonly publishing = signal(false);
  readonly publishReceipt = signal<SellerPublishReceipt | null>(null);

  readonly wizardValidity = computed<Readonly<Record<string, boolean>>>(() => {
    const draft = this.draft();
    return {
      datos: this.draftString(draft, 'title').trim().length >= 3,
      media: true,
      precio: this.draftNumber(draft, 'amount') > 0 && this.draftNumber(draft, 'stock') >= 0,
      preview: true,
    };
  });

  // ─── SH-7 mensajes ─────────────────────────────────────────────────────────
  readonly activeThread = signal<SellerThread | null>(null);
  readonly sending = signal(false);

  readonly unreadCount = computed(() => this.threads().filter((thread) => thread.unread).length);

  readonly messagesConfig: MessageCenterConfig = {
    heading: 'Mensajes y preguntas',
    listLabel: 'Conversaciones con compradores',
    emptyMessage: 'No tienes mensajes de compradores.',
    loadingMessage: 'Cargando conversaciones…',
    detailPlaceholder: 'Selecciona una conversación para ver el hilo y responder.',
    composerLabel: 'Responder al comprador',
    composerPlaceholder: 'Escribe tu respuesta…',
    sendLabel: 'Responder',
    sendingLabel: 'Enviando…',
  };

  /**
   * Abre en el panel (KPIs y cola de ventas) contra la API del sitio.
   *
   * No va en el constructor: en un custom element los inputs —el `config` del CMS— se aplican
   * DESPUÉS de crear el componente y ANTES del primer ciclo, así que el constructor los ve vacíos
   * (el defecto que el piloto de la ADR 0137 encontró en `eventos`, CMS#194).
   */
  ngOnInit(): void {
    void this.loadSummary();
    void this.loadOrders();
  }

  // ─── Top-level navigation ──────────────────────────────────────────────────
  goTo(view: SellerView): void {
    this.view.set(view);
    if (view === 'mensajes') {
      void this.loadThreads();
    }
  }

  // ─── SH-5 wiring ───────────────────────────────────────────────────────────
  onSectionChange(sectionId: string): void {
    const section = (SECTION_IDS as readonly string[]).includes(sectionId)
      ? (sectionId as SellerSectionId)
      : 'ventas';
    this.activeSection.set(section);
    this.sectionFilter.set('todas');
    if (section === 'ventas') {
      // El shell vuelve a «Todos» al cambiar de sección: la bandeja se vuelve a pedir así, para no pintar la del filtro
      // de antes bajo el chip de «Todos».
      this.paginaDeVentas.set(1);
      void this.loadOrders();
    } else if (section === 'publicaciones') {
      void this.loadListings();
    } else if (section === 'devoluciones') {
      void this.loadReturns();
    }
  }

  onFilterChange(filterKey: string): void {
    this.sectionFilter.set(filterKey);
    if (this.activeSection() === 'ventas') {
      this.paginaDeVentas.set(1);
      void this.loadOrders();
    }
  }

  /** La bandeja pagina en el servidor: otra página es otra lectura. */
  onPageChange(pagina: number): void {
    this.paginaDeVentas.set(pagina);
    void this.loadOrders();
  }

  /** «Reintentar»: vuelve a pedir una lectura que no se pudo leer. */
  recargar(lectura: Lectura): void {
    switch (lectura) {
      case 'resumen':
        void this.loadSummary();
        return;
      case 'ventas':
        void this.loadOrders();
        return;
      case 'publicaciones':
        void this.loadListings();
        return;
      case 'devoluciones':
        void this.loadReturns();
        return;
      case 'mensajes':
        void this.loadThreads();
        return;
    }
  }

  /** La lectura todavía no contestó (o no se pidió): la superficie pinta su esqueleto. */
  enVuelo(lectura: Lectura): boolean {
    const estado = this.lecturas()[lectura];
    return estado === 'sin-cargar' || estado === 'cargando';
  }

  /**
   * Login del CMS de vuelta a ESTA página (la forma de la tienda y de reserva). Método y no
   * `computed`: la URL cambia con la navegación.
   */
  loginUrl(): string {
    if (typeof window === 'undefined') {
      return '/account/login';
    }
    const aqui = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return `/account/login?returnUrl=${encodeURIComponent(aqui)}`;
  }

  onRowAction(event: ConsoleRowActionEvent<SellerRowVm>): void {
    const row = event.row;
    if (event.actionId.startsWith(PREFIJO_DEL_ACTO) && row.pedido) {
      const acto = event.actionId.slice(PREFIJO_DEL_ACTO.length) as ActoDelDespacho;
      if (acto === 'enviar') {
        this.abrirEnvio(row.pedido);
      } else {
        void this.actuar(row.pedido, acto);
      }
      return;
    }
    if (event.actionId === 'detalle' && row.pedido) {
      void this.abrirDetalle(row.pedido);
      return;
    }
    if (event.actionId.startsWith(PREFIJO_DE_LA_DEVOLUCION) && row.devolucion) {
      const movimiento = event.actionId.slice(PREFIJO_DE_LA_DEVOLUCION.length) as MovimientoDeLaDevolucion;
      if (movimiento === 'refunded') {
        this.abrirReembolso(row.devolucion);
      } else {
        void this.moverDevolucion(row.devolucion, movimiento);
      }
    }
  }

  /** Marcar enviado pide antes la guía, que es opcional: abre su formulario. */
  abrirEnvio(pedido: PedidoDeLaTienda): void {
    this.guia.set('');
    this.envioAbierto.set(pedido);
  }

  cerrarEnvio(): void {
    this.envioAbierto.set(null);
    this.guia.set('');
  }

  escribirGuia(evento: Event): void {
    this.guia.set((evento.target as HTMLInputElement).value);
  }

  textoDelEnvio(numero: string): string {
    return t('Seller.Operaciones.ShipOrder', 'Enviar el pedido {numero}', { numero });
  }

  /**
   * Da un acto sobre un pedido (T021). Uno a la vez: mientras vuela, el acto de esa fila no se puede pedir otra vez, y un
   * segundo clic no sale. La fila se mueve sólo con la respuesta del servidor; si no se hizo (#77), sigue donde estaba y
   * el aviso dice por qué y en qué etapa sigue.
   */
  async actuar(pedido: PedidoDeLaTienda, acto: ActoDelDespacho, guia?: string): Promise<void> {
    if (this.actoEnVuelo() !== null) {
      return;
    }
    const escrita = guia?.trim() ?? '';
    if (escrita.length > GUIA_MAXIMA || /[\r\n]/.test(escrita)) {
      this.actionError.set(this.textoGuiaInvalida);
      return;
    }
    this.actoEnVuelo.set(pedido.orderRef);
    this.actionError.set(null);
    try {
      const resultado = await this.#api.avanzar(this.apiBase(), pedido.orderRef, acto, escrita || undefined);
      if (!resultado.hecho) {
        if (resultado.por === 'sin-sesion' || resultado.por === 'sin-permiso') {
          this.marcar('ventas', resultado.por);
          return;
        }
        this.actionError.set(this.textoDelActoQueNoSalio(pedido, resultado));
        return;
      }
      this.cerrarEnvio();
      // La fila se mueve con lo que diga el servidor: se vuelve a leer la bandeja, con su etapa y sus actos nuevos.
      await this.loadOrders();
    } finally {
      this.actoEnVuelo.set(null);
    }
  }

  /** Por qué un acto no salió, con la etapa en que sigue el pedido. */
  private textoDelActoQueNoSalio(
    pedido: PedidoDeLaTienda,
    resultado: Extract<ResultadoDelActo, { readonly hecho: false }>,
  ): string {
    const sigueEn = t('Seller.Operaciones.StillIn', 'El pedido sigue en «{etapa}».', {
      etapa: this.textoEtapas[resultado.etapa ?? pedido.etapa],
    });
    return `${this.motivoDelActo(pedido, resultado)} ${sigueEn}`;
  }

  /** El motivo, por el código del servidor (los de `contracts/puerta-vendedor.md` de 013). */
  private motivoDelActo(pedido: PedidoDeLaTienda, resultado: Extract<ResultadoDelActo, { readonly hecho: false }>): string {
    if (resultado.por === 'caida') {
      return t('Seller.Operaciones.TryAgain', 'No pudimos hacerlo ahora y nada cambió: vuelve a intentarlo.');
    }
    switch (resultado.codigo) {
      case 'flow.original_no_encontrada':
      case 'flow.original_no_completada':
      case 'flow.original_sin_dato':
      case 'fulfillment.shipment_not_found':
        return t('Seller.Operaciones.CantDispatch', 'Este pedido no se puede despachar desde la consola.');
      case 'fulfillment.transition_not_allowed':
        return t('Seller.Operaciones.ShipFirst', 'Primero márcalo enviado.');
      case 'fulfillment.shipment_closed':
        return t('Seller.Operaciones.ShipmentClosed', 'El envío ya terminó.');
      case 'tienda.despacho_no_disponible':
        return this.textoDespachoNoDisponible;
      case 'tienda.acto_fuera_de_orden':
        return t('Seller.Operaciones.OutOfOrder', 'Ese paso ya no le toca a este pedido.');
      case 'tienda.guia_invalida':
        return this.textoGuiaInvalida;
      default:
        return t('Seller.Operaciones.ActFailed', 'No pudimos mover el pedido {numero}.', { numero: pedido.orderNumber });
    }
  }

  /** Por qué un pedido no tiene actos, dicho para quien despacha; vacío si no hay motivo que decir. */
  textoSinActosDe(motivo: string | null): string {
    switch (motivo) {
      case 'entregado':
        return t('Seller.Operaciones.Delivered', 'Este pedido ya se entregó.');
      case 'despacho_no_disponible':
        return this.textoDespachoNoDisponible;
      default:
        return '';
    }
  }

  // ─── El detalle de un pedido (013-seller-operaciones, T012) ────────────────
  /** Abre el detalle de un pedido: su envío, a dónde va y con quién. Reabrirlo es «Reintentar». */
  async abrirDetalle(pedido: PedidoDeLaTienda): Promise<void> {
    this.detalle.set({ pedido, estado: 'cargando', datos: null });
    let resultado: LecturaDeLaConsola<DetalleDelPedido>;
    try {
      resultado = await this.#api.pedido(this.apiBase(), pedido.orderRef);
    } catch {
      resultado = { tipo: 'caida' };
    }
    if (this.detalle()?.pedido.orderRef !== pedido.orderRef) {
      return; // mientras volaba se abrió otro, o se cerró
    }
    if (resultado.tipo === 'sin-sesion' || resultado.tipo === 'sin-permiso') {
      this.marcar('ventas', resultado.tipo);
    }
    this.detalle.set({
      pedido,
      estado: resultado.tipo,
      datos: resultado.tipo === 'leidas' || resultado.tipo === 'vacia' || resultado.tipo === 'muestras' ? resultado.datos : null,
    });
  }

  cerrarDetalle(): void {
    this.detalle.set(null);
  }

  textoDelDetalle(numero: string): string {
    return t('Seller.Operaciones.OrderDetail', 'Pedido {numero}', { numero });
  }

  /** El instante en es-CO y en la hora del sitio. */
  momento(instante: string): string {
    return momentoDeLaConsola(instante, this.zonaHoraria());
  }

  /** La fecha, el comprador y el total del pedido, en una línea. */
  resumenDelPedido(pedido: PedidoDeLaTienda): string {
    return [this.momento(pedido.fecha), pedido.comprador, pedido.totalFormatted].filter(Boolean).join(' · ');
  }

  /** A dónde va, en una línea; con su contacto entre paréntesis. */
  destinoEnUnaLinea(destino: DestinoDelEnvio): string {
    const lugar = [destino.line1, destino.line2, destino.city, destino.region, destino.country].filter(Boolean).join(', ');
    return destino.contact ? `${lugar} (${destino.contact})` : lugar;
  }

  /** Por qué el pedido no trae su envío entero, dicho para quien despacha. */
  textoSinEnvioDe(motivo: DetalleDelPedido['motivoSinEnvio']): string {
    switch (motivo) {
      case 'sin_direccion':
        return this.textoSinDireccion;
      case 'sin_envio':
        return this.textoSinEnvio;
      case 'envio_no_disponible':
        return this.textoEnvioNoDisponible;
      default:
        return '';
    }
  }

  /**
   * Mueve una devolución (T025). Una a la vez: mientras vuela, su fila no ofrece otra acción y un segundo clic no sale.
   * La cola se vuelve a leer sólo con la respuesta del servidor; si no se movió (#77) —un reembolso que no salió, por
   * ejemplo—, sigue donde estaba y el aviso dice el motivo del servidor y en qué estado sigue.
   */
  async moverDevolucion(devolucion: DevolucionDeLaTienda, movimiento: MovimientoDeLaDevolucion): Promise<void> {
    if (this.devolucionEnVuelo() !== null) {
      return;
    }
    this.devolucionEnVuelo.set(devolucion.rmaId);
    this.actionError.set(null);
    try {
      const resultado = await this.#api.moverDevolucion(this.apiBase(), devolucion.rmaId, movimiento);
      if (!resultado.hecho) {
        if (resultado.por === 'sin-sesion' || resultado.por === 'sin-permiso') {
          this.marcar('devoluciones', resultado.por);
          return;
        }
        this.actionError.set(this.textoDeLaDevolucionQueNoSeMovio(devolucion, resultado));
        return;
      }
      this.reembolsoAbierto.set(null);
      this.marcar('devoluciones', 'sin-cargar');
      await this.loadReturns();
    } finally {
      this.devolucionEnVuelo.set(null);
    }
  }

  /** Por qué una devolución no se movió, con el estado en que sigue. */
  private textoDeLaDevolucionQueNoSeMovio(
    devolucion: DevolucionDeLaTienda,
    resultado: Extract<ResultadoDelMovimiento, { readonly hecho: false }>,
  ): string {
    const motivo =
      resultado.por === 'caida'
        ? t('Seller.Operaciones.TryAgain', 'No pudimos hacerlo ahora y nada cambió: vuelve a intentarlo.')
        : (resultado.motivo ?? t('Seller.Operaciones.ReturnFailed', 'No pudimos mover la devolución {rma}.', { rma: devolucion.rmaId }));
    const sigueEn = t('Seller.Operaciones.ReturnStillIn', 'La devolución sigue en «{estado}».', {
      estado: this.textoEstadosDeDevolucion[devolucion.estado],
    });
    return `${motivo} ${sigueEn}`;
  }

  /** Reembolsar mueve plata: pide confirmarlo antes. */
  abrirReembolso(devolucion: DevolucionDeLaTienda): void {
    this.reembolsoAbierto.set(devolucion);
  }

  cerrarReembolso(): void {
    this.reembolsoAbierto.set(null);
  }

  textoDelReembolso(devolucion: DevolucionDeLaTienda): string {
    return t('Seller.Operaciones.RefundConfirm', 'Reembolsar {monto} de la devolución {rma}: la plata vuelve a quien compró.', {
      monto: devolucion.montoFormatted || this.formatPrice(devolucion.monto, devolucion.moneda),
      rma: devolucion.rmaId,
    });
  }

  // ─── Filters (client-side over the API data; la bandeja filtra en el servidor) ─
  private filteredListings(): readonly SellerListing[] {
    const filter = this.sectionFilter();
    const listings = this.listings();
    switch (filter) {
      case 'activas':
        return listings.filter((listing) => listing.status === 'activa');
      case 'pausadas':
        return listings.filter((listing) => listing.status === 'pausada');
      case 'agotadas':
        return listings.filter((listing) => listing.status === 'agotada');
      default:
        return listings;
    }
  }

  private filteredReturns(): readonly DevolucionDeLaTienda[] {
    const devoluciones = this.devoluciones();
    switch (this.sectionFilter()) {
      case 'abiertas':
        return devoluciones.filter((d) => estaAbierta(d.estado));
      case 'resueltas':
        return devoluciones.filter((d) => !estaAbierta(d.estado));
      default:
        return devoluciones;
    }
  }

  // ─── Row projections (domain → opaque cells for the shell) ─────────────────
  /** Un pedido de la bandeja: la fecha en la hora del sitio, el total que formateó el servidor y la etapa con su nombre. */
  private pedidoRow(pedido: PedidoDeLaTienda): SellerRowVm {
    return {
      id: pedido.orderRef,
      kind: 'order',
      pedido,
      tone: pedido.etapa === 'delivered' ? 'ok' : pedido.etapa === 'shipped' ? 'info' : 'warn',
      cells: {
        orden: pedido.orderNumber,
        fecha: this.momento(pedido.fecha),
        comprador: pedido.comprador || SIN_DATO,
        productos: pedido.lineas
          .map((line) => (line.qty > 1 ? `${line.title} ×${line.qty}` : line.title))
          .join(' · '),
        total: pedido.totalFormatted || this.formatPrice(pedido.total, pedido.moneda),
        estado: this.textoEtapas[pedido.etapa],
      },
    };
  }

  private listingRow(listing: SellerListing): SellerRowVm {
    return {
      id: listing.id,
      kind: 'listing',
      listing,
      tone:
        listing.status === 'activa' ? 'ok' : listing.status === 'pausada' ? 'muted' : 'warn',
      cells: {
        titulo: listing.title,
        sku: listing.sku,
        precio: this.formatPrice(listing.amount, listing.currency || this.currency()),
        stock: this.formatNumber(listing.stock),
        preguntas: this.formatNumber(listing.questionsOpen),
        estado: this.listingStatusLabel(listing.status),
      },
    };
  }

  private returnRow(devolucion: DevolucionDeLaTienda): SellerRowVm {
    return {
      id: devolucion.rmaId,
      kind: 'return',
      devolucion,
      tone:
        devolucion.estado === 'Refunded'
          ? 'ok'
          : devolucion.estado === 'Rejected'
            ? 'muted'
            : devolucion.estado === 'Requested'
              ? 'warn'
              : 'info',
      cells: {
        rma: devolucion.rmaId,
        orden: devolucion.orderNumber ?? SIN_DATO,
        producto: devolucion.cantidad > 1 ? `${devolucion.producto} ×${devolucion.cantidad}` : devolucion.producto,
        motivo: devolucion.motivo,
        fecha: devolucion.solicitada ? this.momento(devolucion.solicitada) : SIN_DATO,
        estado: this.textoEstadosDeDevolucion[devolucion.estado],
      },
    };
  }

  // ─── SH-6 wiring (publicar producto) ───────────────────────────────────────
  onDraftChange(draft: AuthoringDraft): void {
    this.draft.set(draft);
  }

  async onPublish(draft: AuthoringDraft): Promise<void> {
    if (this.publishing()) {
      return;
    }
    this.publishing.set(true);
    try {
      const request: SellerPublishRequest = {
        title: this.draftString(draft, 'title').trim(),
        brand: this.draftString(draft, 'brand').trim(),
        category: this.draftString(draft, 'category').trim(),
        description: this.draftString(draft, 'description').trim(),
        condition: this.draftCondition(draft),
        images: this.draftImages(draft),
        amount: this.draftNumber(draft, 'amount'),
        currency: this.currency(),
        stock: Math.max(0, Math.trunc(this.draftNumber(draft, 'stock'))),
      };
      const receipt = await this.#api.publishProduct(this.apiBase(), request);
      if (!receipt) {
        // No quedó publicado (#77). Las CUATRO cosas de abajo se saltan, y cada una era
        // daño por su cuenta: la pantalla de «Publicación creada» con una referencia
        // inventada, el evento `productpublished` hacia el host con ese id fantasma, la
        // publicación fantasma en la lista del propio vendedor —que desaparece al
        // recargar— y, la peor, el borrador BORRADO: lo tecleado no se pierde (regla 18).
        this.actionError.set(
          'No pudimos publicar el producto. Tu borrador sigue acá; volvé a intentarlo.',
        );
        return;
      }
      this.actionError.set(null);
      this.publishReceipt.set(receipt);
      this.productpublished.emit(receipt);
      // Surface the new listing in Publicaciones without waiting for the API.
      if (this.cargada('publicaciones')) {
        this.listings.update((list) => [
          {
            id: receipt.productId,
            title: request.title,
            sku: receipt.productId,
            amount: request.amount,
            currency: request.currency,
            stock: request.stock,
            status: request.stock > 0 ? 'activa' : 'agotada',
            questionsOpen: 0,
          },
          ...list,
        ]);
      }
      this.wizard()?.resetDraft();
      this.draft.set({});
    } finally {
      this.publishing.set(false);
    }
  }

  /** Post-publish: start a fresh listing draft. */
  publishAnother(): void {
    this.publishReceipt.set(null);
  }

  onWizardExit(): void {
    this.goTo('panel');
  }

  /** Merge one field into the wizard draft (used by the step template). */
  patchField(
    patch: (values: AuthoringDraft) => void,
    key: string,
    event: Event,
  ): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    patch({ [key]: target?.value ?? '' });
  }

  // Media step: URL list handling over the opaque draft.
  readonly mediaUrl = signal('');

  onMediaUrlInput(event: Event): void {
    this.mediaUrl.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  addImage(patch: (values: AuthoringDraft) => void, draft: AuthoringDraft): void {
    const url = this.mediaUrl().trim();
    if (!url) {
      return;
    }
    const images = this.draftImages(draft);
    if (!images.includes(url)) {
      patch({ images: [...images, url] });
    }
    this.mediaUrl.set('');
  }

  removeImage(patch: (values: AuthoringDraft) => void, draft: AuthoringDraft, url: string): void {
    patch({ images: this.draftImages(draft).filter((entry) => entry !== url) });
  }

  draftString(draft: AuthoringDraft, key: string): string {
    const value = draft[key];
    return typeof value === 'string' ? value : '';
  }

  draftNumber(draft: AuthoringDraft, key: string): number {
    const value = draft[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  draftImages(draft: AuthoringDraft): readonly string[] {
    const value = draft['images'];
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  draftCondition(draft: AuthoringDraft): 'new' | 'used' | 'refurbished' {
    const value = this.draftString(draft, 'condition');
    return value === 'used' || value === 'refurbished' ? value : 'new';
  }

  conditionLabel(condition: 'new' | 'used' | 'refurbished'): string {
    return condition === 'used'
      ? 'Usado'
      : condition === 'refurbished'
        ? 'Reacondicionado'
        : 'Nuevo';
  }

  draftPriceLabel(draft: AuthoringDraft): string {
    return this.formatPrice(this.draftNumber(draft, 'amount'), this.currency());
  }

  // ─── SH-7 wiring (mensajes) ────────────────────────────────────────────────
  onThreadSelect(thread: SellerThread): void {
    if (thread.unread) {
      // Opening a thread clears its unread flag (local state; API syncs later).
      this.threads.update((list) =>
        list.map((entry) => (entry.id === thread.id ? { ...entry, unread: false } : entry)),
      );
    }
    const current = this.threads().find((entry) => entry.id === thread.id) ?? thread;
    this.activeThread.set(current);
  }

  async onSendReply(event: MessageSendEvent<SellerThread>): Promise<void> {
    if (this.sending()) {
      return;
    }
    this.sending.set(true);
    this.actionError.set(null);
    try {
      const message = await this.#api.reply(this.apiBase(), event.thread.id, event.body);
      if (!message) {
        // NO salió (UI#92). El compositor ya se vació al enviar, así que el texto se queda en
        // el hilo, MARCADO y sin fecha —una fecha sería el acuse que no existe—, con su
        // reintento: borrarlo se lleva lo que acaba de escribir (regla 18b, la forma de EHR).
        this.unsentReplies += 1;
        this.patchThread(event.thread.id, (thread) => ({
          ...thread,
          messages: [
            ...thread.messages,
            { id: `sin-enviar-${this.unsentReplies}`, from: 'seller', body: event.body, date: '', failed: true },
          ],
        }));
        this.actionError.set('Tu respuesta NO se envió. Queda en el hilo para reintentarla.');
        return;
      }
      this.patchThread(event.thread.id, (thread) => ({
        ...thread,
        messages: [...thread.messages, message],
        date: message.date,
      }));
    } finally {
      this.sending.set(false);
    }
  }

  /** Reintenta una respuesta marcada, sin volver a teclearla (UI#92). */
  async retryReply(thread: SellerThread, message: SellerMessage): Promise<void> {
    if (!message.failed || this.sending()) {
      return;
    }
    this.sending.set(true);
    this.actionError.set(null);
    try {
      const sent = await this.#api.reply(this.apiBase(), thread.id, message.body);
      if (!sent) {
        this.actionError.set('Tu respuesta sigue sin enviarse. Queda en el hilo.');
        return;
      }
      this.patchThread(thread.id, (entry) => ({
        ...entry,
        messages: entry.messages.map((item) => (item.id === message.id ? sent : item)),
        date: sent.date,
      }));
    } finally {
      this.sending.set(false);
    }
  }

  /** Cambia un hilo en la lista y, si es el abierto, también el abierto. */
  private patchThread(id: string, patch: (thread: SellerThread) => SellerThread): void {
    this.threads.update((list) => list.map((thread) => (thread.id === id ? patch(thread) : thread)));
    const active = this.threads().find((entry) => entry.id === id) ?? null;
    if (this.activeThread()?.id === id) {
      this.activeThread.set(active);
    }
  }

  // ─── Data loading ──────────────────────────────────────────────────────────
  private loadSummary(): Promise<void> {
    return this.leer('resumen', () => this.#api.summary(this.apiBase()), (summary) => {
      this.kpiMetrics.set(summary.kpis);
      this.reputation.set(summary.reputation);
    });
  }

  /**
   * La bandeja, con el filtro y la página de ahora. Siempre se vuelve a pedir —un filtro, una página, «Reintentar» o
   * un acto son otra lectura—, y la que llega tarde no se pinta: con dos filtros seguidos, la respuesta del primero
   * dejaría filas de una etapa bajo el chip de otra.
   */
  private async loadOrders(): Promise<void> {
    const pedida = ++this.bandejaPedida;
    const etapa = (ETAPAS_DEL_DESPACHO as readonly string[]).includes(this.sectionFilter())
      ? (this.sectionFilter() as EtapaDelDespacho)
      : null;
    this.marcar('ventas', 'cargando');
    let resultado: LecturaDeLaConsola<BandejaDeLaTienda>;
    try {
      resultado = await this.#api.pedidos(this.apiBase(), etapa, this.paginaDeVentas());
    } catch {
      resultado = { tipo: 'caida' };
    }
    if (pedida !== this.bandejaPedida) {
      return;
    }
    if (resultado.tipo === 'leidas' || resultado.tipo === 'vacia' || resultado.tipo === 'muestras') {
      this.bandeja.set(resultado.datos);
    }
    this.marcar('ventas', resultado.tipo);
  }

  private loadListings(): Promise<void> {
    return this.leer('publicaciones', () => this.#api.listings(this.apiBase(), this.currency()), (listings) =>
      this.listings.set(listings),
    );
  }

  private loadReturns(): Promise<void> {
    return this.leer('devoluciones', () => this.#api.devoluciones(this.apiBase()), (devoluciones) =>
      this.devoluciones.set(devoluciones),
    );
  }

  private loadThreads(): Promise<void> {
    return this.leer('mensajes', () => this.#api.threads(this.apiBase()), (threads) => this.threads.set(threads));
  }

  /**
   * Pide una lectura y deja dicho cómo quedó. No vuelve a pedir lo que ya contestó con datos ni lo
   * que está en vuelo; lo demás —sin pedir, caída, sin sesión, sin permiso— sí, que es lo que hace
   * «Reintentar». Un fallo que el cliente no esperaba es una caída, no un esqueleto eterno.
   */
  private async leer<T>(
    lectura: Lectura,
    pedir: () => Promise<LecturaDeLaConsola<T>>,
    guardar: (datos: T) => void,
  ): Promise<void> {
    if (this.lecturas()[lectura] === 'cargando' || this.cargada(lectura)) {
      return;
    }
    this.marcar(lectura, 'cargando');
    let resultado: LecturaDeLaConsola<T>;
    try {
      resultado = await pedir();
    } catch {
      resultado = { tipo: 'caida' };
    }
    if (resultado.tipo === 'leidas' || resultado.tipo === 'vacia' || resultado.tipo === 'muestras') {
      guardar(resultado.datos);
    }
    this.marcar(lectura, resultado.tipo);
  }

  /** La lectura ya contestó con datos: leídos, vacíos o, con la marca, de ejemplo. */
  private cargada(lectura: Lectura): boolean {
    const estado = this.lecturas()[lectura];
    return estado === 'leidas' || estado === 'vacia' || estado === 'muestras';
  }

  private marcar(lectura: Lectura, estado: EstadoDeLectura): void {
    this.lecturas.update((estados) => ({ ...estados, [lectura]: estado }));
  }

  // ─── Labels + formatting (UI copy only — data comes from the API) ──────────

  listingStatusLabel(status: SellerListing['status']): string {
    switch (status) {
      case 'activa':
        return 'Activa';
      case 'pausada':
        return 'Pausada';
      case 'agotada':
        return 'Sin stock';
    }
  }

  returnStatusLabel(status: SellerReturn['status']): string {
    switch (status) {
      case 'abierto':
        return 'Abierta';
      case 'en-revision':
        return 'En revisión';
      case 'aprobado':
        return 'Aprobada';
      case 'rechazado':
        return 'Rechazada';
    }
  }

  formatPercent(value: number): string {
    return `${this.formatNumber(value)} %`;
  }

  formatRating(value: number): string {
    return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value)} / 5`;
  }

  private formatKpiValue(metric: SellerKpiMetric): string {
    switch (metric.unit) {
      case 'currency':
        return this.formatPrice(metric.value, this.currency());
      case 'rating':
        return this.formatRating(metric.value);
      case 'percent':
        return this.formatPercent(metric.value);
      default:
        return this.formatNumber(metric.value);
    }
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value);
  }

  /** Un importe con su moneda; sin moneda (todavía no llegó ningún precio) se pinta el número solo. */
  private formatPrice(amount: number, currency: string): string {
    return formatearImporte(amount, currency);
  }
}
