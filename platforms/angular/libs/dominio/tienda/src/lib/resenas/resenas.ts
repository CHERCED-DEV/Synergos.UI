import { Injectable, computed, inject, signal } from '@angular/core';
import { HostIdentityService } from '@synergos/core';
import { CatalogoDeLaTienda } from '../catalogo/catalogo';
import { ConfiguracionDeLaTienda } from '../comun/configuracion';
import { TEXTOS_DE_LA_TIENDA } from '../comun/textos';
import { ResenasApi } from './resenas-api.client';
import type { ReviewSubmission } from './resenas.model';

/**
 * Las reseñas de la ficha abierta (014-despiece-tienda, T008): escribir una, reportar otra, y lo que se le dice a
 * quien lo hizo.
 *
 * El formulario solo existe si el SERVIDOR dice que este visitante puede reseñar (`detail.canReview`: autenticado +
 * orden pagada de este producto). No se deduce aquí: deducirlo sería ofrecer un formulario que rebota con 403.
 */
@Injectable()
export class ResenasDeLaTienda {
  readonly #api = inject(ResenasApi);
  readonly #config = inject(ConfiguracionDeLaTienda);
  readonly #catalogo = inject(CatalogoDeLaTienda);
  readonly #identity = inject(HostIdentityService);
  readonly #textos = inject(TEXTOS_DE_LA_TIENDA);

  readonly reviewSending = signal(false);
  /** Mensaje al comprador tras enviar. Vacío = no se ha enviado nada aún. */
  readonly reviewNotice = signal('');
  readonly reviewFailed = signal(false);

  readonly canReview = computed(() => this.#catalogo.detail()?.canReview === true);

  readonly reviewSummary = computed(() => {
    const reviews = this.#catalogo.detail()?.reviews ?? [];
    if (reviews.length === 0) {
      return { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
    }
    const distribution = [0, 0, 0, 0, 0];
    let total = 0;
    for (const review of reviews) {
      const star = Math.min(5, Math.max(1, Math.round(review.rating)));
      distribution[star - 1] += 1;
      total += review.rating;
    }
    return {
      average: Math.round((total / reviews.length) * 10) / 10,
      count: reviews.length,
      distribution: distribution.reverse(),
    };
  });

  /**
   * Publica la opinión. El borrador llega de SH-13 (#28); la regla de negocio no
   * cambió ni una línea — sólo el sitio desde donde llega el texto.
   *
   * `limpiar` lo pone quien pinta el formulario: la pieza NO se limpia sola al enviar, y sólo aquí se sabe que el
   * servidor aceptó.
   */
  async submitReview(draft: ReviewSubmission, limpiar: () => void): Promise<void> {
    const product = this.#catalogo.detail()?.product;
    if (!product || this.reviewSending()) {
      return;
    }

    this.reviewSending.set(true);
    this.reviewNotice.set('');
    this.reviewFailed.set(false);

    const result = await this.#api.submitReview(this.#config.apiBase(), product.id, {
      rating: draft.rating,
      title: draft.title,
      body: draft.body,
    });

    this.reviewSending.set(false);

    if (result.ok) {
      // La pieza NO se limpia sola al enviar, a propósito: sólo acá se sabe que el
      // servidor aceptó. Borrar antes sería el defecto #26 con otro disfraz. Y se
      // limpia en LOS DOS casos: encolada también es aceptada, y dejar el texto
      // puesto invita a mandarlo otra vez.
      limpiar();

      if (result.pending) {
        // **Ni «publicada» ni recarga** (#31). Recargar traería una lista donde la
        // reseña no está, o sea la prueba de que el acuse miente, en la misma
        // pantalla y en el mismo segundo.
        this.reviewNotice.set(this.#textos.resenaEnRevision);
        return;
      }

      this.reviewNotice.set(this.#textos.resenaPublicada);
      // Se recarga la ficha para que la nota y la lista salgan del SERVIDOR y no de una
      // suposición del cliente: si el envío editó una reseña previa, el conteo NO sube.
      await this.#catalogo.loadProduct(product.id);
      return;
    }

    this.reviewFailed.set(true);
    // Cada motivo dice la verdad. En particular el 403 NO ofrece volver a entrar: la sesión
    // no es el problema, y sugerirlo manda al comprador a dar vueltas (ADR 0112).
    switch (result.reason) {
      case 'unauthenticated':
        this.reviewNotice.set(this.#textos.resenaSinSesion);
        break;
      case 'not-buyer':
        this.reviewNotice.set(this.#textos.resenaNoCompraste);
        break;
      case 'invalid':
        this.reviewNotice.set(this.#textos.resenaInvalida);
        break;
      default:
        this.reviewNotice.set(this.#textos.resenaCaida);
    }
  }

  // ─── Reportar una reseña (#31) ───────────────────────────────────────────────
  //
  // `Api.Moderation` lleva meses construida con un campo `Reporter` y CERO
  // consumidores. Esto es el primero por el lado de quien lee.
  readonly reportedReviewIds = signal<readonly string[]>([]);
  readonly reportingReviewId = signal<string | null>(null);

  /**
   * **Quien no tiene sesión no reporta.** Un reporte anónimo no se puede atender
   * —no hay a quién volver— ni deduplicar, así que ofrecer el botón sería ofrecer
   * uno que va a rebotar con 401: el mismo criterio de `canReview` (ADR 0112).
   */
  readonly canReportReview = computed(() => this.#identity.isAuthenticated());

  async reportReview(reviewId: string): Promise<void> {
    if (this.reportingReviewId() !== null || this.reportedReviewIds().includes(reviewId)) {
      return;
    }
    this.reportingReviewId.set(reviewId);
    this.reviewFailed.set(false);

    const result = await this.#api.reportReview(this.#config.apiBase(), reviewId);
    this.reportingReviewId.set(null);

    // `already-reported` se trata como éxito a propósito: el servidor deduplica, así
    // que «ya lo habíamos recibido» es exactamente lo que la persona necesita saber
    // y decirle «falló» la haría reintentar algo que ya está hecho.
    if (result.ok || result.reason === 'already-reported') {
      this.reportedReviewIds.update((ids) => [...ids, reviewId]);
      this.reviewNotice.set(this.#textos.reporteRecibido);
      return;
    }

    this.reviewFailed.set(true);
    this.reviewNotice.set(
      result.reason === 'unauthenticated' ? this.#textos.reporteSinSesion : this.#textos.reporteCaido,
    );
  }
}
