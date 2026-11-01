import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DeseosDeLaTienda, MensajesDeLaTienda, PedidosDeLaTienda } from '@synergos/dominio/tienda';
import { StatusTagComponent } from '@synergos/shared';
import { AccountShellComponent, type AccountShellConfig } from '@synergos/shells';
import { t } from '@synergos/vitals-core';
import { CompraEnLaPagina } from '../../estado/compra-en-la-pagina';
import { NavegacionDeLaTienda } from '../../estado/navegacion';
import { PresentacionDeLaTienda } from '../../estado/presentacion';
import { TiendaCuentaFavoritosComponent } from './favoritos/favoritos';
import { TiendaCuentaMensajesComponent } from './mensajes/mensajes';
import { TiendaCuentaPedidoComponent } from './pedido/pedido';
import { TiendaCuentaPerfilComponent } from './perfil/perfil';

/**
 * «Mi cuenta» sobre SH-4: la bandeja de las compras y sus secciones. Cada parte es su pieza: la compra abierta con su
 * seguimiento y sus devoluciones, los favoritos, los mensajes y el perfil.
 */
@Component({
  selector: 'sg-tienda-cuenta',
  standalone: true,
  imports: [
    AccountShellComponent,
    StatusTagComponent,
    TiendaCuentaPedidoComponent,
    TiendaCuentaFavoritosComponent,
    TiendaCuentaMensajesComponent,
    TiendaCuentaPerfilComponent,
  ],
  templateUrl: './cuenta.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
})
export class TiendaCuentaComponent {
  protected readonly deseos = inject(DeseosDeLaTienda);
  protected readonly mensajes = inject(MensajesDeLaTienda);
  protected readonly navegacion = inject(NavegacionDeLaTienda);
  protected readonly pagina = inject(CompraEnLaPagina);
  protected readonly pedidos = inject(PedidosDeLaTienda);
  protected readonly presentacion = inject(PresentacionDeLaTienda);

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

  /** El reintento de «Mis compras» con la lectura caída (el botón del estado de error). */
  reintentarCompras(): void {
    void this.navegacion.loadOrders();
  }
}
