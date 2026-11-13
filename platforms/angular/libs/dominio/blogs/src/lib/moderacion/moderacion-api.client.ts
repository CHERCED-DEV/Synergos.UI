import { Injectable, inject } from '@angular/core';
import { esRegistro, leerNumero, leerTexto } from '@synergos/core';
import { BordeDeBlogs } from '../comun/borde-de-blogs';
import { isBlogsNotFound } from '../comun/errores';
import { paginaSegura } from '../comun/lecturas-de-blogs';
import type { CasoDeModeracion, DecisionDeModeracion, ObjetivoDeLaDenuncia } from './moderacion.model';

/**
 * La moderación genérica del CMS (`{moderacionBase}`, 012-blogs-social, I5): denunciar, la cola y decidir.
 *
 * **Nada degrada a una muestra.** Una denuncia que no llegó no se da por enviada, una cola que no cargó no se pinta
 * vacía como si no hubiera nada, y una decisión que no quedó no saca el caso de la cola.
 */
@Injectable({ providedIn: 'root' })
export class ModeracionApi {
  readonly #borde: BordeDeBlogs = inject(BordeDeBlogs);

  /**
   * `POST {base}/denuncias` `{ tipo, id, motivo }`.
   *
   * @throws {BlogsUnauthorizedError} sin sesión.
   * @throws {BlogsNotFoundError} si lo denunciado ya no está.
   * @throws {BlogsWriteFailedError} si el borde no la recibió.
   */
  async denunciar(apiBase: string, objetivo: ObjetivoDeLaDenuncia, motivo: string): Promise<void> {
    const url = `${apiBase}/denuncias`;
    try {
      await this.#borde.postJson(apiBase, url, { tipo: objetivo.tipo, id: objetivo.id, motivo });
    } catch (error) {
      this.#borde.rethrowIfAuthError(error);
      if (isBlogsNotFound(error)) {
        throw error;
      }
      this.#borde.writeFailed('POST /api/moderacion/denuncias', error);
    }
  }

  /**
   * `GET {base}/cola` — los casos abiertos.
   *
   * @throws {BlogsUnauthorizedError} sin sesión.
   * @throws {BlogsForbiddenError} sin un rol que modere.
   */
  async cola(apiBase: string): Promise<readonly CasoDeModeracion[]> {
    const url = `${apiBase}/cola`;
    const casos = leerCola(await this.#borde.getJson(apiBase, url));
    if (!casos) {
      throw new Error('cola-shape');
    }
    return casos;
  }

  /**
   * `POST {base}/casos/{id}/decision` `{ decision, motivo }`. Pedir otra vez la misma decisión reintenta retirar.
   *
   * @throws {BlogsUnauthorizedError} sin sesión.
   * @throws {BlogsForbiddenError} sin un rol que modere.
   * @throws {BlogsWriteFailedError} si la decisión no quedó, o quedó y no se pudo retirar.
   */
  async decidir(apiBase: string, caso: string, decision: DecisionDeModeracion, motivo: string): Promise<void> {
    const url = `${apiBase}/casos/${encodeURIComponent(caso)}/decision`;
    try {
      await this.#borde.postJson(apiBase, url, { decision, motivo });
    } catch (error) {
      this.#borde.rethrowIfAuthError(error);
      this.#borde.writeFailed('POST /api/moderacion/casos/{id}/decision', error);
    }
  }
}

/** La cola, o `null` si la respuesta no lo es. Un caso sin id o sin resumen no se puede decidir. */
function leerCola(value: unknown): readonly CasoDeModeracion[] | null {
  if (!esRegistro(value) || !Array.isArray(value['casos'])) {
    return null;
  }
  return value['casos']
    .map((entrada): CasoDeModeracion | null => {
      if (!esRegistro(entrada)) {
        return null;
      }
      const id = leerTexto(entrada['id']).trim();
      const resumen = leerTexto(entrada['resumen']).trim();
      if (!id || !resumen) {
        return null;
      }
      // Una ruta del sitio o una URL http(s), como la página de un artículo: lo demás no se enlaza.
      const enlace = paginaSegura(leerTexto(entrada['enlace']));
      return {
        id,
        tipo: leerTexto(entrada['tipo']).trim(),
        objetivoId: leerTexto(entrada['objetivoId']).trim(),
        resumen,
        ...(enlace ? { enlace } : {}),
        motivo: leerTexto(entrada['motivo']).trim(),
        denuncias: Math.max(1, Math.trunc(leerNumero(entrada['denuncias']))),
        denunciado: leerTexto(entrada['denunciado']).trim(),
      };
    })
    .filter((caso): caso is CasoDeModeracion => caso !== null);
}
