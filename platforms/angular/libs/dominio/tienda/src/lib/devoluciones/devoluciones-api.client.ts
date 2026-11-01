import { Injectable, inject } from '@angular/core';
import { esRegistro, leerJsonDelBorde, leerNumero, leerTexto, llamarAlBorde } from '@synergos/core';
import { LecturasDeLaTienda } from '../comun/lecturas';
import type {
  ReturnAdvance,
  ReturnAdvanceResult,
  ReturnCase,
  ReturnReason,
  ReturnRequestResult,
  ReturnStatus,
} from './devoluciones.model';

/**
 * Las devoluciones: pedir la de una línea, leer las de un pedido y moverlas desde el lado del vendedor (#32). Pedir y
 * mover son escrituras con plata detrás y no degradan; leer las de un pedido devuelve `null` si no se pudo.
 */
@Injectable({ providedIn: 'root' })
export class DevolucionesApi {
  readonly #lecturas: LecturasDeLaTienda = inject(LecturasDeLaTienda);

  // ─── Returns (devoluciones / reclamos) ───────────────────────────────────────

  /**
   * Pide la devolución de UNA LÍNEA de un pedido (#32).
   *
   * **Manda `lineId`, que es lo que faltaba.** El borde lo exige junto al motivo
   * (`ShopCatalogController:746`) y esta llamada enviaba sólo `{ reason }`, así
   * que contestaba `400` — *siempre*. Y no se notaba porque el `catch` inventaba
   * un `claimId` local y devolvía «abierto»: la devolución **nunca funcionó** y
   * el mock lo tapó entero. Es la regla 4 de `CLAUDE.md` en su forma más cara,
   * porque el comprador se llevaba un número de reclamo que no existe en ninguna
   * parte.
   *
   * Por eso ahora **no degrada**: un fallo se dice.
   */
  async requestReturn(
    apiBase: string,
    orderRef: string,
    lineId: string,
    reason: ReturnReason,
  ): Promise<ReturnRequestResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }
    const url = `${apiBase}/order/${encodeURIComponent(orderRef)}/return`;
    try {
      const response = await llamarAlBorde(apiBase, url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineId, reason }),
      });
      if (response.ok) {
        const claim = normalizeReturnCase(await response.json());
        // Un 200 con una forma que no se entiende NO es un reclamo abierto:
        // decir que sí dejaría al comprador sin nada y creyendo que sí.
        return claim ? { ok: true, claim } : { ok: false, reason: 'failed' };
      }
      return {
        ok: false,
        reason: RETURN_REQUEST_REASONS[response.status] ?? 'failed',
        detail: await readErrorDetail(response),
      };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }

  /**
   * Los reclamos de un pedido (#32).
   *
   * **Devuelve `null` cuando no se pudo leer, y eso NO es lo mismo que «no hay
   * ninguno».** Con una lista vacía en el fallo, la pantalla volvería a ofrecer
   * «Iniciar devolución» sobre un pedido que ya tiene una abierta, y el comprador
   * abriría un segundo reclamo. Es el defecto que esta HU vino a cerrar.
   */
  async orderReturns(apiBase: string, orderRef: string): Promise<readonly ReturnCase[] | null> {
    const url = `${apiBase}/order/${encodeURIComponent(orderRef)}/return`;
    try {
      const data = await leerJsonDelBorde(apiBase, url);
      const raw = esRegistro(data) && Array.isArray(data['returns']) ? data['returns'] : [];
      return raw
        .map((entry) => normalizeReturnCase(entry))
        .filter((entry): entry is ReturnCase => entry !== null);
    } catch (error) {
      this.#lecturas.markDegraded('GET /api/shop/order/{ref}/return', error);
      return null;
    }
  }

  /**
   * El vendedor mueve un reclamo de estado (#32).
   *
   * El endpoint existía desde siempre y **no lo llamaba nadie**. Tampoco degrada:
   * llegar a `refunded` dispara un reembolso de verdad, así que decir «listo»
   * cuando el POST falló sería prometer plata que no se movió.
   */
  async advanceReturn(
    apiBase: string,
    rmaId: string,
    status: ReturnAdvance,
    note?: string,
  ): Promise<ReturnAdvanceResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }
    const url = `${apiBase}/return/${encodeURIComponent(rmaId)}/advance`;
    try {
      const response = await llamarAlBorde(apiBase, url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(note ? { status, note } : { status }),
      });
      if (response.ok) {
        const claim = normalizeReturnCase(await response.json());
        return claim ? { ok: true, claim } : { ok: false, reason: 'failed' };
      }
      return {
        ok: false,
        reason: RETURN_ADVANCE_REASONS[response.status] ?? 'failed',
        detail: await readErrorDetail(response),
      };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }
}

/**
 * Qué significa cada código al pedir una devolución (#32).
 *
 * `400` es `invalid` y no `failed` porque el borde manda el motivo en `{ error }`
 * —«La línea X no está en la orden», «Solo se puede devolver sobre una orden
 * pagada»— y esa frase le sirve a quien compró. `failed` es «no sabemos».
 */
const RETURN_REQUEST_REASONS: Readonly<
  Record<number, 'unauthenticated' | 'forbidden' | 'not-found' | 'invalid' | 'failed'>
> = {
  400: 'invalid',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not-found',
};

/** Al avanzar, un `400` es una transición ilegal: el borde nombra cuál. */
const RETURN_ADVANCE_REASONS: Readonly<
  Record<number, 'unauthenticated' | 'forbidden' | 'not-found' | 'illegal' | 'failed'>
> = {
  400: 'illegal',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not-found',
};

/** Los estados del reclamo que emite el borde, en su vocabulario. */
const RETURN_STATUSES: readonly ReturnStatus[] = [
  'abierto',
  'en-revision',
  'resuelto',
  'rechazado',
];

export function normalizeReturnCase(value: unknown): ReturnCase | null {
  if (!esRegistro(value)) {
    return null;
  }
  const claimId = leerTexto(value['claimId']).trim() || leerTexto(value['rmaId']).trim();
  if (!claimId) {
    return null;
  }
  const statusRaw = leerTexto(value['status']).trim().toLowerCase();
  return {
    claimId,
    orderRef: leerTexto(value['orderRef']).trim(),
    lineRef: leerTexto(value['lineRef']).trim(),
    productName: leerTexto(value['productName']).trim() || 'Producto',
    quantity: Math.max(1, Math.trunc(leerNumero(value['quantity'])) || 1),
    // Ya formateado por el servidor. Si no lo mandó se queda vacío en vez de
    // inventar un número: la UI no calcula dinero (#22, #29).
    refundAmountFormatted: leerTexto(value['refundAmountFormatted']).trim(),
    reason: leerTexto(value['reason']).trim(),
    // Un estado desconocido cae a `abierto`, que es el conservador: dar por
    // resuelto lo que no se entiende cerraría un reclamo vivo en pantalla.
    status: RETURN_STATUSES.includes(statusRaw as ReturnStatus)
      ? (statusRaw as ReturnStatus)
      : 'abierto',
    requestedAt: leerTexto(value['requestedAt']).trim(),
    updatedAt: leerTexto(value['updatedAt']).trim(),
    note: leerTexto(value['note']).trim() || undefined,
  };
}

/** El texto que el borde manda en `{ error }`. Se enseña tal cual: lo escribió él. */
async function readErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    return esRegistro(body) ? leerTexto(body['error']).trim() || undefined : undefined;
  } catch {
    return undefined;
  }
}
