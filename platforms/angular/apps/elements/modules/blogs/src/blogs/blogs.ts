import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  inject,
  input,
  output,
  type OnInit,
} from '@angular/core';
import type { BlogsProps } from '@synergos/contracts';
import {
  ArticuloDeBlogs,
  BordeDeBlogs,
  CompositorDeBlogs,
  EstudioDeBlogs,
  ExplorarDeBlogs,
  GuardadosDeBlogs,
  InicioDeBlogs,
  MensajesDeBlogs,
  NotificacionesDeBlogs,
  PerfilDeBlogs,
  PublicacionDeBlogs,
  ReaccionesDeBlogs,
  RedDeBlogs,
  SUSCRIPCION_ENCENDIDA,
  SeguidoresDeBlogs,
  SuscripcionDeBlogs,
  TEXTOS_DE_BLOGS,
  type BlogsView,
  type BusDeBlogs,
  type ReactionType,
} from '@synergos/dominio/blogs';
import {
  BadgeComponent,
  ButtonComponent,
  LiveAnnouncerService,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { OrchestratorService, SessionStore, TransactionEventBusService } from '@synergos/transaction-engine';
import { BLOGS_FLOW } from './blogs-fulfillment.strategy';
import { NavegacionDeBlogs } from './estado/navegacion';
import { INSTANCIA_DE_BLOGS, PresentacionDeBlogs } from './estado/presentacion';
import { textosDeEstaRed } from './textos-de-blogs';
import { BlogsEscribirComponent } from './vistas/escribir/escribir';
import { BlogsEstudioComponent } from './vistas/estudio/estudio';
import { BlogsExplorarComponent } from './vistas/explorar/explorar';
import { BlogsGuardadosComponent } from './vistas/guardados/guardados';
import { BlogsInicioComponent } from './vistas/inicio/inicio';
import { BlogsMensajesComponent } from './vistas/mensajes/mensajes';
import { BlogsNotificacionesComponent } from './vistas/notificaciones/notificaciones';
import { BlogsPerfilComponent } from './vistas/perfil/perfil';
import { BlogsPublicacionComponent } from './vistas/publicacion/publicacion';
import { BlogsSuscripcionComponent } from './vistas/suscripcion/suscripcion';

/**
 * Runtime config for the CMS element <c>elementSynBlogs</c>.
 *
 * Blogs **v2** — the red social multi-página (X + Instagram + Medium + LinkedIn,
 * doc 21 §2.3 + `deep-research/blogs.md`) rebuilt as a **hash-routed SPA**
 * (`#/blogs/...`) and the Ola-6 consumer of the reusable shell catalogue
 * `@synergos/shells`:
 *
 *  - **Feed** (Para ti / Siguiendo) con composer inline + reacciones/comentarios
 *    optimistas · **Post/hilo** con comentarios anidados · **Perfil** rico
 *    (header+banner+stats, seguir/dejar de seguir) · **Explore/Search/Hashtag**
 *    con **SH-1 `syn-discovery-shell`** (facetas tema/tab) · **DMs** con
 *    **SH-7 `syn-message-center`** (inbox + hilo + composer — la pieza nueva
 *    grande) · **Notificaciones** · **Guardados/listas** con **SH-4** · **Creator
 *    Studio** con **SH-5 `syn-console-shell`** (analytics + monetización) ·
 *    **Long-form** editor (`/write`) · **Suscripción/tip** con **SH-3
 *    `syn-checkout-wizard`** sobre el motor (opcional).
 *
 * El `config` que manda el CMS tiene la forma de `BlogsProps`, GENERADO del record C# (ADR 0135):
 * lo del editor y dónde vive la API para el sitio, que sale de `Synergos:Features:Blogs` y el
 * editor no ve (ADR 0137, CMS#196). La moneda no es configuración: llega con cada precio. Lo que
 * sólo entraba por el JSON libre queda como atributo del tag crudo con su valor del componente.
 */
export type BlogsConfig = Partial<BlogsProps>;

const DEFAULT_SCOPE = 'blogs';

const DEFAULT_VIEW: BlogsView = 'feed';
// `Inicio` es la etiqueta que la propia navegación usa para esta vista (blogs.html),
// igual que `Explorar` o `Notificaciones` titulan las suyas. Es el fallback cuando el CMS
// no compone nada; con CMS delante gana el texto del editor.
const DEFAULT_HEADING = 'Inicio';
const SESSION_TTL_MS = 30 * 60 * 1000;

const VALID_VIEWS: readonly BlogsView[] = [
  'feed',
  'post',
  'profile',
  'notifications',
  'search',
  'messages',
  'saved',
  'write',
  'studio',
  'subscribe',
];

/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeBlogsConfig(value: BlogsConfig): BlogsConfig {
  return omitUndefinedProperties<BlogsProps>({
    heading: coerceTrimmedStringInput(value.heading),
    subheading: coerceTrimmedStringInput(value.subheading),
    apiBase: coerceTrimmedStringInput(value.apiBase),
  });
}

function coerceView(value: unknown): BlogsView | undefined {
  const raw = coerceTrimmedStringInput(value)?.toLowerCase();
  return raw && (VALID_VIEWS as readonly string[]).includes(raw) ? (raw as BlogsView) : undefined;
}

let blogsInstanceId = 0;

/**
 * La red social como composición (012-blogs-social, I2, T015): el elemento lee su `config`, conecta la fachada de
 * `@synergos/dominio/blogs` —un caso de uso por vista— y pinta el riel, los avisos, la vista en curso y las
 * tendencias. Cada vista es su componente, como en la tienda (014): el inicio, la publicación con su hilo, el perfil,
 * las notificaciones, Explorar, los mensajes, los guardados, escribir, el estudio y la suscripción.
 */
@Component({
  selector: 'sg-blogs',
  standalone: true,
  imports: [
    BadgeComponent,
    ButtonComponent,
    BlogsInicioComponent,
    BlogsPublicacionComponent,
    BlogsPerfilComponent,
    BlogsNotificacionesComponent,
    BlogsExplorarComponent,
    BlogsMensajesComponent,
    BlogsGuardadosComponent,
    BlogsEscribirComponent,
    BlogsEstudioComponent,
    BlogsSuscripcionComponent,
  ],
  templateUrl: './blogs.html',
  styleUrl: './blogs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Sin encapsulación (012-blogs-social, I2, como la tienda en 014): la hoja de la red pinta también las vistas y las
  // piezas, que son sus componentes hijos. Sus clases van con el prefijo `blogs__` y su anfitrión con `.sg-blogs`.
  encapsulation: ViewEncapsulation.None,
  // Embedded published custom elements (<synergos-comments-widget>, <synergos-notification-center> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'sg-blogs' },
  // La fachada de la red, una por elemento: cada red de la página tiene su feed, su hilo y su bandeja. Los servicios de
  // la app (la navegación por hash y la presentación) también, porque son de ESTA red.
  providers: [
    { provide: INSTANCIA_DE_BLOGS, useFactory: () => (blogsInstanceId += 1) },
    { provide: TEXTOS_DE_BLOGS, useFactory: textosDeEstaRed },
    RedDeBlogs,
    InicioDeBlogs,
    CompositorDeBlogs,
    ArticuloDeBlogs,
    PublicacionDeBlogs,
    ReaccionesDeBlogs,
    PerfilDeBlogs,
    SeguidoresDeBlogs,
    GuardadosDeBlogs,
    NotificacionesDeBlogs,
    ExplorarDeBlogs,
    MensajesDeBlogs,
    EstudioDeBlogs,
    SuscripcionDeBlogs,
    NavegacionDeBlogs,
    PresentacionDeBlogs,
  ],
})
export class BlogsElementComponent implements OnInit {
  // Todas las fachadas se piden aquí, también las que el riel no lee: cada caso de uso del usuario se apunta al nacer
  // para vaciarse cuando el servidor dice que no hay sesión (`alPerderLaSesion`), y uno que no naciera se quedaría
  // con lo de antes en pantalla.
  readonly red = inject(RedDeBlogs);
  readonly inicio = inject(InicioDeBlogs);
  readonly compositor = inject(CompositorDeBlogs);
  readonly articulo = inject(ArticuloDeBlogs);
  readonly publicacion = inject(PublicacionDeBlogs);
  readonly reacciones = inject(ReaccionesDeBlogs);
  readonly perfil = inject(PerfilDeBlogs);
  readonly seguidores = inject(SeguidoresDeBlogs);
  readonly guardados = inject(GuardadosDeBlogs);
  readonly notificaciones = inject(NotificacionesDeBlogs);
  readonly explorar = inject(ExplorarDeBlogs);
  readonly mensajes = inject(MensajesDeBlogs);
  readonly estudio = inject(EstudioDeBlogs);
  readonly suscripcion = inject(SuscripcionDeBlogs);
  readonly navegacion = inject(NavegacionDeBlogs);
  readonly presentacion = inject(PresentacionDeBlogs);

  /** El número de ESTA red en la página: el ámbito de su sesión y de su bus. */
  readonly instanceId = this.presentacion.instancia;

  readonly #destroyRef = inject(DestroyRef);
  readonly #store = inject(SessionStore);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #bus = inject<TransactionEventBusService<BusDeBlogs>>(TransactionEventBusService);
  readonly #borde = inject(BordeDeBlogs);
  /**
   * Región `aria-live` COMPARTIDA del design system. Reemplaza al `signal` + `<p role=status>`
   * de esta plantilla: una señal compara con `Object.is`, así que re-anunciar el MISMO texto
   * (dos 403 de hilo ajeno seguidos: "Esa conversación no es tuya") no mutaba el DOM y el
   * lector callaba (GOV-BL-A11Y-05). El servicio separa las dos escrituras ('' → mensaje) con
   * un `setTimeout`, fuera del sistema de señales, que es lo único que fuerza la repetición.
   */
  readonly #announcer = inject(LiveAnnouncerService);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<BlogsConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<BlogsProps>(sanitizeBlogsConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly scopeInput = input<string | undefined>(undefined, { alias: 'scope' });
  readonly viewInput = input<string | undefined>(undefined, { alias: 'view' });
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
    resolveConfigValue(coerceTrimmedStringInput(this.scopeInput()), undefined, DEFAULT_SCOPE),
  );
  readonly initialView = computed<BlogsView>(() => {
    const view = resolveConfigValue(coerceView(this.viewInput()), undefined, DEFAULT_VIEW);
    return view === 'subscribe' && !SUSCRIPCION_ENCENDIDA ? DEFAULT_VIEW : view;
  });

  /** Si se ofrece la suscripción (P5 A): apagada hasta que haya cobro real. */
  readonly suscripcionEncendida = SUSCRIPCION_ENCENDIDA;

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

  // ─── Outputs (CustomEvents) ────────────────────────────────────────────────
  readonly postpublished = output<{ id: string }>();
  readonly postreacted = output<{ id: string; type: ReactionType; active: boolean }>();
  readonly authorfollowed = output<{ actorKey: string; following: boolean }>();
  readonly messagesent = output<{ threadId: string }>();
  readonly articlepublished = output<{ id: string }>();
  readonly subscribed = output<{ creatorKey: string; tierId: string }>();
  readonly viewchanged = output<BlogsView>();

  /** Multi-tab live-session notice (monetization cart). */
  readonly liveConflict = this.#store.liveSessionConflict;

  // ─── Degradation flag (mock fallback surfaced to the shell) ─────────────────────
  readonly degraded = computed(() => {
    // Recompute whenever a fetch path could have flipped the flag.
    void this.inicio.feedLoaded();
    void this.red.view();
    void this.publicacion.activePost();
    void this.perfil.profile();
    void this.explorar.searchResult();
    void this.notificaciones.notificationsLoaded();
    void this.mensajes.threadsLoaded();
    void this.guardados.savedLoaded();
    void this.estudio.studioLoaded();
    return this.#borde.degraded;
  });

  constructor() {
    this.navegacion.alCambiarDeVista = (view) => this.viewchanged.emit(view);
    this.red.conectar({
      apiBase: this.apiBase,
      scope: this.scope,
      navegacion: this.navegacion,
      eventos: {
        postpublished: (evento) => this.postpublished.emit(evento),
        postreacted: (evento) => this.postreacted.emit(evento),
        authorfollowed: (evento) => this.authorfollowed.emit(evento),
        messagesent: (evento) => this.messagesent.emit(evento),
        articlepublished: (evento) => this.articlepublished.emit(evento),
        subscribed: (evento) => this.subscribed.emit(evento),
      },
      anunciar: (mensaje) => this.#announcer.announce(mensaje),
    });

    // Bind the unified session (subscription cart) to this origin and rehydrate.
    this.#store.init({
      scope: `blogs.${this.instanceId}`,
      flow: BLOGS_FLOW,
      ttlMs: SESSION_TTL_MS,
    });
    this.#bus.scope(`blogs-${this.instanceId}`);

    const widget = this.#orchestrator.register('blogs-feed', { order: 0 });
    this.#orchestrator.setStatus(widget, 'ready');

    // Hash router: deep-linkable views (#/<scope>/post/<id>, #/<scope>/mensajes…).
    const onHashChange = (): void => this.navegacion.applyHash();
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', onHashChange);
    }

    this.#destroyRef.onDestroy(() => {
      this.#orchestrator.unregister(widget);
      this.#bus.destroy();
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', onHashChange);
      }
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
    this.red.view.set(this.initialView());
    void this.inicio.loadFeed();
    void this.explorar.loadTrending();
    void this.red.loadYo();
    this.navegacion.applyHash();
  }
}
