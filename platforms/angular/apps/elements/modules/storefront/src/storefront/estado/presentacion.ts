import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import {
  CarritoDeLaTienda,
  CatalogoDeLaTienda,
  ConfiguracionDeLaTienda,
  diaDeLaTienda,
  etiquetaDelMotivo,
  type ProductCondition,
  type ReturnCase,
  type ShopOrder,
  type ShopProduct,
  type WishlistEntry,
} from '@synergos/dominio/tienda';
import { monogram as monogramOf, type StatusTagTone } from '@synergos/shared';
import { type SessionItem } from '@synergos/transaction-engine';
import { t } from '@synergos/vitals-core';
import { estadoDelReclamo } from '../textos-de-la-tienda';
/** El número de ESTA tienda en la página: de él salen el ámbito de su sesión y los id de sus campos. */
export const INSTANCIA_DE_LA_TIENDA = new InjectionToken<number>('INSTANCIA_DE_LA_TIENDA');

/**
 * El rótulo de la condición, en UN sitio.
 *
 * Estaba escrito tres veces como ternario anidado —el eyebrow de la PDP, su ficha
 * técnica y, al llegar SH-14, la fila de comparación—, así que el tercer sitio
 * habría dicho «Reacondicionado» el día que los dos primeros dijeran otra cosa.
 */
export const CONDITION_LABELS: Readonly<Record<ProductCondition, string>> = {
  new: 'Nuevo',
  used: 'Usado',
  refurbished: 'Reacondicionado',
};

/**
 * Cómo se dice y cómo se pinta lo que comparten las vistas de la tienda (014-despiece-tienda, T010): los precios,
 * los estados de un pedido o de un reclamo, las fechas, las imágenes que no cargaron y los id de los campos.
 */
@Injectable()
export class PresentacionDeLaTienda {
  readonly #carrito = inject(CarritoDeLaTienda);
  readonly #catalogo = inject(CatalogoDeLaTienda);
  readonly #configuracion = inject(ConfiguracionDeLaTienda);

  readonly #instancia = inject(INSTANCIA_DE_LA_TIENDA);

  readonly fieldId = `syn-storefront-${this.#instancia}`;

  /** Iniciales (hasta 2) para el plato-fallback cuando un producto no trae foto.
   *  Reemplaza el emoji genérico por un monograma intencional y theme-aware.
   *
   *  La regla vive en `@synergos/shared`, compartida con `product-card`; aquí solo
   *  se expone al template. La copia local recorría UNIDADES UTF-16: un título que
   *  empezaba por emoji imprimía media pareja subrogada (un rombo) y las comillas
   *  de apertura pasaban como inicial. */
  readonly monogram = monogramOf;

  /** Imágenes que fallaron al cargar (404) → la card cae al monograma en vez de
   *  mostrar un ícono de imagen rota. Robusto ante rutas de media inexistentes. */
  readonly #imgFailed = signal<ReadonlySet<string>>(new Set<string>());

  onImageError(id: string): void {
    this.#imgFailed.update((s) => {
      const n = new Set(s);
      n.add(id);
      return n;
    });
  }

  hasImage(product: { id: string; images?: readonly string[] }): boolean {
    return (product.images?.length ?? 0) > 0 && !this.#imgFailed().has(product.id);
  }

  productPriceLabel(product: ShopProduct): string {
    return this.#carrito.formatPrice(product.amount, product.currency || this.#catalogo.currency());
  }

  productListPriceLabel(product: ShopProduct): string {
    return product.listAmount
      ? this.#carrito.formatPrice(product.listAmount, product.currency || this.#catalogo.currency())
      : '';
  }

  readonly cartTotalLabel = computed(() =>
    this.#carrito.formatMinor(this.#carrito.cartTotalMinor()),
  );

  orderStatusLabel(status: ShopOrder['status']): string {
    switch (status) {
      case 'pending':
        return 'Pendiente de pago';
      case 'paid':
        return 'Pagado';
      case 'preparing':
        return 'Preparando';
      case 'shipped':
        return 'Enviado';
      case 'delivered':
        return 'Entregado';
      case 'cancelled':
        return 'Cancelado';
    }
  }

  /** El tono del design system para el estado de un pedido o de un reclamo (`syn-status-tag`). */
  toneDelEstado(status: string): StatusTagTone {
    switch (status) {
      case 'delivered':
      case 'resuelto':
        return 'success';
      case 'cancelled':
      case 'rechazado':
        return 'critical';
      case 'pending':
      case 'abierto':
      case 'en-revision':
        return 'pending';
      default:
        return 'neutral';
    }
  }

  returnStatusLabel(claim: ReturnCase): string {
    return estadoDelReclamo(claim);
  }

  returnReasonLabel(reason: string): string {
    return etiquetaDelMotivo(reason);
  }

  orderTotalLabel(order: ShopOrder): string {
    return this.#carrito.formatPrice(order.total, order.currency || this.#catalogo.currency());
  }

  /** El día del pedido, en es-CO y en la hora del sitio: nunca el ISO crudo (etapa 3). */
  orderDateLabel(order: ShopOrder): string {
    return order.date ? diaDeLaTienda(order.date, this.#configuracion.zonaHoraria()) : '';
  }

  wishlistPriceLabel(entry: WishlistEntry): string {
    return this.#carrito.formatPrice(entry.amount, entry.currency || this.#catalogo.currency());
  }

  itemString(
    selection: Readonly<Record<string, unknown>> | undefined,
    key: string,
  ): string {
    const value = selection?.[key];
    return typeof value === 'string' ? value : '';
  }

  itemLineLabel(item: SessionItem): string {
    const variant = this.itemString(item.selection, 'variantLabel');
    return variant ? `${item.label} · ${variant}` : item.label;
  }

  itemLineTotalLabel(item: SessionItem): string {
    return this.#carrito.formatMinor(item.amount * item.quantity);
  }
}
