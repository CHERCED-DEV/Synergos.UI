import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, DestroyRef, effect, inject, input, OnInit, output, signal, untracked, viewChildren, ViewEncapsulation } from '@angular/core';
import { type StorefrontProps } from '@synergos/contracts';
import {
  AvisosDeLaTienda,
  type BusDeLaTienda,
  CarritoDeLaTienda,
  CatalogoDeLaTienda,
  CompraDeLaTienda,
  ConfiguracionDeLaTienda,
  DeseosDeLaTienda,
  DevolucionesDeLaTienda,
  EscritorioDeLaTienda,
  LecturasDeLaTienda,
  MensajesDeLaTienda,
  PedidosDeLaTienda,
  ResenasDeLaTienda,
  STOREFRONT_FLOW,
  TEXTOS_DE_LA_TIENDA,
} from '@synergos/dominio/tienda';
import {
  BadgeComponent,
  ButtonComponent,
  coerceRutasDeLasVistas,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  LiveAnnouncerService,
  omitUndefinedProperties,
  resolveConfigValue,
  SynStatusBannerComponent,
} from '@synergos/shared';
import { OrchestratorService, SessionStore, TransactionEventBusService } from '@synergos/transaction-engine';
import { CompraEnLaPagina } from './estado/compra-en-la-pagina';
import { NavegacionDeLaTienda } from './estado/navegacion';
import { INSTANCIA_DE_LA_TIENDA, PresentacionDeLaTienda } from './estado/presentacion';
import { type ShopRole, type StorefrontView, VALORES_DE_LA_VISTA, VISTAS_DEL_BLOQUE } from './rutas-de-la-tienda';
import { TEXTOS_DE_ESTA_TIENDA } from './textos-de-la-tienda';
import { TiendaCarritoComponent } from './vistas/carrito/carrito';
import { TiendaCatalogoComponent } from './vistas/catalogo/catalogo';
import { TiendaConfirmacionComponent } from './vistas/confirmacion/confirmacion';
import { TiendaCuentaComponent } from './vistas/cuenta/cuenta';
import { TiendaFichaComponent } from './vistas/ficha/ficha';
import { TiendaInicioComponent } from './vistas/inicio/inicio';
import { TiendaPagoComponent } from './vistas/pago/pago';
import { TiendaVendedorComponent } from './vistas/vendedor/vendedor';

/**
 * Runtime config for the CMS element <c>elementSynStorefront</c>.
 *
 * Storefront **v2** — the Tienda buyer-side app (Ola 1 doc 21) rebuilt as the
 * **first consumer of the reusable shell catalogue** `@synergos/shells`:
 * SH-1 `syn-discovery-shell` (PLP), SH-2 `syn-detail-shell` (PDP), SH-3
 * `syn-checkout-wizard` (checkout over the engine) and SH-4 `syn-account-shell`
 * (+ `syn-tracking-timeline`) for mis compras / tracking / wishlist / mensajes.
 * The storefront only contributes domain data, templates and its
 * `ShopFulfillmentStrategy` — the shells stay domain-free (contrato D3).
 */
export type StorefrontConfig = Partial<StorefrontProps>;
const DEFAULT_SCOPE = 'storefront';
const DEFAULT_HEADING = 'Todo lo que buscas, en un solo lugar';
const DEFAULT_SUBHEADING = 'Envíos a todo el país · hasta 36 cuotas · compra protegida';
const SESSION_TTL_MS = 30 * 60 * 1000;
/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeStorefrontConfig(value: StorefrontConfig): StorefrontConfig {
  return omitUndefinedProperties<StorefrontProps>({
    heading: coerceTrimmedStringInput(value.heading),
    subheading: coerceTrimmedStringInput(value.subheading),
    apiBase: coerceTrimmedStringInput(value.apiBase),
    purchasePath: coerceTrimmedStringInput(value.purchasePath),
    shippingCountry: coerceTrimmedStringInput(value.shippingCountry),
    zonaHoraria: coerceTrimmedStringInput(value.zonaHoraria),
    vista: coerceStringEnumInput(value.vista, VALORES_DE_LA_VISTA),
    rutas: coerceRutasDeLasVistas(value.rutas),
  });
}
let storefrontInstanceId = 0;

