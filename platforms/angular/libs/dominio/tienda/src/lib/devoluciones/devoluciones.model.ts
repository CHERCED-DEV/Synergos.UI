/** Las devoluciones: el motivo, el reclamo y cómo avanza (014-despiece-tienda, T008). */

/**
 * Por qué se devuelve (#32).
 *
 * **Es un enum y no texto libre**, porque es lo que ORDENA la cola del vendedor:
 * «llegó dañado» es garantía y «cambié de opinión» es retracto, y son dos
 * negocios distintos con dos plazos distintos. Antes viajaba un literal fijo
 * —`'solicitud-comprador'`— así que los veinte reclamos decían lo mismo y la
 * cola era inatendible.
 */
export type ReturnReason = 'damaged' | 'defective' | 'not-as-described' | 'changed-mind';

/** El estado del reclamo en el vocabulario que emite el borde. */
export type ReturnStatus = 'abierto' | 'en-revision' | 'resuelto' | 'rechazado';

/** Un reclamo de devolución, tal como lo devuelve el borde. */
export interface ReturnCase {
  readonly claimId: string;
  readonly orderRef: string;
  /** `productId` o `productId/variantId` — lo compone el servidor. */
  readonly lineRef: string;
  readonly productName: string;
  readonly quantity: number;
  /** Ya formateado por el servidor: la UI no calcula dinero. */
  readonly refundAmountFormatted: string;
  /** El motivo tal cual lo guardó el servidor. */
  readonly reason: string;
  readonly status: ReturnStatus;
  readonly requestedAt: string;
  readonly updatedAt: string;
  readonly note?: string;
}

/**
 * Resultado de pedir una devolución.
 *
 * **Tipado y sin degradar a mock**: el cliente inventaba un `claimId` cuando el
 * POST fallaba, así que el comprador se iba con un número de reclamo que no
 * existe en ninguna parte — y cuando reclame por él, nadie lo encontrará. Regla
 * 4 de `CLAUDE.md` sobre una escritura con dinero detrás.
 */
export type ReturnRequestResult =
  | { readonly ok: true; readonly claim: ReturnCase }
  | {
      readonly ok: false;
      readonly reason: 'unauthenticated' | 'forbidden' | 'not-found' | 'invalid' | 'failed';
      /** Lo que dijo el servidor, cuando lo dijo. Se enseña tal cual. */
      readonly detail?: string;
    };

/** A qué estado mueve el vendedor un reclamo. El vocabulario es el del borde. */
export type ReturnAdvance = 'approved' | 'rejected' | 'received' | 'refunded';

/** Resultado de avanzar un reclamo. Tampoco degrada: `refunded` mueve dinero. */
export type ReturnAdvanceResult =
  | { readonly ok: true; readonly claim: ReturnCase }
  | {
      readonly ok: false;
      readonly reason: 'unauthenticated' | 'forbidden' | 'not-found' | 'illegal' | 'failed';
      readonly detail?: string;
    };

/** `POST /api/shop/order/{ref}/return` response — a claim was opened. */
export interface ReturnReceipt {
  readonly claimId: string;
  readonly status: 'abierto' | 'en-revision' | 'resuelto';
}
