import { Injectable, InjectionToken, inject } from '@angular/core';
import { LecturaRechazada, esRegistro, leerJsonDelBorde, leerNumero, leerTexto } from '@synergos/core';
import { LecturasDeLaTienda } from '../comun/lecturas';
import type { LecturaDeCompras, OrderTracking, ShipmentStage, ShopOrder } from './pedidos.model';

/**
 * Los pedidos y el seguimiento DE EJEMPLO, sólo para una demo que lo declare (004-tienda-compra, etapa 3).
 *
 * «Mis compras» caía a `mockOrders` y el seguimiento a `mockTracking` en cualquier fallo: con la sesión caída la
 * persona veía dos pedidos que no hizo, y con el seguimiento caído una línea de tiempo con fechas falsas. El camino
 * real ya no los pinta (la T2, «la UI no miente»); se conservan detrás de esta marca, que una demo provee a
 * propósito (`{ provide: MUESTRAS_DE_LA_CUENTA, useValue: true }`) y que nadie hereda sin escribirla.
 */
export const MUESTRAS_DE_LA_CUENTA = new InjectionToken<boolean>('MUESTRAS_DE_LA_CUENTA', {
  factory: () => false,
});

/** «Mis compras» (`GET /orders`) y el seguimiento de un pedido (`GET /order/{ref}/tracking`): no inventan (004, etapa 3). */
@Injectable({ providedIn: 'root' })
export class PedidosApi {
  readonly #lecturas: LecturasDeLaTienda = inject(LecturasDeLaTienda);

  readonly #muestrasDeLaCuenta = inject(MUESTRAS_DE_LA_CUENTA);

  // ─── Orders (history) ────────────────────────────────────────────────────────

  /**
   * «Mis compras». **No inventa** (004-tienda-compra, etapa 3): un 401 es que no hay sesión —el servidor no lista
   * pedidos de nadie sin ella— y cualquier otro fallo, o una forma que no se entiende, es la lectura caída. Los
   * pedidos de ejemplo sólo salen con {@link MUESTRAS_DE_LA_CUENTA}, y entonces con su cartel.
   */
  async orders(apiBase: string, customer: string, currency: string): Promise<LecturaDeCompras> {
    const query = customer ? `?customer=${encodeURIComponent(customer)}` : '';
    const url = `${apiBase}/orders${query}`;
    try {
      const data = await leerJsonDelBorde(apiBase, url);
      const orders = normalizeOrders(data, currency);
      if (orders) {
        return { estado: 'leidas', pedidos: orders };
      }
      throw new Error('orders-shape');
    } catch (error) {
      if (this.#muestrasDeLaCuenta) {
        this.#lecturas.markDegraded('GET /api/shop/orders', error);
        return { estado: 'leidas', pedidos: mockOrders(currency) };
      }
      this.#lecturas.readFailed('GET /api/shop/orders', error);
      return error instanceof LecturaRechazada && error.estado === 401 ? { estado: 'sin-sesion' } : { estado: 'caida' };
    }
  }

  // ─── Tracking (seguimiento de envío) ─────────────────────────────────────────

  /**
   * El seguimiento de un pedido, o `null` si no se pudo leer (004-tienda-compra, etapa 3): la pantalla dice
   * «Seguimiento no disponible» en vez de pintar una línea de tiempo con fechas que nadie registró. La de ejemplo
   * sólo sale con {@link MUESTRAS_DE_LA_CUENTA}.
   */
  async tracking(apiBase: string, orderRef: string, status: string): Promise<OrderTracking | null> {
    const url = `${apiBase}/order/${encodeURIComponent(orderRef)}/tracking`;
    try {
      const data = await leerJsonDelBorde(apiBase, url);
      const tracking = normalizeTracking(data, orderRef);
      if (tracking) {
        return tracking;
      }
      throw new Error('tracking-shape');
    } catch (error) {
      if (this.#muestrasDeLaCuenta) {
        this.#lecturas.markDegraded('GET /api/shop/order/{ref}/tracking', error);
        return mockTracking(orderRef, status);
      }
      this.#lecturas.readFailed('GET /api/shop/order/{ref}/tracking', error);
      return null;
    }
  }
}

