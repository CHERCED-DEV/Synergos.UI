import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  EstudioDeBlogs,
  ExplorarDeBlogs,
  GuardadosDeBlogs,
  InicioDeBlogs,
  MensajesDeBlogs,
  ModeracionDeBlogs,
  NotificacionesDeBlogs,
  PerfilDeBlogs,
  PublicacionDeBlogs,
  RedDeBlogs,
  SUSCRIPCION_ENCENDIDA,
  type BlogsView,
  type NavegacionDeLaRed,
  type Post,
} from '@synergos/dominio/blogs';
import { baseDeRuta, mismaRuta, segmentosDeRuta, type RutaDeUnaVistaDelSitio } from '@synergos/vitals-core';
import { vistaDelBloque } from '../rutas-de-blogs';

/** Login del CMS — mismo destino que usa Gobierno para el hueco de identidad. */
const LOGIN_PATH = '/account/login';

/** El parámetro del inicio que abre el compositor (`#/<scope>/publicar`): el «Publicar» del riel desde otra página. */
export const PUBLICAR = 'publicar';

/** Las vistas que se abren con algo (la publicación, el alias, el hilo, la etiqueta): su enlace lo lleva en el hash. */
const CON_PARAMETRO: readonly BlogsView[] = ['feed', 'post', 'profile', 'messages', 'search'];

/**
 * La navegación de la red por hash (012-blogs-social, I2): `#/<scope>/post/<id>`, `#/<scope>/@<alias>`,
 * `#/<scope>/mensajes/<id>`… Pone la vista en la fachada, carga lo que le falte a cada una y escribe la ruta. Es de la
 * app, como la navegación de la tienda: la fachada la pide por `RedDeBlogs.navegacion`.
 *
 * Desde I3, una vista que vive en OTRA página del sitio se abre yendo a esa página (`rutas`, que manda el CMS): un
 * enlace de verdad, con atrás y adelante del navegador. Un artículo del CMS se abre en su propia página. Sin `rutas`,
 * la red es una sola página, como antes.
 */
@Injectable()
export class NavegacionDeBlogs implements NavegacionDeLaRed {
  readonly #red = inject(RedDeBlogs);
  readonly #inicio = inject(InicioDeBlogs);
  readonly #publicacion = inject(PublicacionDeBlogs);
  readonly #perfil = inject(PerfilDeBlogs);
  readonly #notificaciones = inject(NotificacionesDeBlogs);
  readonly #explorar = inject(ExplorarDeBlogs);
  readonly #mensajes = inject(MensajesDeBlogs);
  readonly #guardados = inject(GuardadosDeBlogs);
  readonly #estudio = inject(EstudioDeBlogs);
  readonly #moderacion = inject(ModeracionDeBlogs);

  #suppressedHash = '';

  /** Dónde vive cada vista en el sitio, y cuál es la de esta página: los del bloque, que conecta el elemento. */
  #rutas: () => readonly RutaDeUnaVistaDelSitio[] = () => [];
  #vistaDeLaPagina: () => BlogsView = () => 'feed';
  /** Si la página acota su vista (I6, «#arquitectura»): entonces no es la página de esa vista. */
  #acotada: () => boolean = () => false;

  /** El alias que pidió la ruta o un enlace: la página del perfil sin él abre el de quien lee. */
  readonly #perfilPedido = signal('');

