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
  ETAPAS_DEL_DESPACHO,
  type BandejaDeLaTienda,
  type DestinoDelEnvio,
  type DetalleDelPedido,
  type EtapaDelDespacho,
  type PedidoDeLaTienda,
  type SellerKpiMetric,
  type SellerListing,
  type SellerMessage,
  type SellerPublishRequest,
  type SellerPublishReceipt,
  type SellerReputation,
  type SellerReturn,
  type SellerReturnAction,
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
  readonly rma?: SellerReturn;
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

const RETURN_FILTERS: readonly ConsoleFilter[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'abiertas', label: 'Abiertas' },
  { key: 'resueltas', label: 'Resueltas' },
];

const ADVANCE_ACTION: ConsoleRowAction = {
  id: 'advance',
  label: 'Avanzar envío',
  kind: 'primary',
};
const APPROVE_ACTION: ConsoleRowAction = { id: 'approve', label: 'Aprobar', kind: 'primary' };
const REJECT_ACTION: ConsoleRowAction = { id: 'reject', label: 'Rechazar', kind: 'danger' };

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
  readonly returns = signal<readonly SellerReturn[]>([]);
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
      this.returns().filter((rma) => rma.status === 'abierto' || rma.status === 'en-revision')
        .length,
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
        return RETURN_FILTERS;
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
   * Per-row actions: only status-appropriate verbs surface. Un pedido avanza sólo si el servidor dice que tiene actos
   * (los botones de cada acto llegan con T021); su detalle se ve siempre.
   */
  readonly rowActionsFor = (row: SellerRowVm): readonly ConsoleRowAction[] => {
    if (row.kind === 'order' && row.pedido) {
      return row.pedido.actos.length > 0 ? [ADVANCE_ACTION, this.accionDetalle] : [this.accionDetalle];
    }
    if (
      row.kind === 'return' &&
      row.rma &&
      (row.rma.status === 'abierto' || row.rma.status === 'en-revision')
    ) {
      return [APPROVE_ACTION, REJECT_ACTION];
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
    if (event.actionId === 'advance' && row.pedido) {
      void this.advanceOrder(row.pedido);
      return;
    }
    if (event.actionId === 'detalle' && row.pedido) {
      void this.abrirDetalle(row.pedido);
      return;
    }
    if ((event.actionId === 'approve' || event.actionId === 'reject') && row.rma) {
      void this.resolveReturn(row.rma, event.actionId);
    }
  }

  private async advanceOrder(pedido: PedidoDeLaTienda): Promise<void> {
    const status = await this.#api.advanceShipment(this.apiBase(), pedido.orderRef);
    if (!status) {
      // El servidor no lo movió, así que la fila NO se mueve (#77). Pintarle el estado
      // siguiente al vendedor le decía que el pedido iba en camino cuando no había salido.
      this.actionError.set(
        `No pudimos avanzar el pedido ${pedido.orderNumber}. Sigue en «${this.textoEtapas[pedido.etapa]}»; volvé a intentarlo.`,
      );
      return;
    }
    this.actionError.set(null);
    // La fila se mueve con lo que diga el servidor: se vuelve a leer la bandeja, con su etapa y sus actos nuevos.
    await this.loadOrders();
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

  private async resolveReturn(rma: SellerReturn, action: SellerReturnAction): Promise<void> {
    const status = await this.#api.advanceReturn(this.apiBase(), rma.rmaId, action);
    if (!status) {
      this.actionError.set(
        `No pudimos ${action === 'approve' ? 'aprobar' : 'rechazar'} la devolución ${rma.rmaId}. Sigue en «${rma.status}».`,
      );
      return;
    }
    this.actionError.set(null);
    this.returns.update((list) =>
      list.map((entry) => (entry.rmaId === rma.rmaId ? { ...entry, status } : entry)),
    );
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

  private filteredReturns(): readonly SellerReturn[] {
    const filter = this.sectionFilter();
    const returns = this.returns();
    switch (filter) {
      case 'abiertas':
        return returns.filter((rma) => rma.status === 'abierto' || rma.status === 'en-revision');
      case 'resueltas':
        return returns.filter((rma) => rma.status === 'aprobado' || rma.status === 'rechazado');
      default:
        return returns;
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
        comprador: pedido.comprador || '—',
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

  private returnRow(rma: SellerReturn): SellerRowVm {
    return {
      id: rma.rmaId,
      kind: 'return',
      rma,
      tone:
        rma.status === 'aprobado'
          ? 'ok'
          : rma.status === 'rechazado'
            ? 'muted'
            : rma.status === 'en-revision'
              ? 'info'
              : 'warn',
      cells: {
        rma: rma.rmaId,
        orden: rma.orderNumber,
        producto: rma.productTitle,
        motivo: rma.reason,
        fecha: rma.date,
        estado: this.returnStatusLabel(rma.status),
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
    return this.leer('devoluciones', () => this.#api.returns(this.apiBase()), (returns) => this.returns.set(returns));
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
