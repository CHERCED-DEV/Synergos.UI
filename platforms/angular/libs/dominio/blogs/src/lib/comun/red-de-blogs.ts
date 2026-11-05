import { Injectable, computed, inject, signal, type Signal } from '@angular/core';
import { HostIdentityService } from '@synergos/core';
import { PerfilApi } from '../perfil/perfil-api.client';
import { mockViewer } from './blogs.mock';
import type { Author, BlogsView, Post, ReactionType } from './blogs.model';
import { isBlogsUnauthorized } from './errores';
import { TEXTOS_DE_BLOGS } from './textos';

/** Cómo se mueve la red: lo pone la app, con su navegación por hash, y lo piden los casos de uso. */
export interface NavegacionDeLaRed {
  go(view: BlogsView): void;
  openPost(post: Post): void;
  /** Una publicación que no está en ninguna lista de la pantalla: se abre por su id. */
  openPostById(id: string): void;
  openProfile(handle: string): void;
  /** Pone la vista y carga lo que le falte, sin tocar la ruta. */
  aplicar(view: BlogsView): void;
  /** Escribe la ruta (`#/<scope>/…`), sin volver a cargar nada. */
  escribirRuta(view: BlogsView, param?: string): void;
}

/** Lo que la red cuenta hacia fuera: los CustomEvents del elemento, que los pone la app. */
export interface EventosDeLaRed {
  postpublished(evento: { readonly id: string }): void;
  postreacted(evento: { readonly id: string; readonly type: ReactionType; readonly active: boolean }): void;
  authorfollowed(evento: { readonly actorKey: string; readonly following: boolean }): void;
  messagesent(evento: { readonly threadId: string }): void;
  articlepublished(evento: { readonly id: string }): void;
  subscribed(evento: { readonly creatorKey: string; readonly tierId: string }): void;
}

/**
 * Lo que el elemento le da a la red al montarse: lo que lee de sus entradas (dónde vive la API y el scope de la ruta) y
 * lo que la lib no puede hacer por sí misma —navegar por hash, emitir los CustomEvents y anunciar en la región viva del
 * design system—.
 */
export interface ConexionDeLaRed {
  /** Dónde vive la API, sin la barra final. */
  readonly apiBase: Signal<string>;
  /** El scope de la ruta por hash (`#/<scope>/…`). */
  readonly scope: Signal<string>;
  readonly navegacion: NavegacionDeLaRed;
  readonly eventos: EventosDeLaRed;
  readonly anunciar: (mensaje: string) => void;
}

const SIN_EVENTOS: EventosDeLaRed = {
  postpublished: () => undefined,
  postreacted: () => undefined,
  authorfollowed: () => undefined,
  messagesent: () => undefined,
  articlepublished: () => undefined,
  subscribed: () => undefined,
};

/**
 * Quien lee sin perfil conocido: ni handle, ni cifras, ni el nombre de nadie (CMS#197). El nombre que se pinta en local
 * («Tú») lo pone la app (`TextosDeBlogs.quienLee`).
 */
export const SIN_CIFRAS: Author = {
  actorKey: '',
  handle: '',
  displayName: '',
  bio: '',
  avatarUrl: '',
  bannerUrl: '',
  verified: false,
  followersCount: 0,
  followingCount: 0,
  postsCount: 0,
};

/** Vistas que SÍ renderizan el panel `.blogs__signin`. En el resto, un 401 debe dejar
 *  su aviso en el canal global o el usuario no ve absolutamente nada. */
export const VISTAS_CON_PANEL: readonly BlogsView[] = ['notifications', 'messages', 'saved', 'studio'];

/**
 * Lo que comparten todos los casos de uso de la red (012-blogs-social, I2, T013): dónde vive la API, quién lee, la vista
 * en la que está, el aviso global, la sesión, a quién sigue y qué guardó. Uno por elemento, como la fachada de la tienda.
 *
 * Lo que la lib no puede hacer por sí misma —navegar por hash, anunciar en la región viva del design system y emitir
 * los CustomEvents— se lo pone la app al montar el elemento, con `conectar`. Sin conectar, la base está vacía y nada
 * llama al borde (ADR 0137): cada lectura degrada a su muestra, visible.
 *
 * Y lo que toca a varias vistas a la vez se reparte por suscripción: cada caso de uso que pinta publicaciones se apunta
 * con `alParchear` para que un cambio (una reacción, un comentario) llegue a donde la publicación esté, y cada caso de
 * uso del usuario se apunta con `alPerderLaSesion` para vaciarse cuando el servidor dice que no hay sesión.
 */
