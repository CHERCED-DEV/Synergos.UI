import { Injectable } from '@angular/core';
import { llamarAlBorde } from '@synergos/core';
import type { ReviewReportResult, ReviewSubmission, ReviewSubmitResult } from './resenas.model';

/** Las reseñas de quien compró: escribir una y reportar otra (#31). Escrituras: ninguna degrada. */
@Injectable({ providedIn: 'root' })
export class ResenasApi {
  // ─── Reseñas (T10 Ola B) ─────────────────────────────────────────────────────

  /**
   * Envía la reseña de un producto. Devuelve un resultado TIPADO.
   *
   * **No degrada a mock, y es la diferencia que importa.** Las LECTURAS de la tienda caen a
   * datos de ejemplo cuando el backend falla, y para una lectura es aceptable. Para una
   * ESCRITURA sería fingir que se guardó algo que no se guardó — el fallo exacto que ADR 0112
   * documenta en `gov.mockDecide`, donde la UI anunciaba una decisión que nunca se registró
   * (retirado en UI#92, con las otras escrituras que fabricaban su acuse).
   *
   * El motivo se lee del STATUS, no de `error.name` ni de `instanceof`: aquel depende de que
   * alguien recuerde tipar el error, y este último ni siquiera cruza bundles.
   */
  async submitReview(
    apiBase: string,
    sku: string,
    submission: ReviewSubmission,
  ): Promise<ReviewSubmitResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }

    const url = `${apiBase}/products/${encodeURIComponent(sku)}/reviews`;
    try {
      const response = await llamarAlBorde(apiBase, url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: submission.rating,
          title: submission.title,
          body: submission.body,
        }),
      });

      if (response.ok) {
        // **202 no es 201.** `response.ok` es cierto para TODO 2xx, así que un borde
        // que encola para revisión se leía como publicación y el acuse mentía (#31).
        return { ok: true, pending: response.status === 202 };
      }
      switch (response.status) {
        case 401:
          return { ok: false, reason: 'unauthenticated' };
        case 403:
          return { ok: false, reason: 'not-buyer' };
        case 400:
          return { ok: false, reason: 'invalid' };
        default:
          return { ok: false, reason: 'failed' };
      }
    } catch {
      // Red caída. NO es lo mismo que "no puedes reseñar": el mensaje debe invitar a
      // reintentar, no acusar al comprador.
      return { ok: false, reason: 'failed' };
    }
  }

  /**
   * Reporta una reseña (#31).
   *
   * **No degrada a mock ni a éxito silencioso.** Un «gracias por avisar» que no
   * salió de la máquina es la regla 4 de `CLAUDE.md` sobre la escritura que más
   * confianza pide: quien reporta está diciendo que algo está mal y espera que
   * alguien lo mire.
   */
  async reportReview(apiBase: string, reviewId: string): Promise<ReviewReportResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }
    const url = `${apiBase}/reviews/${encodeURIComponent(reviewId)}/reports`;
    try {
      const response = await llamarAlBorde(apiBase, url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        return { ok: true };
      }
      switch (response.status) {
        case 401:
          return { ok: false, reason: 'unauthenticated' };
        // El servidor deduplica por (reseña, quien reporta). No es un fallo.
        case 409:
          return { ok: false, reason: 'already-reported' };
        case 404:
          return { ok: false, reason: 'not-found' };
        default:
          return { ok: false, reason: 'failed' };
      }
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }
}
