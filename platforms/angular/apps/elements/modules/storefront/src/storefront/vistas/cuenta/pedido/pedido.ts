import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DevolucionesDeLaTienda, type OrderLine, PedidosDeLaTienda, type ShopOrder } from '@synergos/dominio/tienda';
import { LinkComponent, StatusTagComponent } from '@synergos/shared';
import { TrackingTimelineComponent } from '@synergos/shells';
import { t } from '@synergos/vitals-core';
import { NavegacionDeLaTienda } from '../../../estado/navegacion';
import { PresentacionDeLaTienda } from '../../../estado/presentacion';
import { TiendaCuentaDevolucionComponent } from './devolucion/devolucion';

/**
 * Qué se le dice a quien compró según el motivo que dio el SERVIDOR (#34).
 *
 * `order-not-paid` y `order-not-found` se quedan en blanco a propósito: a quien
 * canceló o a quien mira un pedido que no existe no hay nada útil que contarle
 * sobre devoluciones. `line-not-in-order` tampoco — es un desajuste nuestro, no
 * algo que esa persona pueda resolver.
 */
const RETURN_BLOCK_LABELS: Readonly<Record<string, string>> = {
  'already-open': 'Ya hay un reclamo abierto para este producto.',
};

/**
 * Una compra abierta en «Mis compras», en el detalle de SH-4 (014-despiece-tienda, T010): sus líneas con lo que se
 * puede devolver de cada una, el seguimiento del envío y, si se pidió, la devolución.
 */
@Component({
  selector: 'sg-tienda-cuenta-pedido',
  standalone: true,
  imports: [LinkComponent, StatusTagComponent, TrackingTimelineComponent, TiendaCuentaDevolucionComponent],
  templateUrl: './pedido.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
})
export class TiendaCuentaPedidoComponent {
  protected readonly devoluciones = inject(DevolucionesDeLaTienda);
  protected readonly navegacion = inject(NavegacionDeLaTienda);
  protected readonly pedidos = inject(PedidosDeLaTienda);
  protected readonly presentacion = inject(PresentacionDeLaTienda);

  /** La compra que se abrió en la bandeja. */
  readonly pedido = input.required<ShopOrder>();

  /**
   * Lo que dice el seguimiento cuando no tiene etapas que pintar (004-tienda-compra, etapa 3): «Consultando…» mientras
   * se lee, y «Seguimiento no disponible» si la lectura cayó o el pedido todavía no tiene ninguna. Antes una caída
   * pintaba una línea de tiempo de ejemplo con fechas que nadie registró.
   */
  mensajeDelSeguimiento(order: ShopOrder): string {
    return this.pedidos.seguimientoCaido().has(order.orderNumber) || this.pedidos.trackingByRef()[order.orderNumber]
      ? t('Storefront.Purchase.TrackingUnavailable', 'Seguimiento no disponible')
      : 'Consultando el seguimiento…';
  }

  /**
   * Por qué no se ofrece devolver esta línea, cuando la razón le sirve a quien
   * compró. Devuelve cadena vacía cuando no hay nada que explicar —un pedido
   * cancelado no necesita que le cuenten que no se devuelve—.
   */
  returnBlockedReason(order: ShopOrder, line: OrderLine): string {
    if (this.devoluciones.claimForLine(order.orderNumber, line) !== null) {
      return '';
    }
    if (this.devoluciones.returnsUnknown(order)) {
      return 'Consultando devoluciones…';
    }
    if (!line.canReturn) {
      // El motivo lo NOMBRA el servidor (#34). Los que no le sirven a quien
      // compró no se pintan: a quien canceló no hay que contarle que no puede
      // devolver lo que nunca recibió.
      return RETURN_BLOCK_LABELS[line.returnBlock ?? ''] ?? '';
    }
    return '';
  }

  readonly openReturn = (orderRef: string, line: OrderLine): void =>
    this.devoluciones.openReturn(orderRef, line, this.pedidos.orders());
}
