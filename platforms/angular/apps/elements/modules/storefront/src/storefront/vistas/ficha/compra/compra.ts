import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CarritoDeLaTienda, CatalogoDeLaTienda, DeseosDeLaTienda } from '@synergos/dominio/tienda';
import { ButtonComponent, IconButtonComponent, IconComponent } from '@synergos/shared';

/**
 * La compra en la ficha, en la ranura de SH-2 (014-despiece-tienda, T010): el precio, la variante y la cantidad,
 * agregar al carrito y guardar en favoritos.
 */
@Component({
  selector: 'sg-tienda-ficha-compra',
  standalone: true,
  imports: [ButtonComponent, IconButtonComponent, IconComponent],
  templateUrl: './compra.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
})
export class TiendaFichaCompraComponent {
  protected readonly carrito = inject(CarritoDeLaTienda);
  protected readonly catalogo = inject(CatalogoDeLaTienda);
  protected readonly deseos = inject(DeseosDeLaTienda);

  readonly pdpPriceLabel = computed(() => {
    const detail = this.catalogo.detail();
    if (!detail) {
      return '';
    }
    const variant = this.catalogo.selectedVariant();
    const amount = variant ? variant.amount : detail.product.amount;
    return this.carrito.formatPrice(amount, detail.product.currency || this.catalogo.currency());
  });
}
