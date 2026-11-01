import { Injectable, inject } from '@angular/core';
import { enviarJsonAlBorde, esRegistro, leerNumero, leerTexto } from '@synergos/core';
import { rechazoLocal, transportePorDefecto, type ResultadoDelFlujo } from '@synergos/vitals-core';
import { LecturasDeLaTienda } from '../comun/lecturas';
import type {
  CheckoutLine,
  CheckoutResult,
  CompraPendienteDelServidor,
  LineaDeLaOrdenDeLaPuerta,
  OrdenDeLaPuerta,
  OrderConfirmation,
  ShopCustomer,
} from './compra.model';

/**
 * La compra por sus dos caminos: la ruta directa (`POST /checkout` y `POST /confirm`) y el registro en el CMS de una
 * compra de la puerta (`/compras/…`, 004-tienda-compra). Escrituras con plata detrás: ninguna degrada (UI#92).
 */
@Injectable({ providedIn: 'root' })
export class CompraApi {
  readonly #lecturas: LecturasDeLaTienda = inject(LecturasDeLaTienda);

  // ─── Checkout (single payment for the whole cart) ────────────────────────────

  /**
   * Abre la orden y su sesión de pago. **Lanza si el borde no la abrió** (UI#92).
   *
   * **Sin `fallbackAmount`**: era la fabricación escrita en la firma (regla 19) — el total
   * lo calcula el borde desde el catálogo, justamente para no confiarle el precio al
   * navegador.
   */
  async checkout(
    apiBase: string,
    lines: readonly CheckoutLine[],
    customer: ShopCustomer,
    currency: string,
  ): Promise<CheckoutResult> {
    const url = `${apiBase}/checkout`;
    try {
      const data = await enviarJsonAlBorde(apiBase, url, { items: lines, customer });
      const result = normalizeCheckout(data, currency);
      if (result) {
        return result;
      }
      throw new Error('checkout-shape');
    } catch (error) {
      this.#lecturas.writeFailed('POST /api/shop/checkout', error);
    }
  }

  // ─── Confirm (place the order) ───────────────────────────────────────────────

  /**
   * Coloca el pedido capturando el pago. **Lanza si el borde no lo colocó** (UI#92).
   *
   * Devolvía `{ status: 'confirmed', orderNumber: <la orden inventada> }` con una línea por
   * artículo: el comprador salía con un número de pedido que el CMS no tiene. **Sin
   * `fallbackLines`**: sólo servían para fabricar ese pedido (regla 19). Reconfirmar la
   * misma `orderRef` es lo que el asistente repite al reintentar, sin volver a cobrar.
   */
  async confirm(apiBase: string, orderRef: string): Promise<OrderConfirmation> {
    const url = `${apiBase}/confirm`;
    try {
      const data = await enviarJsonAlBorde(apiBase, url, { orderRef });
      const confirmation = normalizeConfirmation(data);
      if (confirmation) {
        return confirmation;
      }
      throw new Error('confirm-shape');
    } catch (error) {
      this.#lecturas.writeFailed('POST /api/shop/confirm', error);
    }
  }

  // ─── La compra por la puerta: su registro en el CMS (004-tienda-compra, US 6) ────
  //
  // La compra la abre y la cierra la PUERTA (`tienda-compra.ts`); estas tres rutas son de lo que el CMS
  // agrega para que «Mis compras», el seguimiento, la devolución y las reseñas la vean. Contestan como la
  // puerta —problem+json con `code`— y nada se inventa: una respuesta sin su forma es un rechazo
  // `cliente.respuesta_ilegible`, no una orden vacía.

  readonly #transporte = transportePorDefecto();

  /**
   * `POST {apiBase}/compras/{id}/anotar` — tras abrir: la compra en curso queda como orden PENDIENTE del
   * miembro. Si no llega, la orden se anota pagada al leerla tras cerrar: anotar es para que una compra
   * abandonada también se vea, no para poder cerrar.
   */
  async anotarCompra(apiBase: string, id: string): Promise<ResultadoDelFlujo<unknown>> {
    if (!apiBase) {
      return { ok: false, correlacion: '', rechazo: rechazoLocal('cliente.sin_api', 'sin la base de la API') };
    }
    return this.#transporte({
      metodo: 'POST',
      url: `${apiBase}/compras/${encodeURIComponent(id)}/anotar`,
      cabeceras: {},
      etiqueta: 'tienda/anotar',
    });
  }

  /**
   * `GET {apiBase}/compras/{id}` — la orden de una compra de la puerta del miembro, con sus líneas y sus
   * nombres: la confirmación y el enlace del aviso la pintan. Leerla tras cerrar es lo que la pasa a pagada.
   */
  async compraDeLaPuerta(apiBase: string, id: string): Promise<ResultadoDelFlujo<OrdenDeLaPuerta>> {
    if (!apiBase) {
      return { ok: false, correlacion: '', rechazo: rechazoLocal('cliente.sin_api', 'sin la base de la API') };
    }
    const r = await this.#transporte({
      metodo: 'GET',
      url: `${apiBase}/compras/${encodeURIComponent(id)}`,
      cabeceras: {},
      etiqueta: 'tienda/compra',
    });
    if (!r.ok) {
      return r;
    }
    const orden = normalizeOrdenDeLaPuerta(r.valor);
    return orden
      ? { ...r, valor: orden }
      : {
          ok: false,
          correlacion: r.correlacion,
          rechazo: rechazoLocal('cliente.respuesta_ilegible', 'la compra no trae la forma esperada', false, 'forma', r.estado),
        };
  }

  /**
   * `GET {apiBase}/compras/pendientes` — las compras de la puerta del miembro que el servidor conoce sin
   * resolver: abiertas en otro dispositivo, o antes de borrar los datos del sitio. Antes de abrir otra.
   */
  async comprasPendientes(apiBase: string): Promise<ResultadoDelFlujo<readonly CompraPendienteDelServidor[]>> {
    if (!apiBase) {
      return { ok: false, correlacion: '', rechazo: rechazoLocal('cliente.sin_api', 'sin la base de la API') };
    }
    const r = await this.#transporte({ metodo: 'GET', url: `${apiBase}/compras/pendientes`, cabeceras: {}, etiqueta: 'tienda/pendientes' });
    if (!r.ok) {
      return r;
    }
    const compras = normalizeComprasPendientes(r.valor);
    return compras
      ? { ...r, valor: compras }
      : {
          ok: false,
          correlacion: r.correlacion,
          rechazo: rechazoLocal('cliente.respuesta_ilegible', 'las compras pendientes no traen la forma esperada', false, 'forma', r.estado),
        };
  }
}