@Component({
  selector: 'sg-storefront',
  standalone: true,
  imports: [
    TiendaInicioComponent,
    TiendaCatalogoComponent,
    TiendaFichaComponent,
    TiendaCarritoComponent,
    TiendaPagoComponent,
    TiendaConfirmacionComponent,
    TiendaCuentaComponent,
    TiendaVendedorComponent,
    SynStatusBannerComponent,
    BadgeComponent,
    ButtonComponent,
  ],
  templateUrl: './storefront.html',
  styleUrl: './storefront.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Sin encapsulación (014-despiece-tienda, T010): la hoja de la tienda pinta también las vistas, que son sus
  // componentes hijos. Sus clases van con el prefijo `storefront__` y su anfitrión con `.sg-storefront`.
  encapsulation: ViewEncapsulation.None,
  // Embedded published custom elements (<synergos-rating-stars> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-storefront' },
  // La fachada de la tienda, una por elemento: cada tienda de la página tiene su catálogo, su ficha y su cuenta. Los
  // servicios de la app (navegación, compra en la página y presentación) también, porque son de ESTA tienda.
  providers: [
    { provide: INSTANCIA_DE_LA_TIENDA, useFactory: () => (storefrontInstanceId += 1) },
    ConfiguracionDeLaTienda,
    AvisosDeLaTienda,
    CatalogoDeLaTienda,
    ResenasDeLaTienda,
    DeseosDeLaTienda,
    MensajesDeLaTienda,
    PedidosDeLaTienda,
    DevolucionesDeLaTienda,
    EscritorioDeLaTienda,
    CarritoDeLaTienda,
    CompraDeLaTienda,
    NavegacionDeLaTienda,
    CompraEnLaPagina,
    PresentacionDeLaTienda,
    { provide: TEXTOS_DE_LA_TIENDA, useValue: TEXTOS_DE_ESTA_TIENDA },
  ],
})
export class StorefrontElementComponent implements OnInit {
  protected readonly avisos = inject(AvisosDeLaTienda);
  protected readonly carrito = inject(CarritoDeLaTienda);
  protected readonly catalogo = inject(CatalogoDeLaTienda);
  protected readonly configuracion = inject(ConfiguracionDeLaTienda);
  protected readonly deseos = inject(DeseosDeLaTienda);
  protected readonly escritorio = inject(EscritorioDeLaTienda);
  protected readonly navegacion = inject(NavegacionDeLaTienda);
  protected readonly pagina = inject(CompraEnLaPagina);
  protected readonly pedidos = inject(PedidosDeLaTienda);
  protected readonly presentacion = inject(PresentacionDeLaTienda);

  /** El número de ESTA tienda en la página: el ámbito de su sesión y de su bus. */
  readonly instanceId = inject(INSTANCIA_DE_LA_TIENDA);
  /** Los carritos pintados (la página y el cajón): el que tiene el cupón lo vacía cuando se aplica. */
  readonly vistasDelCarrito = viewChildren(TiendaCarritoComponent);

  readonly #destroyRef = inject(DestroyRef);

  readonly #store = inject(SessionStore);

  readonly #orchestrator = inject(OrchestratorService);

  readonly #bus = inject<TransactionEventBusService<BusDeLaTienda>>(TransactionEventBusService);

  readonly #lecturas = inject(LecturasDeLaTienda);

