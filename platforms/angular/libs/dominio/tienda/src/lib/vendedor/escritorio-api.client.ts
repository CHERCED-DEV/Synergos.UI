import { Injectable, inject } from '@angular/core';
import { esRegistro, leerJsonDelBorde, leerNumero, leerTexto, llamarAlBorde } from '@synergos/core';
import { LecturasDeLaTienda } from '../comun/lecturas';
import { normalizeReturnCase } from '../devoluciones/devoluciones-api.client';
import { readOrderStatus } from '../pedidos/pedidos-api.client';
import type { ReturnCase } from '../devoluciones/devoluciones.model';
import type { SellerDeskResult, SellerOrder, ShopModerationItem, ShopModerationResult } from './escritorio.model';

/** El escritorio del vendedor dentro de la tienda (#32): lo que tiene por atender, y decidir sobre una opinión. */
@Injectable({ providedIn: 'root' })
export class EscritorioApi {
  readonly #lecturas: LecturasDeLaTienda = inject(LecturasDeLaTienda);

  // ─── Consola del vendedor (#32) ──────────────────────────────────────────────

  /**
   * Lo que el vendedor tiene por atender.
   *
   * **Esta LECTURA sí degrada a mock**, con el cartel de degradado que ya pintan
   * las otras dos consolas: un escritorio de ejemplo rotulado no engaña a nadie
   * (regla 4). Las escrituras de esta misma consola —avanzar un reclamo, decidir
   * una opinión— no degradan ninguna.
   */
  async sellerDesk(apiBase: string): Promise<SellerDeskResult> {
    const url = `${apiBase}/seller/desk`;
    try {
      const data = await leerJsonDelBorde(apiBase, url);
      const desk = normalizeSellerDesk(data);
      if (desk) {
        return desk;
      }
      throw new Error('seller-desk-shape');
    } catch (error) {
      this.#lecturas.markDegraded('GET /api/shop/seller/desk', error);
      return mockSellerDesk();
    }
  }

  /**
   * El vendedor decide sobre una opinión en cola (#32).
   *
   * Gemelo del de Educación (#31) — mismo contrato, mismo criterio: no degrada,
   * porque dejar una opinión publicada mientras la pantalla dice que se rechazó
   * deja a alguien expuesto y al vendedor creyendo que lo atendió.
   */
  async decideShopModeration(
    apiBase: string,
    reviewId: string,
    decision: 'approve' | 'reject',
  ): Promise<ShopModerationResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }
    const url = `${apiBase}/moderation/${encodeURIComponent(reviewId)}/${decision}`;
    try {
      const response = await llamarAlBorde(apiBase, url, { method: 'POST', headers: { Accept: 'application/json' } });
      if (response.ok) {
        return { ok: true };
      }
      switch (response.status) {
        case 401:
          return { ok: false, reason: 'unauthenticated' };
        case 403:
          return { ok: false, reason: 'forbidden' };
        // Otra persona ya decidió: la fila sale de la cola igual.
        case 409:
          return { ok: false, reason: 'already-decided' };
        default:
          return { ok: false, reason: 'failed' };
      }
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }
}

function normalizeShopModerationItem(value: unknown): ShopModerationItem | null {
  if (!esRegistro(value)) {
    return null;
  }
  const id = leerTexto(value['id']).trim();
  if (!id) {
    return null;
  }
  return {
    id,
    author: leerTexto(value['author']).trim() || 'Comprador',
    productTitle: leerTexto(value['productTitle']).trim() || 'Producto',
    rating: Math.min(5, Math.max(0, Math.trunc(leerNumero(value['rating'])))),
    body: leerTexto(value['body']).trim(),
    createdAt: leerTexto(value['createdAt']).trim(),
    // `reported` sólo si el servidor lo dice: por defecto es una pendiente, que
    // es la lectura conservadora (misma regla que la cola de Educación, #31).
    reason: leerTexto(value['reason']).trim() === 'reported' ? 'reported' : 'pending',
    reportCount: Math.max(0, Math.trunc(leerNumero(value['reportCount']))),
  };
}

function normalizeSellerOrder(value: unknown): SellerOrder | null {
  if (!esRegistro(value)) {
    return null;
  }
  const orderRef = leerTexto(value['orderRef']).trim() || leerTexto(value['orderNumber']).trim();
  if (!orderRef) {
    return null;
  }
  return {
    orderRef,
    orderNumber: leerTexto(value['orderNumber']).trim() || orderRef,
    buyer: leerTexto(value['buyer']).trim() || leerTexto(value['customerName']).trim() || 'Comprador',
    date: leerTexto(value['date']).trim(),
    status: readOrderStatus(value['status']),
    totalFormatted: leerTexto(value['totalFormatted']).trim(),
    itemCount: Math.max(0, Math.trunc(leerNumero(value['itemCount']))),
  };
}