function normalizeOrders(value: unknown, fallbackCurrency: string): readonly ShopOrder[] | null {
  const list = Array.isArray(value)
    ? value
    : esRegistro(value) && Array.isArray(value['orders'])
      ? value['orders']
      : null;
  if (!list) {
    return null;
  }
  return list
    .map((entry): ShopOrder | null => {
      if (!esRegistro(entry)) {
        return null;
      }
      const orderNumber = leerTexto(entry['orderNumber']).trim() || leerTexto(entry['id']).trim();
      if (!orderNumber) {
        return null;
      }
      const rawLines = Array.isArray(entry['items']) ? entry['items'] : [];
      return {
        orderNumber,
        orderRef: leerTexto(entry['orderRef']).trim() || orderNumber,
        date: leerTexto(entry['date']).trim(),
        status: readOrderStatus(entry['status']),
        total: leerNumero(entry['total'] ?? entry['amount']),
        currency: leerTexto(entry['currency']).trim() || fallbackCurrency,
        items: rawLines.map((line) => ({
          title: esRegistro(line) ? leerTexto(line['title']).trim() : '',
          qty: esRegistro(line) ? Math.max(1, Math.trunc(leerNumero(line['qty']))) : 1,
          amount: esRegistro(line) ? leerNumero(line['amount']) : 0,
          // El borde los emitía desde siempre y nadie los leía; sin el
          // `productId` no se puede pedir una devolución (#32).
          productId: esRegistro(line) ? leerTexto(line['productId']).trim() : '',
          variantId: (esRegistro(line) ? leerTexto(line['variantId']).trim() : '') || undefined,
          // Ausente = NO se puede (#34). Lo decide el servidor; la UI ya no lo
          // deduce, que es lo que hizo que su copia se desviara (#33).
          canReturn: esRegistro(line) && line['canReturn'] === true,
          returnBlock: (esRegistro(line) ? leerTexto(line['returnBlock']).trim() : '') || undefined,
        })),
      };
    })
    .filter((order): order is ShopOrder => order !== null);
}

const STAGE_STATES = ['done', 'current', 'pending'] as const;

function normalizeTracking(value: unknown, orderRef: string): OrderTracking | null {
  if (!esRegistro(value) || !Array.isArray(value['stages'])) {
    return null;
  }
  const stages = value['stages']
    .map((entry): ShipmentStage | null => {
      if (!esRegistro(entry)) {
        return null;
      }
      const label = leerTexto(entry['label']).trim();
      if (!label) {
        return null;
      }
      const stateRaw = leerTexto(entry['state']).trim().toLowerCase();
      const state = (STAGE_STATES as readonly string[]).includes(stateRaw)
        ? (stateRaw as ShipmentStage['state'])
        : 'pending';
      const date = leerTexto(entry['date']).trim();
      const description = leerTexto(entry['description']).trim();
      return {
        id: leerTexto(entry['id']).trim() || label,
        label,
        date: date || undefined,
        description: description || undefined,
        state,
      };
    })
    .filter((stage): stage is ShipmentStage => stage !== null);
  if (stages.length === 0) {
    return null;
  }
  const carrier = leerTexto(value['carrier']).trim();
  return {
    orderRef: leerTexto(value['orderRef']).trim() || orderRef,
    carrier: carrier || undefined,
    stages,
  };
}

const ORDER_STATUSES: readonly ShopOrder['status'][] = [
  'pending',
  'paid',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
];

/** `paid` por defecto: es el estado con el que un pedido existe de verdad. */
export function readOrderStatus(value: unknown): ShopOrder['status'] {
  const raw = leerTexto(value).trim().toLowerCase();
  return ORDER_STATUSES.includes(raw as ShopOrder['status'])
    ? (raw as ShopOrder['status'])
    : 'paid';
}