  /** Si la ruta o un enlace pidieron un perfil por su alias: sin eso, la página del perfil es la de quien lee. */
  readonly pidioUnPerfil = computed(() => this.#perfilPedido() !== '');

  /** El shell la escucha para emitir `viewchanged`. */
  alCambiarDeVista: (view: BlogsView) => void = () => undefined;

  /** Va a otra página del sitio: un enlace de verdad, con atrás y adelante. Las pruebas la cambian. */
  abrirPagina: (url: string) => void = (url) => {
    if (typeof window !== 'undefined') {
      window.location.assign(url);
    }
  };

  conectar(fuentes: {
    rutas: () => readonly RutaDeUnaVistaDelSitio[];
    vista: () => BlogsView;
    acotada?: () => boolean;
  }): void {
    this.#rutas = fuentes.rutas;
    this.#vistaDeLaPagina = fuentes.vista;
    this.#acotada = fuentes.acotada ?? (() => false);
  }

  /** Abre la vista que el editor eligió para esta página, con lo que le falte, antes de mirar el hash. */
  abrirLaVistaDeLaPagina(): void {
    const vista = this.#vistaDeLaPagina();
    if (vista === 'feed') {
      this.#red.view.set('feed');
      return;
    }
    this.applyRoute(vista, '');
  }

  /** La página del perfil sin alias en la ruta abre el de quien lee, en cuanto se sabe quién es. */
  abrirMiPerfilSiFalta(): void {
    const handle = this.#red.viewer()?.handle;
    if (handle && this.#red.view() === 'profile' && !this.#perfilPedido()) {
      this.openProfile(handle);
    }
  }

  /**
   * La URL de la página donde vive `view`, con lo que la vista abre en su hash (la publicación, el alias, el hilo, la
   * etiqueta); vacía si la vista se abre en ESTA página: es la suya, o el sitio no le dio otra.
   *
   * Una página que acota su vista (I6) no es la de esa vista: desde «#arquitectura», Explorar y otra etiqueta se abren
   * en la página de Explorar, donde no hay etiqueta fija.
   */
  urlDe(view: BlogsView, param = ''): string {
    if (view === this.#vistaDeLaPagina() && !this.#acotada()) {
      return '';
    }
    const bloque = vistaDelBloque(view);
    const url = bloque ? this.#rutas().find((ruta) => ruta.vista === bloque)?.url : undefined;
    if (!url) {
      return '';
    }
    return param && CON_PARAMETRO.includes(view) ? `${url}${this.routeHash(view, param)}` : url;
  }

  /** Dónde se abre una publicación: un artículo del CMS, en su página; lo demás, en la de la publicación. */
  urlDeLaPublicacion(post: Post): string {
    return post.pageUrl || this.urlDe('post', post.id);
  }

  /**
   * Lo que hace pulsar un enlace de la red: si lleva `href` (la vista vive en otra página), el navegador ya va ahí —y
   * respeta abrirlo en otra pestaña—; si no, la abre aquí.
   */
  alPulsar(view: BlogsView, param = ''): void {
    if (this.urlDe(view, param)) {
      return;
    }
    if (view === 'feed') {
      this.backToFeed();
      if (param === PUBLICAR && !this.#inicio.composerOpen()) {
        this.#inicio.toggleComposer();
      }
    } else if (view === 'post' && param) {
      this.openPostById(param);
    } else if (view === 'profile' && param) {
      this.openProfile(param);
    } else if (view === 'search' && param) {
      this.#explorar.searchHashtag(param);
    } else {
      this.go(view);
    }
  }

  /** Pulsar una publicación: lo mismo, con la página de un artículo del CMS. */
  alPulsarLaPublicacion(post: Post): void {
    if (!this.urlDeLaPublicacion(post)) {
      this.openPost(post);
    }
  }

  /**
   * Escucha el hash del navegador mientras viva la red: atrás, adelante y un enlace pegado llevan a su vista. Es de la
   * navegación, como en la tienda: quien lee y escribe la ruta es quien la escucha (lo vigila `rutas-por-hash.spec`).
   */
  escucharElHash(destroyRef: DestroyRef): void {
    if (typeof window === 'undefined') {
      return;
    }
    const onHashChange = (): void => this.applyHash(true);
    window.addEventListener('hashchange', onHashChange);
    destroyRef.onDestroy(() => window.removeEventListener('hashchange', onHashChange));
  }

  go(view: BlogsView): void {
    const pagina = this.urlDe(view);
    if (pagina) {
      this.abrirPagina(pagina);
      return;
    }
    this.applyRoute(view, '');
    this.escribirRuta(view);
  }

  aplicar(view: BlogsView): void {
    this.applyRoute(view, '');
  }

  escribirRuta(view: BlogsView, param = ''): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = this.routeHash(view, param);
    if (!mismaRuta(window.location.hash, hash)) {
      this.#suppressedHash = hash;
      window.location.hash = hash;
    }
  }

  openPost(post: Post): void {
    const pagina = this.urlDeLaPublicacion(post);
    if (pagina) {
      this.abrirPagina(pagina);
      return;
    }
    this.#publicacion.preparar(post);
    this.applyRoute('post', '');
    this.escribirRuta('post', post.id);
    void this.#publicacion.loadPost(post.id);
  }

  openPostById(id: string): void {
    const pagina = this.urlDe('post', id);
    if (pagina) {
      this.abrirPagina(pagina);
      return;
    }
    this.applyRoute('post', '');
    this.escribirRuta('post', id);
    void this.#publicacion.loadPost(id);
  }

  backToFeed(): void {
    this.go('feed');
    this.#publicacion.activePost.set(null);
  }

  openProfile(handle: string): void {
    const pagina = this.urlDe('profile', handle);
    if (pagina) {
      this.abrirPagina(pagina);
      return;
    }
    this.#perfilPedido.set(handle);
    this.#perfil.reset();
    this.applyRoute('profile', '');
    this.escribirRuta('profile', handle);
    void this.#perfil.loadProfile(handle);
  }

  /**
   * Login del CMS de vuelta a ESTA página (con su hash, para caer en la misma vista).
   * Es un método y no un `computed` a propósito: el hash cambia con la navegación y un
   * computed cacheado devolvería el de la primera lectura.
   */
  loginUrl(): string {
    if (typeof window === 'undefined') {
      return LOGIN_PATH;
    }
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return `${LOGIN_PATH}?returnUrl=${encodeURIComponent(here)}`;
  }

