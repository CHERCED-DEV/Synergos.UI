import { Injectable, inject } from '@angular/core';
import {
  EstudioDeBlogs,
  ExplorarDeBlogs,
  GuardadosDeBlogs,
  MensajesDeBlogs,
  NotificacionesDeBlogs,
  PerfilDeBlogs,
  PublicacionDeBlogs,
  RedDeBlogs,
  SUSCRIPCION_ENCENDIDA,
  type BlogsView,
  type NavegacionDeLaRed,
  type Post,
} from '@synergos/dominio/blogs';
import { baseDeRuta, mismaRuta, segmentosDeRuta } from '@synergos/vitals-core';

/** Login del CMS — mismo destino que usa Gobierno para el hueco de identidad. */
const LOGIN_PATH = '/account/login';

/**
 * La navegación de la red por hash (012-blogs-social, I2): `#/<scope>/post/<id>`, `#/<scope>/@<alias>`,
 * `#/<scope>/mensajes/<id>`… Pone la vista en la fachada, carga lo que le falte a cada una y escribe la ruta. Es de la
 * app, como la navegación de la tienda: la fachada la pide por `RedDeBlogs.navegacion`.
 */
@Injectable()
export class NavegacionDeBlogs implements NavegacionDeLaRed {
  readonly #red = inject(RedDeBlogs);
  readonly #publicacion = inject(PublicacionDeBlogs);
  readonly #perfil = inject(PerfilDeBlogs);
  readonly #notificaciones = inject(NotificacionesDeBlogs);
  readonly #explorar = inject(ExplorarDeBlogs);
  readonly #mensajes = inject(MensajesDeBlogs);
  readonly #guardados = inject(GuardadosDeBlogs);
  readonly #estudio = inject(EstudioDeBlogs);

  #suppressedHash = '';

  /** El shell la escucha para emitir `viewchanged`. */
  alCambiarDeVista: (view: BlogsView) => void = () => undefined;

  go(view: BlogsView): void {
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
    this.#publicacion.preparar(post);
    this.applyRoute('post', '');
    this.escribirRuta('post', post.id);
    void this.#publicacion.loadPost(post.id);
  }

  openPostById(id: string): void {
    this.applyRoute('post', '');
    this.escribirRuta('post', id);
    void this.#publicacion.loadPost(id);
  }

  backToFeed(): void {
    this.go('feed');
    this.#publicacion.activePost.set(null);
  }

  openProfile(handle: string): void {
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

  applyHash(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = window.location.hash;
    if (mismaRuta(hash, this.#suppressedHash)) {
      this.#suppressedHash = '';
      return;
    }
    const segments = segmentosDeRuta(hash, this.#red.scope());
    if (!segments) {
      return;
    }
    const [head = '', tail = ''] = segments;
    switch (head) {
      case '':
        this.applyRoute('feed', '');
        return;
      case 'post':
        this.applyRoute('post', tail);
        return;
      case 'notificaciones':
        this.applyRoute('notifications', '');
        return;
      case 'explorar':
        this.applyRoute('search', '');
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
        if (!this.#explorar.searchResult()) {
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
      case 'profile':
        if (param) {
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
        return base;
      case 'post':
        return `${base}/post/${encodeURIComponent(param)}`;
      case 'profile':
        return `${base}/@${encodeURIComponent(param)}`;
      case 'notifications':
        return `${base}/notificaciones`;
      case 'search':
        return `${base}/explorar`;
      case 'messages':
        return `${base}/mensajes${param ? `/${encodeURIComponent(param)}` : ''}`;
      case 'saved':
        return `${base}/guardados`;
      case 'write':
        return `${base}/escribir`;
      case 'studio':
        return `${base}/studio`;
      case 'subscribe':
        return `${base}/suscribir`;
      default:
        return base;
    }
  }
}
