import { Injectable, inject } from '@angular/core';
import { esRegistro, leerNumero, leerTexto, llamarAlBorde } from '@synergos/core';
import { LecturasDeLaConsola, type LecturaDeLaConsola } from './lecturas-de-la-consola';
import { legibles, readList, textoONulo } from './lectores-de-la-consola';
import {
  type DevolucionDeLaTienda,
  esEstadoDeDevolucion,
  type MovimientoDeLaDevolucion,
  type ResultadoDelMovimiento,
  type SellerReturn,
  type SellerReturnAction,
  type SellerReturnStatus,
} from './consola.model';
import { mockPedidos } from './bandeja-api.client';

/** La cola de devoluciones del personal, y mover una con lo que contesta el servidor (013, T025). */
@Injectable({ providedIn: 'root' })
export class DevolucionesDelPersonalApi {
  readonly #lecturas = inject(LecturasDeLaConsola);

  // ─── Devoluciones (RMA) ──────────────────────────────────────────────────────

  /**
   * La cola de devoluciones de la tienda entera (013-seller-operaciones, T025): `GET seller/returns`, en el orden del
   * servidor —lo que más espera, primero—, con el estado exacto y el camino de cada pedido.
   */
  devoluciones(apiBase: string): Promise<LecturaDeLaConsola<readonly DevolucionDeLaTienda[]>> {
    return this.#lecturas.leer(apiBase, `${apiBase}/seller/returns`, 'GET /api/shop/seller/returns', normalizeDevoluciones, mockDevoluciones);
  }

  /**
   * Mueve una devolución: `POST return/{rmaId}/advance` con `{ status, note }`, que es lo que lee el CMS
   * (`ReturnAdvanceBody`). Devuelve el estado en que quedó, o que no se movió (#77) con el motivo que dio el servidor:
   * un reembolso que no sale deja la devolución recibida, y lo dice.
   */
  async moverDevolucion(
    apiBase: string,
    rmaId: string,
    status: MovimientoDeLaDevolucion,
    note?: string,
  ): Promise<ResultadoDelMovimiento> {
    const endpoint = 'POST /api/shop/return/{rmaId}/advance';
    if (typeof fetch !== 'function' || !apiBase) {
      this.#lecturas.avisar(endpoint, new Error(apiBase ? 'fetch-unavailable' : 'sin-api'));
      return { hecho: false, por: 'caida', motivo: null };
    }
    const url = `${apiBase}/return/${encodeURIComponent(rmaId)}/advance`;
    let respuesta: Response;
    try {
      respuesta = await llamarAlBorde(apiBase, url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: note ?? null }),
      });
    } catch (error) {
      this.#lecturas.avisar(endpoint, error);
      return { hecho: false, por: 'caida', motivo: null };
    }
    let cuerpo: unknown = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      cuerpo = null;
    }
    if (respuesta.ok) {
      return { hecho: true, estado: esRegistro(cuerpo) && esEstadoDeDevolucion(cuerpo['estado']) ? cuerpo['estado'] : null };
    }
    if (respuesta.status === 401 || respuesta.status === 403) {
      return { hecho: false, por: respuesta.status === 401 ? 'sin-sesion' : 'sin-permiso', motivo: null };
    }
    const motivo = esRegistro(cuerpo) ? textoONulo(cuerpo['error']) : null;
    if (respuesta.status >= 500) {
      this.#lecturas.avisar(endpoint, new Error(`HTTP ${respuesta.status}`));
      return { hecho: false, por: 'caida', motivo };
    }
    return { hecho: false, por: 'rechazo', motivo };
  }

  /**
   * Las devoluciones de QUIEN PREGUNTA (`GET returns`): la consola las leía como la cola de la tienda, y el personal veía
   * las suyas como comprador. Desde 013-seller-operaciones T025 la consola lee la cola del personal
   * ({@link devoluciones}). Queda aquí sin llamador y fuera de la API del cliente —desconectada, no borrada (Synergos es
   * un superset)— hasta que el arquitecto decida su retiro: está anotado en la bitácora de 013, con {@link orders}.
   */
  private returns(apiBase: string): Promise<LecturaDeLaConsola<readonly SellerReturn[]>> {
    return this.#lecturas.leer(apiBase, `${apiBase}/returns`, 'GET /api/shop/returns', normalizeReturns, mockReturns);
  }

  /**
   * Resuelve un RMA.
   *
   * **`null` es «no se pudo» (#77).** Devolvía
   * `action === 'approve' ? 'aprobado' : 'rechazado'`, o sea el ECO de la intención de
   * quien llamó presentado como la respuesta del servidor — la regla 19 otra vez, con el
   * parámetro haciendo de resultado.
   *
   * Y mandaba `{ action }`, que el CMS no lee (`ReturnAdvanceBody` es `{ status, note }`): contestaba 400 siempre, así
   * que aprobar o rechazar desde la consola no funcionó nunca (G-7 lo señaló en 013). Desde T025 pasa por
   * {@link moverDevolucion}, y queda desconectada —privada, sin llamador, no borrada— con {@link returns}.
   */
  private async advanceReturn(
    apiBase: string,
    rmaId: string,
    action: SellerReturnAction,
  ): Promise<SellerReturnStatus | null> {
    const movida = await this.moverDevolucion(apiBase, rmaId, action === 'approve' ? 'approved' : 'rejected');
    return movida.hecho ? (action === 'approve' ? 'en-revision' : 'rechazado') : null;
  }
}