  /** `alCambiar`: lo llama el navegador (atrás, adelante). Volver a la URL sin hash es volver a la vista de la página. */
  applyHash(alCambiar = false): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = window.location.hash;
    // Sólo se calla el hash que escribió la propia red: sin uno pendiente, un hash vacío NO es «el mismo».
    if (this.#suppressedHash && mismaRuta(hash, this.#suppressedHash)) {
      this.#suppressedHash = '';
      return;
    }
    const segments = segmentosDeRuta(hash, this.#red.scope());
    if (!segments) {
      if (alCambiar && !hash) {
        this.applyRoute(this.#vistaDeLaPagina(), '');
      }
      return;
    }
    const [head = '', tail = ''] = segments;
    switch (head) {
      case '':
        this.applyRoute('feed', '');
        return;
      case PUBLICAR:
        this.applyRoute('feed', '');
        if (!this.#inicio.composerOpen()) {
          this.#inicio.toggleComposer();
        }
        return;
      case 'post':
        this.applyRoute('post', tail);
        return;
      case 'notificaciones':
        this.applyRoute('notifications', '');
        return;
      case 'explorar':
        this.applyRoute('search', tail);
        return;
      case 'mensajes':
        this.applyRoute('messages', tail);
        return;
      case 'guardados':
        this.applyRoute('saved', '');
        return;
      case 'escribir':
        this.applyRoute('write', '');
        return;
      case 'studio':
        this.applyRoute('studio', '');
        return;
      case 'moderacion':
        this.applyRoute('moderation', '');
        return;
      case 'suscribir':
        // Apagada (P5 A): el enlace lleva al inicio en vez de abrir un pago que no cobra.
        this.applyRoute(SUSCRIPCION_ENCENDIDA ? 'subscribe' : 'feed', '');
        return;
      default:
        if (head.startsWith('@')) {
          this.applyRoute('profile', head.slice(1));
          return;
        }
        this.applyRoute('feed', '');
    }
  }

  private applyRoute(view: BlogsView, param: string): void {
    this.#red.view.set(view);
    this.#red.errorMessage.set('');
    this.alCambiarDeVista(view);
    switch (view) {
      case 'notifications':
        if (!this.#notificaciones.notificationsLoaded()) {
          void this.#notificaciones.loadNotifications();
        }
        return;
      case 'search':
        if (param) {
          this.#explorar.buscarLaEtiqueta(param);
        } else if (!this.#explorar.searchResult()) {
          void this.#explorar.runSearch();
        }
        return;
      case 'messages':
        if (!this.#mensajes.threadsLoaded()) {
          void this.#mensajes.loadThreads();
        }
        if (param) {
          void this.#mensajes.openThread(param);
        } else {
          // Entrar a la bandeja sin hilo: el veredicto del 403 anterior ya no aplica a
          // nada abierto, y dejarlo pintado sería un reproche colgado sin conversación.
          this.#red.threadAccess.set('ok');
        }
        return;
      case 'saved':
        if (!this.#guardados.savedLoaded()) {
          void this.#guardados.loadSaved();
        }
        return;
      case 'studio':
        if (!this.#estudio.studioLoaded()) {
          void this.#estudio.loadStudio();
        }
        return;
      case 'moderation':
        if (!this.#moderacion.colaCargada()) {
          void this.#moderacion.cargarCola();
        }
        return;
      case 'profile':
        if (param) {
          this.#perfilPedido.set(param);
          void this.#perfil.loadProfile(param);
        }
        return;
      case 'post':
        if (param) {
          void this.#publicacion.loadPost(param);
        }
        return;
      default:
        return;
    }
  }

  private routeHash(view: BlogsView, param: string): string {
    const base = baseDeRuta(this.#red.scope());
    switch (view) {
      case 'feed':
        return param === PUBLICAR ? `${base}/${PUBLICAR}` : base;
      case 'post':
        return `${base}/post/${encodeURIComponent(param)}`;
      case 'profile':
        return `${base}/@${encodeURIComponent(param)}`;
      case 'notifications':
        return `${base}/notificaciones`;
      case 'search':
        return `${base}/explorar${param ? `/${encodeURIComponent(param)}` : ''}`;
      case 'messages':
        return `${base}/mensajes${param ? `/${encodeURIComponent(param)}` : ''}`;
      case 'saved':
        return `${base}/guardados`;
      case 'write':
        return `${base}/escribir`;
      case 'studio':
        return `${base}/studio`;
      case 'moderation':
        return `${base}/moderacion`;
      case 'subscribe':
        return `${base}/suscribir`;
      default:
        return base;
    }
  }
}
