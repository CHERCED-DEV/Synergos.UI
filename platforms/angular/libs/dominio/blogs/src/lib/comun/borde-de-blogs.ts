import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  BlogsForbiddenError,
  BlogsUnauthorizedError,
  BlogsWriteFailedError,
  isBlogsForbidden,
  isBlogsUnauthorized,
} from './errores';

/**
 * Lo que comparten los adaptadores de Blogs (012-blogs-social, I2): el transporte, con los estados de sesión
 * tipados; si alguna LECTURA cayó a su muestra —el cartel de «datos de ejemplo»—, y qué se dice en el log de cada
 * caída. Era el estado privado del cliente único (`BlogsApiClient`), y sigue siendo uno por app.
 *
 * Thin HTTP client over the Blogs (red social) backend contract — provided by the
 * backend agent in parallel. Programs against the app-spec endpoints:
 *
 *  - `GET  /api/blogs/feed?scope=foryou|following&cursor=`  → `{ posts, nextCursor }`
 *  - `GET  /api/blogs/post/{id}`                            → `{ post, comments }`
 *  - `POST /api/blogs/post` `{ body, mediaUrl? }`           → `{ post }`
 *  - `POST /api/blogs/post/{id}/react` `{ type }`           → `{ reactions }`
 *  - `POST /api/blogs/follow/{authorId}`                    → `{ following }`
 *  - `GET  /api/blogs/profile/{handle}`                     → `{ author, posts, stats }`
 *
 * **Graceful degradation:** if an endpoint is not yet wired (network error / non-OK),
 * the client falls back to visible **mock data** and logs a `TODO`, so the whole UI
 * flow is complete end-to-end before the backend lands. A **core content** mock path
 * (feed/post/profile/search) flips the `degraded` flag so the shell surfaces a
 * "datos de ejemplo" notice. **Auxiliary** widgets (e.g. the trending sidebar)
 * degrade *silently* — their absence must not brand the whole shell as offline
 * while the primary content is real.
 *
 * **Las ESCRITURAS no degradan** (UI#92, reglas 4, 18 y 19). Publicar ya decía si se
 * GUARDÓ (`persisted`, #26); reaccionar, seguir y mandar un DM devolvían lo que el llamador
 * les había pasado como `optimistic` —la fabricación escrita en la firma— o una burbuja
 * sintetizada «enviada». Hoy LANZAN {@link BlogsWriteFailedError} y quien llama revierte lo
 * que pintó en optimista, o deja el mensaje marcado.
 *
 * **Lo del usuario NO degrada, y es deliberado.** La bandeja de mensajes, las
 * notificaciones, los guardados y el estudio son del member de la SESIÓN: su identidad
 * la resuelve el servidor desde la cookie, no un `?user=<handle>` que cualquiera podía
 * teclear (ese era el IDOR). Un 401 ahí no significa "el backend no está" — significa
 * "no hay sesión", y taparlo con mock le pintaría al anónimo una bandeja de DMs
 * SEMBRADA como si fuera la suya. Por eso viaja como {@link BlogsUnauthorizedError}
 * hasta la UI, que pide iniciar sesión. Un 403 en `/thread/{id}` (conversación ajena)
 * viaja como {@link BlogsForbiddenError}: mostrar OTRA conversación sería la mentira.
 *
 * La cookie viaja sola: `fetch` manda credenciales same-origin por defecto y la app se
 * monta dentro de la propia página del CMS. No se fuerza `credentials: 'include'`
 * —mandaría la cookie a orígenes ajenos si `apiBase` fuera absoluto.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */
@Injectable({ providedIn: 'root' })
export class BordeDeBlogs {
  readonly #logger = inject(LoggerService);

  /** Set to `true` after any mock fallback so the UI can flag example data. */
  #degraded = false;

  get degraded(): boolean {
    return this.#degraded;
  }

  /** Un aviso en el log, sin marcar nada: lo que no tiene muestra ni es una escritura. */
  warn(message: string, error: unknown): void {
    this.#logger.warn(message, error);
  }