function normalizeCheckout(value: unknown, fallbackCurrency: string): CheckoutResult | null {
  if (!esRegistro(value)) {
    return null;
  }
  const orderRef = leerTexto(value['orderRef']).trim() || leerTexto(value['id']).trim();
  const paymentSessionId =
    leerTexto(value['paymentSessionId']).trim() || leerTexto(value['sessionId']).trim();
  if (!orderRef || !paymentSessionId) {
    return null;
  }
  return {
    orderRef,
    paymentSessionId,
    amount: leerNumero(value['amount']),
    currency: leerTexto(value['currency']).trim() || fallbackCurrency,
  };
}

function normalizeConfirmation(value: unknown): OrderConfirmation | null {
  if (!esRegistro(value)) {
    return null;
  }
  const orderNumber = leerTexto(value['orderNumber']).trim() || leerTexto(value['code']).trim();
  if (!orderNumber) {
    return null;
  }
  const rawItems = Array.isArray(value['items']) ? value['items'] : [];
  return {
    status: leerTexto(value['status']).trim() || 'confirmed',
    orderNumber,
    items: rawItems
      .map((entry) => {
        if (!esRegistro(entry)) {
          return null;
        }
        const title = leerTexto(entry['title']).trim() || leerTexto(entry['name']).trim();
        if (!title) {
          return null;
        }
        return {
          productId: leerTexto(entry['productId']).trim(),
          title,
          qty: Math.max(1, Math.trunc(leerNumero(entry['qty']))),
          reference: leerTexto(entry['reference']).trim() || orderNumber,
        };
      })
      .filter((entry): entry is OrderConfirmation['items'][number] => entry !== null),
  };
}

/** La orden de una compra de la puerta, o `null` si no trae su forma (nada se rellena). */
function normalizeOrdenDeLaPuerta(value: unknown): OrdenDeLaPuerta | null {
  if (!esRegistro(value) || !Array.isArray(value['items'])) {
    return null;
  }
  const orderRef = leerTexto(value['orderRef']);
  const orderNumber = leerTexto(value['orderNumber']);
  const status = leerTexto(value['status']);
  const total = value['total'];
  const currency = leerTexto(value['currency']);
  if (!orderRef || !orderNumber || !status || typeof total !== 'number' || !currency) {
    return null;
  }
  const items: LineaDeLaOrdenDeLaPuerta[] = [];
  for (const item of value['items'] as unknown[]) {
    if (!esRegistro(item) || !leerTexto(item['productId']) || typeof item['qty'] !== 'number') {
      return null;
    }
    const variante = leerTexto(item['variantId']);
    items.push({
      productId: leerTexto(item['productId']),
      variantId: variante || null,
      title: leerTexto(item['title']) || leerTexto(item['productId']),
      qty: item['qty'],
      unitPrice: leerNumero(item['unitPrice']),
      lineTotal: leerNumero(item['lineTotal']),
    });
  }
  return { orderRef, orderNumber, status, total, currency, items };
}

/** Las compras pendientes, o `null` si la respuesta no trae su forma. */
function normalizeComprasPendientes(value: unknown): readonly CompraPendienteDelServidor[] | null {
  if (!esRegistro(value) || !Array.isArray(value['compras'])) {
    return null;
  }
  const compras: CompraPendienteDelServidor[] = [];
  for (const c of value['compras'] as unknown[]) {
    if (!esRegistro(c) || !leerTexto(c['id'])) {
      return null;
    }
    compras.push({
      id: leerTexto(c['id']),
      numero: leerTexto(c['numero']),
      total: leerNumero(c['total']),
      moneda: leerTexto(c['moneda']),
      estado: leerTexto(c['estado']),
    });
  }
  return compras;
}
