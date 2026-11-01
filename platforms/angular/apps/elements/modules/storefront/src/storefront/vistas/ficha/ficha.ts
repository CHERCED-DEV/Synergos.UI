import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, viewChild } from '@angular/core';
import {
  AvisosDeLaTienda,
  CarritoDeLaTienda,
  CatalogoDeLaTienda,
  CompraDeLaTienda,
  DeseosDeLaTienda,
  ResenasDeLaTienda,
} from '@synergos/dominio/tienda';
import {
  ButtonComponent,
  IconButtonComponent,
  IconComponent,
  LinkComponent,
  SynErrorStateComponent,
  SynSkeletonComponent,
} from '@synergos/shared';
import {
  type DetailMedia,
  DetailShellComponent,
  type DetailSpec,
  type ReviewBlockedReason,
  type ReviewDraft,
  type ReviewEntry,
  ReviewPanelComponent,
  type ReviewPanelConfig,
  type ReviewSummary,
} from '@synergos/shells';
import { NavegacionDeLaTienda } from '../../estado/navegacion';
import { CONDITION_LABELS, PresentacionDeLaTienda } from '../../estado/presentacion';

/** La ficha de un producto sobre SH-2: la galería, la compra con su variante y su cantidad, y las opiniones. */
@Component({
  selector: 'sg-tienda-ficha',
  standalone: true,
  imports: [DetailShellComponent, ReviewPanelComponent, SynSkeletonComponent, SynErrorStateComponent, ButtonComponent, IconButtonComponent, IconComponent, LinkComponent],
  templateUrl: './ficha.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-rating-stars> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TiendaFichaComponent {
  protected readonly avisos = inject(AvisosDeLaTienda);
  protected readonly carrito = inject(CarritoDeLaTienda);
  protected readonly catalogo = inject(CatalogoDeLaTienda);
  protected readonly compra = inject(CompraDeLaTienda);
  protected readonly deseos = inject(DeseosDeLaTienda);
  protected readonly navegacion = inject(NavegacionDeLaTienda);
  protected readonly presentacion = inject(PresentacionDeLaTienda);
  protected readonly resenas = inject(ResenasDeLaTienda);

  readonly pdpMedia = computed<readonly DetailMedia[]>(() => {
    const detail = this.catalogo.detail();
    if (!detail) {
      return [];
    }
    return detail.product.images.map((url) => ({ url, alt: detail.product.title }));
  });

  readonly pdpEyebrow = computed(() => {
    const product = this.catalogo.detail()?.product;
    if (!product) {
      return '';
    }
    return `${CONDITION_LABELS[product.condition]} · ${product.brand}`;
  });

  readonly pdpSpecs = computed<readonly DetailSpec[]>(() => {
    const detail = this.catalogo.detail();
    if (!detail) {
      return [];
    }
    const product = detail.product;
    const specs: DetailSpec[] = [
      { label: 'Marca', value: product.brand || '—' },
      { label: 'Categoría', value: product.category || '—' },
      { label: 'Condición', value: CONDITION_LABELS[product.condition] },
      { label: 'Envío', value: product.freeShipping ? 'Gratis a todo el país' : 'Con costo' },
    ];
    if (product.seller) {
      specs.push({ label: 'Vendido por', value: product.seller });
    }
    const variant = this.catalogo.selectedVariant();
    if (variant) {
      for (const [key, value] of Object.entries(variant.attributes)) {
        specs.push({ label: key, value });
      }
    }
    return specs;
  });

  readonly pdpPriceLabel = computed(() => {
    const detail = this.catalogo.detail();
    if (!detail) {
      return '';
    }
    const variant = this.catalogo.selectedVariant();
    const amount = variant ? variant.amount : detail.product.amount;
    return this.carrito.formatPrice(amount, detail.product.currency || this.catalogo.currency());
  });

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