@Injectable()
export class RedDeBlogs {
  readonly #identity = inject(HostIdentityService);
  readonly #perfil = inject(PerfilApi);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  readonly #fuentes = signal<Pick<ConexionDeLaRed, 'apiBase' | 'scope'> | null>(null);
  #navegacion: NavegacionDeLaRed | null = null;
  #eventos: EventosDeLaRed = SIN_EVENTOS;
  #anunciar: (mensaje: string) => void = () => undefined;

  /**
   * Dónde vive la API. Sin ella no se llama a nada y cada vista degrada a su muestra, visible:
   * no hay una base de respaldo compilada (ADR 0137). La declara el CMS en el `config` del elemento.
   */
  readonly apiBase = computed(() => this.#fuentes()?.apiBase() ?? '');
  /** El scope de la ruta por hash (`#/<scope>/…`). */
  readonly scope = computed(() => this.#fuentes()?.scope() ?? 'blogs');

  // ─── Shell / navigation state ───────────────────────────────────────────────
  readonly view = signal<BlogsView>('feed');
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  /** Se publica una nota o un artículo, nunca dos a la vez. */
  readonly publishing = signal(false);

  // ─── Acceso (401/403) — estado, NO degradación ──────────────────────────────────
  /**
   * Acceso a lo que es DEL USUARIO: bandeja de mensajes, notificaciones, guardados y
   * estudio. Un 401 en cualquiera de esas cuatro dice lo mismo —no hay sesión—, así que
   * un solo estado las cubre y evita cuatro round-trips para recibir cuatro veces el
   * mismo 401. NO es `degraded`: ahí no hay nada que degradar, hay que iniciar sesión.
   */
  readonly sessionAccess = signal<'ok' | 'anon'>('ok');
  /**
   * Acceso a la conversación ABIERTA (403 = el hilo es de otras dos personas). Es un
   * estado del detalle, no de la sesión: la bandeja propia sigue siendo legítima y se
   * mantiene a la vista; lo único que se cierra es el hilo ajeno.
   */
  readonly threadAccess = signal<'ok' | 'forbidden'>('ok');
  /**
   * "Al usuario acaban de negarle algo; enfoca el panel en cuanto exista." Latch de una sola
   * vez — no un `effect()` sobre `sessionAccess`, que correría en cada re-render con el panel
   * puesto y le robaría el foco al usuario mientras tabula dentro del propio panel.
   */
  readonly panelFocusPending = signal(false);

  // ─── Social session (optimistic UI source of truth) ─────────────────────────
  /** Actor keys the viewer follows. */
  readonly following = signal<ReadonlySet<string>>(new Set());
  /** Post ids the viewer bookmarked (guardados). */
  readonly savedIds = signal<ReadonlySet<string>>(new Set());

  /** La cara pública de quien lee, tal como la contesta `GET /me`; `null` hasta que contesta. */
  readonly #yo = signal<Author | null>(null);

  /**
   * Quién lee: lo dice la SESIÓN del host (CMS#197), no el editor.
   *
   *  - **Sin host** (standalone, tests): la identidad de muestra, como siempre.
   *  - **Con sesión**: el miembro, por su cara pública, la que contesta `GET /me` (012-blogs-social, I0). Su
   *    `actorKey` es su llave pública, la misma que el servidor pone en lo que publica, así que «esto es tuyo» casa
   *    con ella. **Nunca su correo**. Mientras `/me` no contesta, la llave y el handle van vacíos, y lo que los
   *    necesita no se ofrece.
   *  - **Con host y sin sesión**: `null`. No se inventa a nadie.
   */
  readonly viewer = computed<Author | null>(() => {
    if (!this.#identity.hasHost()) {
      return mockViewer();
    }
    const miembro = this.#identity.member();
    if (!miembro) {
      return null;
    }
    const yo = this.#yo();
    return {
      ...SIN_CIFRAS,
      actorKey: yo?.actorKey ?? '',
      handle: yo?.handle ?? '',
      displayName: yo?.displayName || miembro.displayName,
    };
  });

  /**
   * El autor de lo que esta pantalla pinta en local antes de que vuelva el del servidor (un
   * comentario, un mensaje, el avatar del compositor). Sin sesión, «Tú» sin cifras.
   */
  readonly autorLocal = computed<Author>(() => this.viewer() ?? { ...SIN_CIFRAS, displayName: this.#textos.quienLee });

  /** La navegación de la app, cuando el elemento la conectó. */
  get navegacion(): NavegacionDeLaRed | null {
    return this.#navegacion;
  }

  /** Los CustomEvents del elemento. */
  get eventos(): EventosDeLaRed {
    return this.#eventos;
  }

  /** Lo dice por la región `aria-live` compartida del design system. */
  anunciar(mensaje: string): void {
    this.#anunciar(mensaje);
  }

  /** El elemento conecta la red al montarse: sus entradas, su navegación, sus CustomEvents y su región viva. */
  conectar(conexion: ConexionDeLaRed): void {
    this.#fuentes.set({ apiBase: conexion.apiBase, scope: conexion.scope });
    this.#navegacion = conexion.navegacion;
    this.#eventos = conexion.eventos;
    this.#anunciar = conexion.anunciar;
  }

  readonly #parcheadores: ((id: string, patch: (post: Post) => Post) => void)[] = [];
  readonly #alPerderLaSesion: (() => void)[] = [];

  /** Un caso de uso que pinta publicaciones se apunta para recibir sus cambios. */
  alParchear(parcheador: (id: string, patch: (post: Post) => Post) => void): void {
    this.#parcheadores.push(parcheador);
  }

  /** Un caso de uso del usuario se apunta para vaciarse cuando el servidor dice que no hay sesión. */
  alPerderLaSesion(accion: () => void): void {
    this.#alPerderLaSesion.push(accion);
  }

  /** Apply the same patch to a post wherever it currently lives in state. */
  patchPost(id: string, patch: (post: Post) => Post): void {
    for (const parcheador of this.#parcheadores) {
      parcheador(id, patch);
    }
  }

  isFollowing(actorKey: string): boolean {
    return this.following().has(actorKey);
  }

  setFollowing(actorKey: string, value: boolean): void {
    this.following.update((current) => {
      const next = new Set(current);
      if (value) {
        next.add(actorKey);
      } else {
        next.delete(actorKey);
      }
      return next;
    });
  }

  /** Seed the follow set from the demo feed so follow buttons reflect a graph. */
  seedFollowingFromPosts(posts: readonly Post[]): void {
    if (this.following().size > 0) {
      return;
    }
    const seeded = new Set<string>();
    for (const post of posts) {
      if (post.reposted) {
        seeded.add(post.author.actorKey);
      }
    }
    if (seeded.size > 0) {
      this.following.set(seeded);
    }
  }

  isSaved(id: string): boolean {
    return this.savedIds().has(id);
  }

  /** La cara pública de quien lee, si hay sesión en el host. Sin ella no hay a quién preguntar. */
  async loadYo(): Promise<void> {
    if (!this.#identity.hasHost() || !this.#identity.member()) {
      return;
    }
    this.#yo.set(await this.#perfil.me(this.apiBase()));
  }

  /**
   * Traduce un 401 al estado que la UI sabe pintar: el panel "Inicia sesión" en las
   * cuatro superficies del usuario. Devuelve `true` si el error era ese, para que quien
   * llama corte ahí sin escribir un `errorMessage` que contradiga al panel.
   *
   * **Vacía TODO lo personal ya cargado**, no solo lo de la vista actual: si el usuario
   * abrió su bandeja con sesión y esta expiró, dejar los hilos en pantalla mientras el
   * panel pide iniciar sesión es la misma mentira, y los badges del nav seguirían
   * contando mensajes que ya no podemos leer. Cada caso de uso del usuario se marca
   * "cargado" para que navegar entre ellos no dispare tres 401 más.
   */
  handleUnauthenticated(error: unknown, announcement?: string): boolean {
    if (!isBlogsUnauthorized(error)) {
      return false;
    }
    this.sessionAccess.set('anon');
    this.errorMessage.set('');
    this.threadAccess.set('ok');
    this.savedIds.set(new Set());
    for (const accion of this.#alPerderLaSesion) {
      accion();
    }
    this.panelFocusPending.set(true);
    this.anunciar(announcement ?? this.#textos.sesionParaVer);
    return true;
  }
}