/**
 * Pedidos de ejemplo.
 *
 * **Los dos van en `paid`, que es lo ÚNICO que un pedido comprado puede valer.**
 * Traían `delivered` y `shipped` —estados que el enum del CMS no tiene: sólo
 * `Pending`, `Paid` y `Cancelled`—, y eso fue lo que escondió el #33: el gate de
 * la devolución pedía justo esos dos, así que en producción el botón no aparecía
 * nunca y acá sí. Un dato de ejemplo que no puede existir en producción hace
 * verde un camino que en producción está cortado.
 *
 * En qué fase va cada uno lo dice el SEGUIMIENTO, que es donde el dominio lo
 * guarda (`StubOrderTrackingService.ShopPipeline`).
 */
function mockOrders(currency: string): readonly ShopOrder[] {
  return [
    {
      orderNumber: 'ORD-2026-00481',
      orderRef: 'ORD-2026-00481',
      date: '2026-06-10',
      status: 'paid',
      total: 1_888_000,
      currency,
      // El ejemplo también trae el veredicto, porque lo trae el servidor (#34).
      items: [
        {
          title: 'Audífonos Sony WH-1000XM5',
          qty: 1,
          amount: 1_499_000,
          productId: 'SONY-XM5',
          canReturn: true,
        },
      ],
    },
    {
      orderNumber: 'ORD-2026-00512',
      orderRef: 'ORD-2026-00512',
      date: '2026-06-22',
      status: 'paid',
      total: 389_000,
      currency,
      // Éste también sale con permiso del servidor: la única condición que el
      // dominio impone es que la orden esté pagada, y lo está. Que todavía vaya
      // en camino lo sabe el SEGUIMIENTO, y ése es el refinamiento de la UI
      // (#33) — no un motivo del servidor.
      items: [
        {
          title: 'Mouse Logitech MX Master 3S',
          qty: 1,
          amount: 389_000,
          productId: 'LOGI-MX3S',
          canReturn: true,
        },
      ],
    },
  ];
}

/**
 * Hasta dónde llegó cada pedido de ejemplo.
 *
 * Vive acá y no en `status` a propósito (#33): uno entregado y otro en camino es
 * lo que hace útil el ejemplo, y los dos son `paid` porque es lo que el servidor
 * emite. Un pedido que no esté acá arranca en «pago confirmado».
 */
const MOCK_TRACKING_STAGE: Readonly<Record<string, string>> = {
  'ORD-2026-00481': 'delivered',
  'ORD-2026-00512': 'shipped',
};

function mockTracking(orderRef: string, status: string): OrderTracking {
  // Los ids son los del pipeline de la Tienda en el CMS
  // (`StubOrderTrackingService.ShopPipeline`), no una invención de este mock.
  const order: readonly { id: string; label: string; date?: string }[] = [
    { id: 'paid', label: 'Pago aprobado', date: '2026-06-22' },
    { id: 'preparing', label: 'Preparando el paquete', date: '2026-06-23' },
    { id: 'shipped', label: 'En camino', date: '2026-06-24' },
    { id: 'delivered', label: 'Entregado' },
  ];
  // La fase sale del PEDIDO, no de su estado: un pedido comprado siempre vale
  // `paid`, y derivar la fase de ahí dejaría a todos en «pago confirmado» (#33).
  // Un pedido sin pagar o cancelado no avanza, pase lo que pase en el mapa.
  const etapa = status === 'paid' ? (MOCK_TRACKING_STAGE[orderRef] ?? 'paid') : 'paid';
  const reached =
    etapa === 'delivered' ? 4 : etapa === 'shipped' ? 3 : etapa === 'preparing' ? 2 : 1;
  return {
    orderRef,
    carrier: 'Envíos Synergos',
    stages: order.map((stage, index) => ({
      ...stage,
      state: index < reached - 1 ? 'done' : index === reached - 1 ? 'current' : 'pending',
    })),
  };
}
