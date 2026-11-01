import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import {
  CompraDeLaTienda,
  DeseosDeLaTienda,
  DevolucionesDeLaTienda,
  MensajesDeLaTienda,
  MOTIVOS_DE_DEVOLUCION,
  type OrderLine,
  PedidosDeLaTienda,
  type ShopOrder,
  type WishlistEntry,
} from '@synergos/dominio/tienda';
import {
  ButtonComponent,
  InputComponent,
  LinkComponent,
  RadioComponent,
  StatusTagComponent,
  SynStatusBannerComponent,
} from '@synergos/shared';
import { AccountShellComponent, type AccountShellConfig, TrackingTimelineComponent } from '@synergos/shells';
import { t } from '@synergos/vitals-core';
import { CompraEnLaPagina } from '../../estado/compra-en-la-pagina';
import { NavegacionDeLaTienda } from '../../estado/navegacion';
import { PresentacionDeLaTienda } from '../../estado/presentacion';

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

/** «Mi cuenta» sobre SH-4: las compras con su seguimiento y sus devoluciones, los favoritos, los mensajes y el perfil. */
@Component({
  selector: 'sg-tienda-cuenta',
  standalone: true,
  imports: [AccountShellComponent, SynStatusBannerComponent, TrackingTimelineComponent, ButtonComponent, InputComponent, LinkComponent, RadioComponent, StatusTagComponent],
  templateUrl: './cuenta.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embedded published custom elements (<synergos-rating-stars> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TiendaCuentaComponent {
  protected readonly compra = inject(CompraDeLaTienda);
  protected readonly deseos = inject(DeseosDeLaTienda);
  protected readonly devoluciones = inject(DevolucionesDeLaTienda);
  protected readonly mensajes = inject(MensajesDeLaTienda);
  protected readonly navegacion = inject(NavegacionDeLaTienda);
  protected readonly pagina = inject(CompraEnLaPagina);
  protected readonly pedidos = inject(PedidosDeLaTienda);
  protected readonly presentacion = inject(PresentacionDeLaTienda);

  readonly returnReasons = MOTIVOS_DE_DEVOLUCION;

  readonly accountConfig = computed<AccountShellConfig>(() => ({
    heading: 'Mi cuenta',
    navLabel: 'Secciones de la cuenta',
    inboxEmptyMessage: 'Todavía no tienes compras.',
    inboxLoadingMessage: 'Cargando tus compras…',
    detailPlaceholder: 'Selecciona una compra para ver el detalle y su seguimiento.',
    ...this.bandejaSinLista(),
    sections: [
      { id: 'compras', label: 'Mis compras', kind: 'inbox' },
      { id: 'favoritos', label: 'Favoritos', badge: this.deseos.wishlist().length || undefined },
      { id: 'mensajes', label: 'Mensajes', badge: this.mensajes.unreadCount() || undefined },
      { id: 'perfil', label: 'Mis datos' },
    ],
  }));

  /**
   * Lo que dice «Mis compras» cuando no hay lista (004-tienda-compra, etapa 3): sin sesión pide entrar, y con la
   * lectura caída lo dice y ofrece reintentar. Nunca los pedidos de ejemplo.
   */
  private bandejaSinLista(): Partial<AccountShellConfig> {
    switch (this.pedidos.estadoDeLasCompras()) {
      case 'sin-sesion':
        return {
          inboxEmptyTitle: t('Storefront.Purchase.OrdersSignIn', 'Inicia sesión para ver tus compras'),
          inboxEmptyMessage: '',
          inboxEmptyActionLabel: t('Storefront.Purchase.SignIn', 'Iniciar sesión'),
          inboxEmptyActionHref: this.pagina.loginUrl(),
        };
      case 'caida':
        return { errorMessage: t('Storefront.Purchase.OrdersUnavailable', 'No pudimos cargar tus compras.') };
      default:
        return {};
    }
  }

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

  /** El reintento de «Mis compras» con la lectura caída (el botón del estado de error). */
  reintentarCompras(): void {
    void this.navegacion.loadOrders();
  }

  openWishlistEntry(entry: WishlistEntry): void {
    this.navegacion.navigate('pdp', entry.productId);
  }

  readonly openReturn = (orderRef: string, line: OrderLine): void =>
    this.devoluciones.openReturn(orderRef, line, this.pedidos.orders());
}