  // ─── HTTP helpers ────────────────────────────────────────────────────────────

  getJson(apiBase: string, url: string): Promise<unknown> {
    return this.request(apiBase, url, { method: 'GET' });
  }

  postJson(apiBase: string, url: string, body: unknown): Promise<unknown> {
    return this.request(apiBase, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private request(apiBase: string, url: string, init: RequestInit): Promise<unknown> {
    return this.send(apiBase, url, init).then((response) => response.json());
  }

  /**
   * El transporte crudo: mapea los estados de sesión a errores tipados y devuelve la
   * `Response` SIN leer el cuerpo. `request()` la parsea; las mutaciones que no
   * devuelven nada útil (`POST`/`DELETE /saved`) NO — un `204 No Content` legítimo
   * revienta en `.json()`, y ese falso fallo revertiría un guardado que sí quedó.
   *
   * Sin `apiBase` no se llama a nada —ni a una ruta del propio sitio, que podría ser de otra
   * cosa—: la base es configuración del despliegue (ADR 0137) y no hay una de respaldo
   * compilada. Se rechaza y cada llamada degrada como ante cualquier caída.
   */
  send(apiBase: string, url: string, init: RequestInit): Promise<Response> {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch-unavailable'));
    }
    if (!apiBase) {
      return Promise.reject(new Error('sin-api'));
    }
    return fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    }).then((response) => {
      if (response.status === 401) {
        // Antes caía en el `catch` genérico y se degradaba a mock: el anónimo veía una
        // bandeja de DMs sembrada como si fuera la suya, en vez de un "inicia sesión".
        return Promise.reject(new BlogsUnauthorizedError(url));
      }
      if (response.status === 403) {
        // Autenticado, pero el recurso es de otro (conversación ajena). Taparlo con mock
        // le mostraría OTRA conversación — la mentira exacta que esto viene a cerrar.
        return Promise.reject(new BlogsForbiddenError(url));
      }
      return response.ok ? response : Promise.reject(new Error(`HTTP ${response.status}`));
    });
  }

  /**
   * Re-lanza un 401/403 (los que la UI trata como estado de sesión, no como caída).
   * Lo llaman SOLO las rutas del usuario; las públicas (feed/post/reaccionar/seguir)
   * siguen degradando a mock, que en una LECTURA no le miente a nadie: se ve
   * contenido de ejemplo y el cartel lo dice.
   *
   * **Publicar NO está en esa lista, aunque antes lo estuviera** (#26). Degradar
   * una ESCRITURA a mock sí miente, y del peor modo: le dice a quien escribió que
   * su texto está guardado cuando el servidor no tiene nada. Esas dos rutas no
   * relanzan —el modo demo se quedaría sin flujo de publicación— sino que
   * devuelven `persisted: false`, y el llamador se encarga.
   */
  rethrowIfAuthError(error: unknown): void {
    if (isBlogsUnauthorized(error) || isBlogsForbidden(error)) {
      throw error;
    }
  }

  /**
   * Flag a mock fallback. `core` content flips the user-facing `degraded` banner;
   * `auxiliary` widgets (trending sidebar) only log, so a still-unwired auxiliary
   * endpoint never brands the shell as offline while the primary content is real.
   */
  markDegraded(
    endpoint: string,
    error: unknown,
    severity: 'core' | 'auxiliary' = 'core',
  ): void {
    if (severity === 'core') {
      this.#degraded = true;
    }
    // TODO(backend): remove the mock fallback once the Blogs API responds.
    this.#logger.warn(`Blogs API "${endpoint}" unavailable — using mock data.`, error);
  }

  /**
   * Una ESCRITURA que no llegó. **No marca `degraded` y no devuelve nada**: el cartel de
   * «datos de ejemplo» es de las LECTURAS, y aquí no hay ejemplo que enseñar.
   */
  writeFailed(endpoint: string, error: unknown): never {
    this.#logger.warn(`Blogs API "${endpoint}" unavailable — nothing was saved.`, error);
    throw new BlogsWriteFailedError(endpoint, error);
  }
}