function normalizeSellerDesk(value: unknown): SellerDeskResult | null {
  if (!esRegistro(value)) {
    return null;
  }
  const rawOrders = Array.isArray(value['orders']) ? value['orders'] : [];
  const rawReturns = Array.isArray(value['returns']) ? value['returns'] : [];
  const rawModeration = Array.isArray(value['moderation']) ? value['moderation'] : [];
  if (rawOrders.length === 0 && rawReturns.length === 0 && rawModeration.length === 0) {
    return null;
  }
  const orders = rawOrders
    .map((entry) => normalizeSellerOrder(entry))
    .filter((entry): entry is SellerOrder => entry !== null);
  return {
    orders,
    returns: rawReturns
      .map((entry) => normalizeReturnCase(entry))
      .filter((entry): entry is ReturnCase => entry !== null),
    moderation: rawModeration
      .map((entry) => normalizeShopModerationItem(entry))
      .filter((entry): entry is ShopModerationItem => entry !== null),
    salesFormatted: leerTexto(value['salesFormatted']).trim(),
    pendingShipments:
      Math.max(0, Math.trunc(leerNumero(value['pendingShipments']))) ||
      orders.filter((order) => order.status === 'paid' || order.status === 'preparing').length,
  };
}

/**
 * El escritorio de ejemplo del vendedor.
 *
 * **Va DESORDENADO a propósito** —una devolución vieja antes que una nueva, y la
 * opinión pendiente antes que las reportadas—: si llegara ya ordenado, quitar el
 * orden de la consola pasaría en verde y el spec no vigilaría nada. Es la regla 7
 * de `CLAUDE.md`, aprendida en la #31 con esta misma cola.
 */
function mockSellerDesk(): SellerDeskResult {
  return {
    orders: [
      { orderRef: 'ord_9f21', orderNumber: 'SYN-10241', buyer: 'María González', date: '2026-09-10', status: 'paid', totalFormatted: '$248.000', itemCount: 2 },
      { orderRef: 'ord_9f22', orderNumber: 'SYN-10242', buyer: 'Julián Pérez', date: '2026-09-09', status: 'preparing', totalFormatted: '$96.000', itemCount: 1 },
      { orderRef: 'ord_9f18', orderNumber: 'SYN-10238', buyer: 'Camila Rodríguez', date: '2026-09-05', status: 'delivered', totalFormatted: '$412.000', itemCount: 3 },
    ],
    returns: [
      {
        claimId: 'rma_a1',
        orderRef: 'ord_9f18',
        lineRef: 'SKU-114',
        productName: 'Audífonos inalámbricos',
        quantity: 1,
        refundAmountFormatted: '$180.000',
        reason: 'changed-mind',
        status: 'en-revision',
        requestedAt: '2026-09-07',
        updatedAt: '2026-09-08',
      },
      {
        claimId: 'rma_a2',
        orderRef: 'ord_9f21',
        lineRef: 'SKU-220',
        productName: 'Cafetera de goteo',
        quantity: 1,
        refundAmountFormatted: '$124.000',
        reason: 'damaged',
        status: 'abierto',
        requestedAt: '2026-09-11',
        updatedAt: '2026-09-11',
      },
    ],
    moderation: [
      { id: 'SMOD-2', author: 'Julián Pérez', productTitle: 'Cafetera de goteo', rating: 4, body: 'Buena, aunque el filtro se ensucia rápido.', createdAt: '2026-09-09', reason: 'pending', reportCount: 0 },
      // Reportada SIN conteo: el normalizador deja 0 cuando el servidor no lo
      // manda, y aun así tiene que ir por delante de la pendiente. Sin esta fila,
      // ordenar sólo por conteo daría el mismo resultado que ordenar bien.
      { id: 'SMOD-3', author: 'Sofía Marín', productTitle: 'Audífonos inalámbricos', rating: 2, body: 'La descripción decía cancelación activa y no la tiene.', createdAt: '2026-09-10', reason: 'reported', reportCount: 0 },
      { id: 'SMOD-1', author: 'Andrés Gómez', productTitle: 'Audífonos inalámbricos', rating: 1, body: 'No compren acá, escríbanme y se los vendo más barato.', createdAt: '2026-09-11', reason: 'reported', reportCount: 4 },
    ],
    salesFormatted: '$756.000',
    pendingShipments: 2,
  };
}
