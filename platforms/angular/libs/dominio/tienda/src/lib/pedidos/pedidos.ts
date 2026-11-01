import { Injectable, inject, signal } from '@angular/core';
import { CatalogoDeLaTienda } from '../catalogo/catalogo';
import { AvisosDeLaTienda } from '../comun/avisos';
import { ConfiguracionDeLaTienda } from '../comun/configuracion';
import { momentoDeLaTienda } from '../comun/fechas-de-la-tienda';
import { TEXTOS_DE_LA_TIENDA } from '../comun/textos';
import { DevolucionesDeLaTienda } from '../devoluciones/devoluciones';
import { PedidosApi } from './pedidos-api.client';
import type { LecturaDeCompras, ShipmentStage, ShopOrder } from './pedidos.model';

/**
 * La etapa de entrega del pipeline de la Tienda (#33).
 *
 * El id lo fija `StubOrderTrackingService.ShopPipeline` —«paid → preparing →
 * shipped → delivered»— y llega tal cual en `GET /order/{ref}/tracking`.
 */
const DELIVERED_STAGE = 'delivered';

/**
 * «Mis compras» (014-despiece-tienda, T008): los pedidos de quien compró, por qué no hay lista cuando no la hay, y el
 * seguimiento de cada uno con sus fechas en la hora del sitio.
 */
@Injectable()
export class PedidosDeLaTienda {
  readonly #api = inject(PedidosApi);
  readonly #config = inject(ConfiguracionDeLaTienda);
  readonly #catalogo = inject(CatalogoDeLaTienda);
  readonly #devoluciones = inject(DevolucionesDeLaTienda);
  readonly #avisos = inject(AvisosDeLaTienda);
  readonly #textos = inject(TEXTOS_DE_LA_TIENDA);

  readonly orders = signal<readonly ShopOrder[]>([]);
  readonly ordersLoaded = signal(false);
  readonly ordersLoading = signal(false);
  readonly trackingByRef = signal<Readonly<Record<string, readonly ShipmentStage[]>>>({});
  /** Por qué «Mis compras» no tiene lista: sin sesión, o con la lectura caída (004-tienda-compra, etapa 3). */
  readonly estadoDeLasCompras = signal<LecturaDeCompras['estado']>('leidas');
  /** Los pedidos cuyo seguimiento no se pudo leer: dicen «Seguimiento no disponible», no una línea de tiempo inventada. */
  readonly seguimientoCaido = signal<ReadonlySet<string>>(new Set<string>());

  onOrderSelect(order: ShopOrder): void {
    if (this.trackingByRef()[order.orderNumber]) {
      return;
    }
    void this.#api
      .tracking(this.#config.apiBase(), order.orderRef, order.status)
      .then((tracking) => {
        if (tracking === null) {
          this.seguimientoCaido.update((caidos) => new Set(caidos).add(order.orderNumber));
          return;
        }
        this.seguimientoCaido.update((caidos) => {
          const resto = new Set(caidos);
          resto.delete(order.orderNumber);
          return resto;
        });
        this.trackingByRef.update((map) => ({
          ...map,
          [order.orderNumber]: tracking.stages.map((stage) => ({
            ...stage,
            date: stage.date ? momentoDeLaTienda(stage.date, this.#config.zonaHoraria()) : stage.date,
          })),
        }));
      });
  }

  trackingStages(orderRef: string): readonly ShipmentStage[] {
    return this.trackingByRef()[orderRef] ?? [];
  }

  /**
   * El pedido llegó: la etapa `delivered` del pipeline está alcanzada. Ya no decide la devolución (ver
   * `canReturnLine`): se conserva para quien lea la entrega.
   */
  isDelivered(order: ShopOrder): boolean {
    return this.trackingStages(order.orderNumber).some(
      (stage) => stage.id === DELIVERED_STAGE && stage.state === 'done',
    );
  }

  /** `customer` es el correo de quien compra, tal como lo dejó la compra. */
  async loadOrders(customer: string): Promise<void> {
    this.ordersLoading.set(true);
    try {
      const lectura = await this.#api.orders(this.#config.apiBase(), customer.trim(), this.#catalogo.currency());
      this.estadoDeLasCompras.set(lectura.estado);
      if (lectura.estado !== 'leidas') {
        // Sin lista no hay pedidos que pintar: ni los de ejemplo ni los de una lectura anterior (etapa 3).
        this.orders.set([]);
        return;
      }
      this.orders.set(lectura.pedidos);
      this.ordersLoaded.set(true);
      // Y los reclamos, que es lo que faltaba: sin esto el mapa arrancaba vacío
      // en cada carga y el comprador podía abrir un segundo reclamo (#32).
      await this.#devoluciones.loadReturns(lectura.pedidos);
    } catch (error) {
      this.#avisos.errorMessage.set(this.#textos.comprasCaidas);
      void error;
    } finally {
      this.ordersLoading.set(false);
    }
  }
}