  readonly #announcer = inject(LiveAnnouncerService);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<StorefrontConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<StorefrontProps>(sanitizeStorefrontConfig),
  });

  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });

  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });

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

  readonly scope = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.scopeInput()),
      undefined,
      DEFAULT_SCOPE,
    ),
  );

  readonly heading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.headingInput()),
      this.config()?.heading,
      DEFAULT_HEADING,
    ),
  );

  readonly subheading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.subheadingInput()),
      this.config()?.subheading,
      DEFAULT_SUBHEADING,
    ),
  );

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly cartchange = output<number>();

  readonly orderconfirmed = output<{ orderRef: string; orderNumber: string }>();

  readonly liveConflict = this.#store.liveSessionConflict;

  /** Los dos avisos de la tienda: se pintan con `syn-status-banner` y se anuncian por la región que ya existía. */
  readonly textoOtraPestana = 'Otra pestaña tomó esta sesión de compra. Tu carrito se sincronizó.';

  readonly textoDatosDeEjemplo = 'Mostrando datos de ejemplo: el motor de la tienda aún no responde.';

  readonly degraded = computed(() => {
    // Recompute on each navigation/data load; the flag is set by the API client.
    void this.catalogo.searched();
    void this.navegacion.view();
    void this.catalogo.detail();
    void this.pedidos.orders();
    void this.deseos.wishlist();
    return this.#lecturas.degraded;
  });

  /** El país al que despacha el sitio (ISO 3166-1 alfa-2): lo declara el CMS, el formulario no lo pregunta. */
  readonly shippingCountry = computed(() => coerceTrimmedStringInput(this.config()?.shippingCountry) ?? '');

  /** La zona del sitio (IANA), en la que «Mis compras» dice sus fechas: la declara el CMS (`zonaHoraria`). */
  readonly zonaHoraria = computed(() => coerceTrimmedStringInput(this.config()?.zonaHoraria) ?? '');

  /**
   * Qué parte de la tienda es esta página (014-despiece-tienda, I3): la que el editor eligió en el bloque. Sin
   * elegir, el inicio, que es la tienda entera de antes.
   */
  readonly vista = computed<StorefrontView>(() => {
    const vista = this.config()?.vista;
    return vista && vista in VISTAS_DEL_BLOQUE ? VISTAS_DEL_BLOQUE[vista as keyof typeof VISTAS_DEL_BLOQUE] : 'home';
  });

  /** En qué página del sitio vive cada vista: la declara el CMS. Sin rutas, todo se abre en esta página. */
  readonly rutas = computed(() => this.config()?.rutas ?? []);

  // ═══ Consola del vendedor — SH-5 (#32) ═══════════════════════════════════════
  //
  // Tienda era el único de los tres dominios con cara B que no la tenía, y eso
  // dejó sin sitio a la cola de moderación de #31 y sin consumidor al
  // `POST /return/{rmaId}/advance`, que existía desde siempre.
  readonly role = signal<ShopRole>('buyer');

  setRole(role: ShopRole): void {
    if (this.role() === role) {
      return;
    }
    this.role.set(role);
    if (role === 'seller') {
      this.navegacion.view.set('seller');
      void this.escritorio.loadDesk();
      return;
    }
    this.navegacion.view.set('home');
  }

  /**
   * «Vender» y «Volver a comprar» (014-despiece-tienda, I3): si la otra cara vive en su página, el botón es un enlace
   * a ella y ya va; si no, la cara cambia aquí.
   */
  readonly paginaDeLaOtraCara = computed(() => this.navegacion.urlDe(this.role() === 'seller' ? 'home' : 'seller'));

  alternarCara(): void {
    if (!this.paginaDeLaOtraCara()) {
      this.setRole(this.role() === 'seller' ? 'buyer' : 'seller');
    }
  }

  constructor() {
    this.configuracion.conectar({
      apiBase: this.apiBase,
      zonaHoraria: this.zonaHoraria,
      purchasePath: computed(() => this.config()?.purchasePath),
      shippingCountry: this.shippingCountry,
    });
    this.navegacion.conectar({ scope: () => this.scope(), rutas: () => this.rutas(), vista: () => this.vista() });
    this.pagina.conectar({ alConfirmar: (pedido) => this.orderconfirmed.emit(pedido) });
    this.carrito.conectar({
      alCambiar: (count) => this.cartchange.emit(count),
      abrir: () => this.navegacion.cartOpen.set(true),
      anunciar: (texto, cortesia) => this.#announcer.announce(texto, cortesia),
      limpiarCupon: () => {
        for (const carrito of this.vistasDelCarrito()) carrito.limpiarCupon();
      },
    });
    // Bind the unified cart to this origin and rehydrate any live session.
    this.#store.init({
      scope: `storefront.${this.instanceId}`,
      flow: STOREFRONT_FLOW,
      ttlMs: SESSION_TTL_MS,
    });
    this.#bus.scope(`storefront-${this.instanceId}`);

    // Register the cart widget so the orchestrator tracks page readiness.
    const cartWidget = this.#orchestrator.register('storefront-cart', { order: 0 });
    this.#orchestrator.setStatus(cartWidget, 'ready');

    // Los dos avisos de la tienda se pintan con `syn-status-banner`, que nace con su mensaje dentro de su @if y no se
    // anuncia: se anuncian por la región que ya existía, cuando pasan a verdad (014-despiece-tienda, T006).
    effect(() => {
      if (this.liveConflict()) {
        untracked(() => this.#announcer.announce(this.textoOtraPestana));
      }
    });
    effect(() => {
      if (this.degraded()) {
        untracked(() => this.#announcer.announce(this.textoDatosDeEjemplo));
      }
    });

    // Hash router: deep-linkable views (#/<scope>/p/<id>, #/<scope>/cuenta/...).
    this.navegacion.escucharElHash(this.#destroyRef);

    this.#destroyRef.onDestroy(() => {
      this.#orchestrator.unregister(cartWidget);
      this.#bus.destroy();
    });
  }

  /**
   * Abre lo que eligió el editor y carga contra la API del sitio.
   *
   * No va en el constructor: en un custom element los inputs —el `config` del CMS— se aplican
   * DESPUÉS de crear el componente y ANTES del primer ciclo, así que el constructor los ve vacíos
   * (el defecto que el piloto de la ADR 0137 encontró en `eventos`, CMS#194).
   */
  ngOnInit(): void {
    // El enlace del aviso de una compra por la puerta (`?compra={id}`, 004-tienda-compra): se lee UNA vez y
    // sale de la URL, así recargar no vuelve a abrirla; en la página de la confirmación se queda, que es lo que muestra.
    this.pagina.leerElEnlace(this.vista() !== 'confirmation');
    // La parte de la tienda que el editor puso en esta página (014-despiece-tienda, I3); el hash la puede cambiar.
    this.navegacion.abrirLaVistaDeLaPagina();
    if (this.vista() === 'seller') {
      this.setRole('seller');
    }
    // Open with an unfiltered listing (feeds home rails + PLP), then honour a deep link.
    void this.catalogo.runSearch().then(() => {
      this.navegacion.applyHash();
      this.pagina.abrirElEnlace();
    });
  }
}
