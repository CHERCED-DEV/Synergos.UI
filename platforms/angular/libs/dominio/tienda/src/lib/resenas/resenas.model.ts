/** Las reseñas de quien compró: lo que escribe y lo que contesta el servidor (014-despiece-tienda, T008). */

/** Lo que el comprador escribe. El autor NO va aquí: lo pone el servidor desde la sesión. */
export interface ReviewSubmission {
  readonly rating: number;
  readonly title: string;
  readonly body: string;
}

/**
 * Resultado del envío de una reseña.
 *
 * Es un resultado TIPADO y no una excepción a secas, y no degrada a mock por diseño:
 * fingir una escritura que no ocurrió es peor que el error (ADR 0112). El motivo viaja
 * para que la UI diga la verdad — un 403 no se arregla volviendo a entrar, así que no
 * puede ofrecer login.
 */
export type ReviewSubmitResult =
  | {
      readonly ok: true;
      /**
       * Quedó ENCOLADA para revisión, no publicada (#31).
       *
       * Sale de un `202 Accepted`, y por eso el campo existe: `response.ok` es
       * cierto para todo 2xx, así que sin distinguirlos el acuse decía «ya está
       * publicada» **y recargaba la ficha** — quien escribió veía la confirmación
       * y una lista donde su reseña no estaba. El defecto #26 con la prueba de la
       * mentira en la misma pantalla.
       */
      readonly pending: boolean;
    }
  | { readonly ok: false; readonly reason: 'unauthenticated' | 'not-buyer' | 'invalid' | 'failed' };

/**
 * Resultado de reportar una reseña (#31).
 *
 * `already-reported` NO es un error de quien reporta: el servidor deduplica y la
 * respuesta honesta es «ya lo habíamos recibido», no «falló».
 */
export type ReviewReportResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'unauthenticated' | 'already-reported' | 'not-found' | 'failed';
    };
