// Los errores de los adaptadores de Blogs y lo que devuelve publicar (012-blogs-social, I2: eran del cliente único).
import type { Post } from './blogs.model';

/**
 * El backend exige sesión para esta ruta. NO es una degradación: es un hueco de
 * identidad, y la UI debe ofrecer iniciar sesión en vez de inventar datos del usuario.
 */
export class BlogsUnauthorizedError extends Error {
  constructor(readonly url: string) {
    super(`HTTP 401 ${url}`);
    this.name = 'BlogsUnauthorizedError';
  }
}

/**
 * `instanceof` no es fiable cruzando bundles (la clase puede venir de otra copia del
 * módulo), así que se discrimina por `name` — el mismo motivo por el que el runtime
 * comparte `sg-core.js` en vez de duplicarlo.
 */
export function isBlogsUnauthorized(error: unknown): error is BlogsUnauthorizedError {
  return error instanceof Error && error.name === 'BlogsUnauthorizedError';
}

/**
 * El backend respondió 403: hay sesión, pero el recurso NO es del viewer — hoy solo lo
 * lanza `GET /thread/{id}` cuando la conversación es de otras dos personas. A diferencia
 * del 401, volver a iniciar sesión NO ayuda: no es un hueco de identidad, es que esa
 * conversación no le pertenece. Por eso viaja distinto y la UI lo dice con esas palabras.
 */
export class BlogsForbiddenError extends Error {
  constructor(readonly url: string) {
    super(`HTTP 403 ${url}`);
    this.name = 'BlogsForbiddenError';
  }
}

/** Discriminado por `name`, no `instanceof` (no cruza bundles). */
export function isBlogsForbidden(error: unknown): error is BlogsForbiddenError {
  return error instanceof Error && error.name === 'BlogsForbiddenError';
}

/**
 * Lo que devuelve publicar: el post **y si el servidor lo aceptó**.
 *
 * Existe porque devolver sólo el `Post` hacía indistinguible «publicado» de
 * «fabricado en local porque el POST falló», y quien llamaba trataba las dos
 * cosas igual (#26). Un post sin guardar sigue viniendo —el modo demo necesita
 * algo que mostrar— pero marcado.
 */
export interface PublishOutcome {
  readonly post: Post;
  /** `false` = síntesis local; el servidor NO lo tiene. */
  readonly persisted: boolean;
}

/**
 * Una ESCRITURA que no quedó en el servidor. **Lanza; no devuelve nada que parezca un
 * acuse** (UI#92). El gemelo de `EhrWriteFailedError` (#111). **No enciende `degraded`**:
 * ese cartel dice «estás viendo datos de ejemplo», y aquí no hay ejemplo que enseñar.
 */
export class BlogsWriteFailedError extends Error {
  constructor(
    readonly endpoint: string,
    override readonly cause: unknown,
  ) {
    super(`Blogs write "${endpoint}" did not reach the server.`);
    this.name = 'BlogsWriteFailedError';
  }
}
