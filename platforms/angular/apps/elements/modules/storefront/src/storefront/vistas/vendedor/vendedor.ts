import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, input, signal } from '@angular/core';
import {
  EscritorioDeLaTienda,
  MensajesDeLaTienda,
  type ReturnAdvance,
  type ReturnCase,
  type SellerOrder,
  type ShopModerationItem,
} from '@synergos/dominio/tienda';
import { StatusTagComponent, SynStatusBannerComponent } from '@synergos/shared';
import {
  type ConsoleColumn,
  type ConsoleKpi,
  type ConsoleRowAction,
  type ConsoleRowActionEvent,
  ConsoleShellComponent,
  type ConsoleShellConfig,
} from '@synergos/shells';
import { PresentacionDeLaTienda } from '../../estado/presentacion';
import { type SellerView } from '../../rutas-de-la-tienda';

const SELLER_SECTIONS: readonly SellerView[] = ['orders', 'returns', 'reviews', 'messages'];

/** El escritorio del vendedor dentro de la tienda (SH-5, #32): pedidos, devoluciones, opiniones y mensajes. */
@Component({
  selector: 'sg-tienda-vendedor',
  standalone: true,
  imports: [ConsoleShellComponent, SynStatusBannerComponent, StatusTagComponent],
  templateUrl: './vendedor.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
  // Embedded published custom elements (<synergos-rating-stars> …).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TiendaVendedorComponent {
  protected readonly escritorio = inject(EscritorioDeLaTienda);
  protected readonly mensajes = inject(MensajesDeLaTienda);
  protected readonly presentacion = inject(PresentacionDeLaTienda);

  readonly degraded = input(false);

  readonly sellerView = signal<SellerView>('orders');

  onSellerSectionChange(section: string): void {
    if (SELLER_SECTIONS.includes(section as SellerView)) {
      this.sellerView.set(section as SellerView);
    }
  }

  readonly sellerConfig = computed<ConsoleShellConfig>(() => ({
    heading: 'Consola del vendedor',
    navLabel: 'Secciones del vendedor',
    kpisLabel: 'Indicadores de la tienda',
    actionsLabel: 'Acciones',
    emptyMessage: 'No hay nada por atender en esta sección.',
    loadingMessage: 'Cargando…',
    sections: [
      {
        id: 'orders',
        label: 'Pedidos',
        kind: 'table',
        badge: this.escritorio.desk()?.pendingShipments || undefined,
      },
      {
        id: 'returns',
        label: 'Devoluciones',
        kind: 'table',
        // El badge cuenta lo PENDIENTE, no el total: un número que incluye lo ya
        // resuelto no dice cuánto trabajo queda.
        badge:
          this.escritorio.sellerReturns().filter((c) => c.status === 'abierto' || c.status === 'en-revision')
            .length || undefined,
      },
      {
        id: 'reviews',
        label: 'Opiniones',
        kind: 'table',
        badge: this.escritorio.sellerModeration().length || undefined,
      },
      { id: 'messages', label: 'Mensajes', kind: 'custom' },
    ],
  }));

  readonly sellerKpis = computed<readonly ConsoleKpi[]>(() => {
    const desk = this.escritorio.desk();
    if (!desk) {
      return [];
    }
    return [
      { id: 'sales', label: 'Ventas', value: desk.salesFormatted || '—' },
      { id: 'pending', label: 'Por despachar', value: String(desk.pendingShipments) },
      { id: 'returns', label: 'Devoluciones abiertas', value: String(this.escritorio.openReturnCount()) },
    ];
  });

  readonly sellerOrderColumns: readonly ConsoleColumn[] = [
    { key: 'sellerOrder', label: 'Pedido' },
    { key: 'sellerBuyer', label: 'Comprador' },
    { key: 'sellerStatus', label: 'Estado' },
    { key: 'sellerTotal', label: 'Total' },
  ];

  readonly sellerReturnColumns: readonly ConsoleColumn[] = [
    { key: 'returnStatus', label: 'Estado' },
    { key: 'returnProduct', label: 'Producto' },
    { key: 'returnReason', label: 'Motivo' },
    { key: 'returnAmount', label: 'A devolver' },
  ];

  readonly sellerModerationColumns: readonly ConsoleColumn[] = [
    { key: 'modReason', label: 'Motivo' },
    { key: 'modAuthor', label: 'Quién y dónde' },
    { key: 'modBody', label: 'Qué dice' },
  ];

  // `rejected` y `refunded` son `danger`: uno le niega la devolución a alguien y
  // el otro MUEVE PLATA. Un botón neutro invita a pulsarlo sin mirar.
  readonly sellerReturnActions: readonly ConsoleRowAction[] = [
    { id: 'approved', label: 'Aprobar', kind: 'primary' },
    { id: 'received', label: 'Recibido', kind: 'default' },
    { id: 'refunded', label: 'Reembolsar', kind: 'danger' },
    { id: 'rejected', label: 'Rechazar', kind: 'danger' },
  ];

  readonly sellerModerationActions: readonly ConsoleRowAction[] = [
    { id: 'approve', label: 'Aprobar', kind: 'primary' },
    { id: 'reject', label: 'Rechazar', kind: 'danger' },
  ];

  readonly sellerNoActions: readonly ConsoleRowAction[] = [];

  readonly sellerRows = computed<
    readonly (SellerOrder | ReturnCase | ShopModerationItem)[]
  >(() => {
    switch (this.sellerView()) {
      case 'returns':
        return this.escritorio.sellerReturns();
      case 'reviews':
        return this.escritorio.sellerModeration();
      case 'messages':
        return [];
      default:
        return this.escritorio.sellerOrders();
    }
  });

  readonly sellerColumns = computed<readonly ConsoleColumn[]>(() => {
    switch (this.sellerView()) {
      case 'returns':
        return this.sellerReturnColumns;
      case 'reviews':
        return this.sellerModerationColumns;
      default:
        return this.sellerOrderColumns;
    }
  });

  readonly sellerActions = computed<readonly ConsoleRowAction[]>(() => {
    switch (this.sellerView()) {
      case 'returns':
        return this.sellerReturnActions;
      case 'reviews':
        return this.sellerModerationActions;
      default:
        return this.sellerNoActions;
    }
  });

  onSellerAction(
    event: ConsoleRowActionEvent<SellerOrder | ReturnCase | ShopModerationItem>,
  ): void {
    if (event.sectionId === 'returns') {
      void this.escritorio.advanceReturn(
        (event.row as ReturnCase).claimId,
        event.actionId as ReturnAdvance,
      );
      return;
    }
    if (event.sectionId === 'reviews') {
      void this.escritorio.decideSellerReview(
        (event.row as ShopModerationItem).id,
        event.actionId === 'reject' ? 'reject' : 'approve',
      );
    }
  }

  sellerModerationReasonLabel(item: ShopModerationItem): string {
    return item.reason === 'reported'
      ? `Reportada ${item.reportCount === 1 ? '1 vez' : `${item.reportCount} veces`}`
      : 'Sin publicar';
  }
}
