/** El escritorio del vendedor dentro de la tienda (#32): pedidos, devoluciones y opiniones por atender. */

import type { OrderStatus } from '../pedidos/pedidos.model';
import type { ReturnCase } from '../devoluciones/devoluciones.model';

// ─── Consola del vendedor (#32) ──────────────────────────────────────────────

/** Una opinión esperando decisión del vendedor. Gemela de la cola de #31. */
export interface ShopModerationItem {
  readonly id: string;
  readonly author: string;
  readonly productTitle: string;
  readonly rating: number;
  readonly body: string;
  readonly createdAt: string;
  /** `reported` ya está pública haciendo daño; `pending` no la ve nadie. */
  readonly reason: 'pending' | 'reported';
  readonly reportCount: number;
}

/** Resultado de decidir sobre una opinión. No degrada: ver #31. */
export type ShopModerationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'unauthenticated' | 'forbidden' | 'already-decided' | 'failed';
    };

/** Un pedido visto desde el lado de quien lo tiene que despachar. */
export interface SellerOrder {
  readonly orderRef: string;
  readonly orderNumber: string;
  readonly buyer: string;
  readonly date: string;
  readonly status: OrderStatus;
  readonly totalFormatted: string;
  readonly itemCount: number;
}

/** `GET /api/shop/seller/desk` — lo que el vendedor tiene por atender. */
export interface SellerDeskResult {
  readonly orders: readonly SellerOrder[];
  readonly returns: readonly ReturnCase[];
  readonly moderation: readonly ShopModerationItem[];
  readonly salesFormatted: string;
  readonly pendingShipments: number;
}