/**
 * Una devolución de la cola, o `null` si no se entiende: sin `rmaId` o sin un estado exacto no se sabe qué acción le
 * toca, y pintarle una supuesta sería decidir por el servidor.
 */
function normalizeDevolucion(value: unknown): DevolucionDeLaTienda | null {
  if (!esRegistro(value)) {
    return null;
  }
  const rmaId = leerTexto(value['rmaId']).trim();
  const estado = value['estado'];
  if (!rmaId || !esEstadoDeDevolucion(estado)) {
    return null;
  }
  const camino = value['camino'];
  return {
    rmaId,
    orderRef: leerTexto(value['orderRef']).trim(),
    orderNumber: textoONulo(value['orderNumber']),
    camino: camino === 'puerta' || camino === 'directa' ? camino : null,
    producto: leerTexto(value['producto']).trim(),
    cantidad: Math.max(0, Math.trunc(leerNumero(value['cantidad']))),
    motivo: leerTexto(value['motivo']).trim(),
    monto: leerNumero(value['monto']),
    montoFormatted: leerTexto(value['montoFormatted']).trim(),
    moneda: leerTexto(value['moneda']).trim(),
    estado,
    nota: textoONulo(value['nota']),
    solicitada: leerTexto(value['solicitada']).trim(),
    actualizada: leerTexto(value['actualizada']).trim(),
  };
}

function normalizeDevoluciones(value: unknown): readonly DevolucionDeLaTienda[] | null {
  if (!esRegistro(value) || !Array.isArray(value['devoluciones'])) {
    return null;
  }
  return legibles(
    value['devoluciones'],
    value['devoluciones'].map(normalizeDevolucion).filter((d): d is DevolucionDeLaTienda => d !== null),
  );
}

const RETURN_STATUSES: readonly SellerReturnStatus[] = [
  'abierto',
  'en-revision',
  'aprobado',
  'rechazado',
];

function normalizeReturnStatus(value: unknown): SellerReturnStatus | null {
  const raw = leerTexto(value).trim().toLowerCase();
  return (RETURN_STATUSES as readonly string[]).includes(raw)
    ? (raw as SellerReturnStatus)
    : null;
}

function normalizeReturns(value: unknown): readonly SellerReturn[] | null {
  const list = readList(value, 'returns');
  if (!list) {
    return null;
  }
  const returns = list
    .map((entry): SellerReturn | null => {
      if (!esRegistro(entry)) {
        return null;
      }
      const rmaId = leerTexto(entry['rmaId']).trim() || leerTexto(entry['claimId']).trim();
      if (!rmaId) {
        return null;
      }
      return {
        rmaId,
        orderNumber: leerTexto(entry['orderNumber']).trim(),
        productTitle:
          leerTexto(entry['productTitle']).trim() || leerTexto(entry['title']).trim(),
        reason: leerTexto(entry['reason']).trim(),
        date: leerTexto(entry['date']).trim(),
        status: normalizeReturnStatus(entry['status']) ?? 'abierto',
      };
    })
    .filter((rma): rma is SellerReturn => rma !== null);
  return legibles(list, returns);
}

/** La cola de ejemplo: sólo con la marca de la demo, y una por estado para que se vean sus acciones. */
function mockDevoluciones(): readonly DevolucionDeLaTienda[] {
  // Del primer pedido de ejemplo: su moneda y el importe de su línea, sin escribir una moneda aquí.
  const pedido = mockPedidos()[0];
  const linea = pedido.lineas[0];
  const base = {
    orderRef: pedido.orderRef,
    orderNumber: pedido.orderNumber,
    camino: pedido.camino,
    cantidad: 1,
    monto: linea.amount,
    montoFormatted: linea.amountFormatted,
    moneda: pedido.moneda,
    nota: null,
    solicitada: pedido.fecha,
    actualizada: pedido.fecha,
  };
  return [
    { ...base, rmaId: 'demo-rma-1', producto: 'Audífonos inalámbricos', motivo: 'No encienden', estado: 'Requested' },
    { ...base, rmaId: 'demo-rma-2', producto: 'Funda de silicona', motivo: 'Color equivocado', estado: 'Received' },
    { ...base, rmaId: 'demo-rma-3', producto: 'Cargador USB-C', motivo: 'Llegó roto', estado: 'Approved' },
  ];
}

function mockReturns(): readonly SellerReturn[] {
  return [
    {
      rmaId: 'RMA-2026-0043',
      orderNumber: 'ORD-2026-00481',
      productTitle: 'Audífonos Sony WH-1000XM5',
      reason: 'Producto llegó con el estuche rayado',
      date: '2026-06-30',
      status: 'abierto',
    },
    {
      rmaId: 'RMA-2026-0041',
      orderNumber: 'ORD-2026-00470',
      productTitle: 'Mouse Logitech MX Master 3S',
      reason: 'No era el color esperado',
      date: '2026-06-26',
      status: 'en-revision',
    },
    {
      rmaId: 'RMA-2026-0038',
      orderNumber: 'ORD-2026-00455',
      productTitle: 'Parlante Sony SRS-XB23',
      reason: 'Defecto de fábrica en el botón de encendido',
      date: '2026-06-20',
      status: 'aprobado',
    },
  ];
}
