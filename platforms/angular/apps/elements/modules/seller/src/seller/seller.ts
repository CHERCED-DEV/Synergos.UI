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
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import type { SellerProps } from '@synergos/contracts';
import { HostIdentityService } from '@synergos/core';
import { SellerApiClient } from './seller-api.client';
import {
  type SellerKpiMetric,
  type SellerListing,
  type SellerMessage,
  type SellerOrder,
  type SellerPublishRequest,
  type SellerPublishReceipt,
  type SellerReputation,
  type SellerReturn,
  type SellerReturnAction,
  type SellerSectionId,
  type SellerThread,
  type SellerView,
} from './seller.model';
import { formatearImporte } from '@synergos/vitals-core';

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
  readonly order?: SellerOrder;
  readonly listing?: SellerListing;
  readonly rma?: SellerReturn;
}

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

const ORDER_FILTERS: readonly ConsoleFilter[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'por-enviar', label: 'Por enviar' },
  { key: 'enviadas', label: 'Enviadas' },
  { key: 'entregadas', label: 'Entregadas' },
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
  });
}

let sellerInstanceId = 0;

@Component({
  selector: 'sg-seller',
  standalone: true,
  imports: [ConsoleShellComponent, AuthoringWizardComponent, MessageCenterComponent],
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
   * Dónde vive la API. Sin ella no se llama a nada y cada vista degrada a su muestra, visible:
   * no hay una base de respaldo compilada (ADR 0137).
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
  readonly currency = computed(() => this.orders()[0]?.currency || this.listings()[0]?.currency || '');

  readonly instanceId = (sellerInstanceId += 1);
  readonly fieldId = `syn-seller-${this.instanceId}`;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly productpublished = output<SellerPublishReceipt>();

  // ─── Shell references ──────────────────────────────────────────────────────
  readonly wizard = viewChild(AuthoringWizardComponent);

  // ─── Top-level router (3 vistas) ───────────────────────────────────────────
  readonly view = signal<SellerView>('panel');

  // ─── Data (always from the API — visible mock degradation) ─────────────────
  readonly kpiMetrics = signal<readonly SellerKpiMetric[]>([]);
  readonly reputation = signal<SellerReputation | null>(null);
  /**
   * Placeholder metric cards for the reputation skeleton. Three, because the
   * real grid is always hero + exactly three metrics (on-time / claims /
   * answered) — the mould is a fixed shape, not a guess.
   */
  readonly repSkeletonCards = [0, 1, 2];
  readonly orders = signal<readonly SellerOrder[]>([]);
  readonly ordersLoaded = signal(false);
  readonly ordersLoading = signal(false);
  readonly listings = signal<readonly SellerListing[]>([]);
  readonly listingsLoaded = signal(false);
  readonly listingsLoading = signal(false);
  readonly returns = signal<readonly SellerReturn[]>([]);
  readonly returnsLoaded = signal(false);
  readonly returnsLoading = signal(false);
  readonly threads = signal<readonly SellerThread[]>([]);
  readonly threadsLoaded = signal(false);
  readonly threadsLoading = signal(false);

  /**
   * Lo que una ESCRITURA no consiguió, dicho donde el vendedor lo ve (#77).
   *
   * Es distinto del cartel de `degraded()`, y por eso no se reusa: aquél dice «estás viendo
   * datos de ejemplo» sobre LECTURAS, que es legítimo (regla 4); esto dice «lo que acabás de
   * pedir no ocurrió». Meter las dos cosas en el mismo cartel haría que la segunda se leyera
   * como la primera, que es de lo que quien publica un producto no se entera.
   */
  readonly actionError = signal<string | null>(null);

  /** Cuántas respuestas no salieron en esta pestaña: el id local de su burbuja marcada. */
  private unsentReplies = 0;

  readonly degraded = computed(() => {
    // Recompute on each data load; the flag is set by the API client.
    void this.kpiMetrics();
    void this.orders();
    void this.listings();
    void this.returns();
    void this.threads();
    return this.#api.degraded;
  });

  // ─── SH-5 console: sections + KPIs + rows ──────────────────────────────────
  readonly activeSection = signal<SellerSectionId>('ventas');
  readonly sectionFilter = signal('todas');

  readonly consoleConfig = computed<ConsoleShellConfig>(() => ({
    heading: 'Panel',
    navLabel: 'Secciones del panel de vendedor',
    kpisLabel: 'Indicadores del negocio',
    actionsLabel: 'Acciones',
    emptyMessage: 'No hay registros en esta cola.',
    loadingMessage: 'Cargando…',
    sections: [
      { id: 'ventas', label: 'Ventas', badge: this.orders().length || undefined },
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

  readonly consoleKpis = computed<readonly ConsoleKpi[]>(() =>
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
        return ORDER_FILTERS;
    }
  });

  readonly sectionLoading = computed(() => {
    switch (this.activeSection()) {
      case 'publicaciones':
        return this.listingsLoading();
      case 'devoluciones':
        return this.returnsLoading();
      case 'reputacion':
        return false;
      default:
        return this.ordersLoading();
    }
  });

  readonly consoleRows = computed<readonly SellerRowVm[]>(() => {
    switch (this.activeSection()) {
      case 'publicaciones':
        return this.filteredListings().map((listing) => this.listingRow(listing));
      case 'devoluciones':
        return this.filteredReturns().map((rma) => this.returnRow(rma));
      case 'reputacion':
        return [];
      default:
        return this.filteredOrders().map((order) => this.orderRow(order));
    }
  });

  /** Per-row actions: only status-appropriate verbs surface. */
  readonly rowActionsFor = (row: SellerRowVm): readonly ConsoleRowAction[] => {
    if (row.kind === 'order' && row.order && this.canAdvance(row.order)) {
      return [ADVANCE_ACTION];
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
    if (section === 'publicaciones') {
      void this.loadListings();
    } else if (section === 'devoluciones') {
      void this.loadReturns();
    }
  }

  onFilterChange(filterKey: string): void {
    this.sectionFilter.set(filterKey);
  }

  onRowAction(event: ConsoleRowActionEvent<SellerRowVm>): void {
    const row = event.row;
    if (event.actionId === 'advance' && row.order) {
      void this.advanceOrder(row.order);
      return;
    }
    if ((event.actionId === 'approve' || event.actionId === 'reject') && row.rma) {
      void this.resolveReturn(row.rma, event.actionId);
    }
  }

  private canAdvance(order: SellerOrder): boolean {
    return order.status === 'paid' || order.status === 'preparing' || order.status === 'shipped';
  }

  private async advanceOrder(order: SellerOrder): Promise<void> {
    const status = await this.#api.advanceShipment(this.apiBase(), order.orderNumber);
    if (!status) {
      // El servidor no lo movió, así que la fila NO se mueve (#77). Pintarle el estado
      // siguiente al vendedor le decía que el pedido iba en camino cuando no había salido.
      this.actionError.set(
        `No pudimos avanzar el pedido ${order.orderNumber}. Sigue en «${order.status}»; volvé a intentarlo.`,
      );
      return;
    }
    this.actionError.set(null);
    this.orders.update((list) =>
      list.map((entry) =>
        entry.orderNumber === order.orderNumber ? { ...entry, status } : entry,
      ),
    );
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

  // ─── Filters (client-side over the API data) ───────────────────────────────
  private filteredOrders(): readonly SellerOrder[] {
    const filter = this.sectionFilter();
    const orders = this.orders();
    switch (filter) {
      case 'por-enviar':
        return orders.filter((order) => order.status === 'paid' || order.status === 'preparing');
      case 'enviadas':
        return orders.filter((order) => order.status === 'shipped');
      case 'entregadas':
        return orders.filter((order) => order.status === 'delivered');
      default:
        return orders;
    }
  }

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
  private orderRow(order: SellerOrder): SellerRowVm {
    return {
      id: order.orderNumber,
      kind: 'order',
      order,
      tone:
        order.status === 'delivered'
          ? 'ok'
          : order.status === 'cancelled'
            ? 'muted'
            : order.status === 'shipped'
              ? 'info'
              : 'warn',
      cells: {
        orden: order.orderNumber,
        fecha: order.date,
        comprador: order.buyer || '—',
        productos: order.items
          .map((line) => (line.qty > 1 ? `${line.title} ×${line.qty}` : line.title))
          .join(' · '),
        total: this.formatPrice(order.total, order.currency || this.currency()),
        estado: this.orderStatusLabel(order.status),
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
      if (this.listingsLoaded()) {
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
  private async loadSummary(): Promise<void> {
    const summary = await this.#api.summary(this.apiBase());
    this.kpiMetrics.set(summary.kpis);
    this.reputation.set(summary.reputation);
  }

  private async loadOrders(): Promise<void> {
    if (this.ordersLoaded()) {
      return;
    }
    this.ordersLoading.set(true);
    try {
      this.orders.set(await this.#api.orders(this.apiBase(), this.currency()));
      this.ordersLoaded.set(true);
    } finally {
      this.ordersLoading.set(false);
    }
  }

  private async loadListings(): Promise<void> {
    if (this.listingsLoaded()) {
      return;
    }
    this.listingsLoading.set(true);
    try {
      this.listings.set(await this.#api.listings(this.apiBase(), this.currency()));
      this.listingsLoaded.set(true);
    } finally {
      this.listingsLoading.set(false);
    }
  }

  private async loadReturns(): Promise<void> {
    if (this.returnsLoaded()) {
      return;
    }
    this.returnsLoading.set(true);
    try {
      this.returns.set(await this.#api.returns(this.apiBase()));
      this.returnsLoaded.set(true);
    } finally {
      this.returnsLoading.set(false);
    }
  }

  private async loadThreads(): Promise<void> {
    if (this.threadsLoaded()) {
      return;
    }
    this.threadsLoading.set(true);
    try {
      this.threads.set(await this.#api.threads(this.apiBase()));
      this.threadsLoaded.set(true);
    } finally {
      this.threadsLoading.set(false);
    }
  }

  // ─── Labels + formatting (UI copy only — data comes from the API) ──────────
  orderStatusLabel(status: SellerOrder['status']): string {
    switch (status) {
      case 'pending':
        return 'Pendiente de pago';
      case 'paid':
        return 'Por preparar';
      case 'preparing':
        return 'Preparando';
      case 'shipped':
        return 'Enviada';
      case 'delivered':
        return 'Entregada';
      case 'cancelled':
        return 'Cancelada';
    }
  }

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
