/** El carrito de la tienda sobre el motor de transacciones, y su cupón (014-despiece-tienda, T008). */

import type { SessionItemKind } from '@synergos/transaction-engine';

/** The flow id the engine routes on — one strategy owns it. */
export const STOREFRONT_FLOW = 'storefront';

/** Every storefront cart line is a `product` kind for the engine. */
export const STOREFRONT_KIND: SessionItemKind = 'product';

// ─── Cupones y descuentos (#29) ──────────────────────────────────────────────

/**
 * Un cupón aceptado por el servidor.
 *
 * `amountMinor` es NEGATIVO: entra tal cual como `PriceLine` del `breakdown`, que
 * el motor documenta como «can be negative for discounts» desde el primer día y
 * que ningún dominio había usado nunca.
 */
export interface ShopPromo {
  readonly code: string;
  /** Negativo, en unidades menores. */
  readonly amountMinor: number;
  /** Cómo se llama el descuento en el resumen: «Cupón BIENVENIDA10». */
  readonly label: string;
  /** Contexto opcional: «Válido hasta el 30 de septiembre». */
  readonly detail?: string;
}

/**
 * Resultado de validar un cupón. **Tipado y sin degradar a mock**: un descuento
 * fingido en el cliente es una promesa de plata que el checkout va a romper, y el
 * peor momento para descubrirlo es al pagar (regla 4 de `CLAUDE.md`).
 *
 * `shortfallMinor` sólo viaja con `minimum-not-met`, porque CUÁNTO FALTA es lo
 * único accionable de ese rechazo — decir «no llegas al mínimo» sin el número
 * deja a quien compra adivinando.
 */
export type ShopPromoResult =
  | { readonly ok: true; readonly promo: ShopPromo }
  | {
      readonly ok: false;
      readonly reason:
        | 'unknown'
        | 'expired'
        | 'minimum-not-met'
        | 'not-applicable'
        | 'already-used'
        | 'failed';
      readonly shortfallMinor?: number;
    };

/**
 * Por qué no se aplicó un cupón: lo que dijo el servidor por la ruta directa, o, por la puerta, que se probaron
 * demasiados códigos que no sirven.
 */
export type MotivoDelCupon = Extract<ShopPromoResult, { readonly ok: false }>['reason'] | 'too-many-attempts';

/** Typed event map for the transaction bus (storefront ↔ cart ↔ checkout ↔ IA). */
export interface BusDeLaTienda extends Record<string, unknown> {
  readonly cartUpdated: { readonly count: number; readonly total: number };
  readonly orderconfirmed: { readonly orderRef: string; readonly orderNumber: string };
}
