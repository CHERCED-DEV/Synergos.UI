import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { CatalogoDeLaTienda, CompraDeLaTienda, ResenasDeLaTienda } from '@synergos/dominio/tienda';
import {
  type ReviewBlockedReason,
  type ReviewDraft,
  type ReviewEntry,
  ReviewPanelComponent,
  type ReviewPanelConfig,
  type ReviewSummary,
} from '@synergos/shells';

/** Las opiniones de un producto sobre SH-13, en la primera pestaña de la ficha (014-despiece-tienda, T010). */
@Component({
  selector: 'sg-tienda-ficha-opiniones',
  standalone: true,
  imports: [ReviewPanelComponent],
  templateUrl: './opiniones.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
})
export class TiendaFichaOpinionesComponent {
  protected readonly catalogo = inject(CatalogoDeLaTienda);
  protected readonly compra = inject(CompraDeLaTienda);
  protected readonly resenas = inject(ResenasDeLaTienda);

  /** Sin nota y sin texto no hay reseña que enviar. */
  // ─── SH-13 `syn-review-panel` (#28) ─────────────────────────────────────────
  //
  // El formulario a mano se va; la regla de negocio se queda tal cual, que es lo
  // que había que conservar: `canReview` lo decide el SERVIDOR y el 403 NO ofrece
  // volver a entrar (ADR 0112). Lo que gana la Tienda es que **la distribución por
  // fin se pinta**: `reviewSummary()` la calculaba desde siempre y ninguna
  // plantilla la usaba.
  readonly reviewPanel = viewChild(ReviewPanelComponent);

  readonly reviewPanelSummary = computed<ReviewSummary>(() => {
    const resumen = this.resenas.reviewSummary();
    // `distribution` viene de 5★ a 1★ (ya invertida); se le pone su estrella.
    const distribution = resumen.distribution.map((count, index) => ({
      stars: 5 - index,
      count,
    }));
    return { average: resumen.average, count: resumen.count, distribution };
  });

  readonly reviewEntries = computed<readonly ReviewEntry[]>(() =>
    (this.catalogo.detail()?.reviews ?? []).map((review) => ({
      id: review.id,
      author: review.author,
      rating: review.rating,
      title: review.title,
      body: review.body,
      date: review.date,
      // En la Tienda toda reseña publicada pasó el gate de compra: el servidor no
      // acepta otras. El sello dice eso, no lo adivina.
      verified: true,
    })),
  );

  /**
   * Por qué no puede reseñar, cuando no puede.
   *
   * Sin sesión es `unauthenticated` —volver a entrar SÍ lo arregla—; con sesión es
   * `not-consumer`, y ese mensaje no ofrece login porque la sesión no es el
   * problema y sugerirlo manda al comprador a dar vueltas (ADR 0112).
   */
  readonly reviewBlockedReason = computed<ReviewBlockedReason | null>(() => {
    if (this.resenas.canReview() || !this.catalogo.detail()) {
      return null;
    }
    return this.compra.isAuthenticated() ? 'not-consumer' : 'unauthenticated';
  });

  readonly reviewPanelConfig = computed<ReviewPanelConfig>(() => ({
    heading: 'Opiniones',
    countLabel: 'opiniones',
    formTitle: 'Cuenta tu experiencia',
    submitLabel: 'Publicar opinión',
    verifiedLabel: 'Compra verificada',
    blockedNotConsumer:
      'Solo quien compró este producto puede opinar sobre él.',
    emptyMessage: 'Todavía no hay opiniones de este producto.',
  }));

  readonly submitReview = (draft: ReviewDraft): Promise<void> =>
    this.resenas.submitReview(draft, () => this.reviewPanel()?.reset());
}
