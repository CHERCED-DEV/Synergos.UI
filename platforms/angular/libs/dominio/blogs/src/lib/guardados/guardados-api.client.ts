import { Injectable, inject } from '@angular/core';
import { esRegistro as isRecord, leerColeccionDelMiembro } from '@synergos/core';
import { BordeDeBlogs } from '../comun/borde-de-blogs';
import type { Post } from '../comun/blogs.model';
import { buildMockSaved } from '../comun/blogs.mock';
import { postDelCatalogo } from '../comun/lecturas-de-blogs';
import { normalizePost } from '../contenido/contenido-api.client';

/** La colección de `IUserCollection` donde viven los guardados de la red. */
const COLECCION_DE_GUARDADOS = 'saved';

/** Lo que guarda quien lee (012-blogs-social, I2). */
@Injectable({ providedIn: 'root' })
export class GuardadosApi {
  readonly #borde: BordeDeBlogs = inject(BordeDeBlogs);

  // ─── Guardados / listas ──────────────────────────────────────────────────────

  /**
   * `GET /api/blogs/saved` — the viewer's bookmarked posts. Sin `?user=`: esa era la
   * misma llave que abría la lista de guardados de cualquiera.
   *
   * Con `lecturasBase`, la colección genérica `saved` (`GET {lecturasBase}/colecciones/saved`, 012-blogs-social, I4),
   * con cada publicación del catálogo de la red; lo que ya no está no se pinta, como en la interina.
   *
   * @throws {BlogsUnauthorizedError} si no hay sesión.
   */
  async saved(apiBase: string, lecturasBase = ''): Promise<readonly Post[]> {
    if (lecturasBase) {
      return this.#coleccion(lecturasBase);
    }
    const url = `${apiBase}/saved`;
    try {
      const data = await this.#borde.getJson(apiBase, url);
      const rawPosts = Array.isArray(data)
        ? data
        : isRecord(data) && Array.isArray(data['posts'])
          ? data['posts']
          : null;
      if (rawPosts) {
        return rawPosts.map(normalizePost).filter((post): post is Post => post !== null);
      }
      throw new Error('saved-shape');
    } catch (error) {
      this.#borde.rethrowIfAuthError(error);
      this.#borde.markDegraded('GET /api/blogs/saved', error);
      return buildMockSaved();
    }
  }

  async #coleccion(lecturasBase: string): Promise<readonly Post[]> {
    try {
      const coleccion = leerColeccionDelMiembro(
        await this.#borde.getJson(lecturasBase, `${lecturasBase}/colecciones/${COLECCION_DE_GUARDADOS}`),
      );
      if (coleccion) {
        return coleccion.elementos
          .map((guardado) => (guardado.elemento ? postDelCatalogo(guardado.elemento) : null))
          .filter((post): post is Post => post !== null);
      }
      throw new Error('coleccion-shape');
    } catch (error) {
      this.#borde.rethrowIfAuthError(error);
      this.#borde.markDegraded('GET /api/lecturas/{vertical}/colecciones/{coleccion}', error);
      return buildMockSaved();
    }
  }

  /**
   * `POST /api/blogs/saved` `{ postId }` (guardar) / `DELETE /api/blogs/saved?postId=`
   * (quitar) — persiste el marcador del member de la SESIÓN.
   *
   * **No degrada a mock, y ese es el punto.** El resto de rutas públicas se cae al mock
   * porque enseñar un feed de ejemplo no le miente a nadie; aquí sí: tragarse el fallo
   * dejaría el marcador encendido en pantalla sobre algo que no se guardó, y el usuario
   * lo descubriría al recargar. El error sube para que la UI DESHAGA lo que pintó.
   *
   * @throws {BlogsUnauthorizedError} si no hay sesión.
   */
  async setSaved(apiBase: string, postId: string, saved: boolean): Promise<void> {
    const url = saved
      ? `${apiBase}/saved`
      : `${apiBase}/saved?postId=${encodeURIComponent(postId)}`;
    try {
      await (saved
        ? this.#borde.send(apiBase, url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId }),
          })
        : this.#borde.send(apiBase, url, { method: 'DELETE' }));
    } catch (error) {
      this.#borde.warn(
        `Blogs API "${saved ? 'POST' : 'DELETE'} /api/blogs/saved" falló — el marcador se revierte.`,
        error,
      );
      throw error;
    }
  }
}
