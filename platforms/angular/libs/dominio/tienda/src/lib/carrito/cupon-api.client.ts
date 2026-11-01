import { Injectable } from '@angular/core';
import { esRegistro, leerNumero, leerTexto, llamarAlBorde } from '@synergos/core';
import type { ShopPromo, ShopPromoResult } from './carrito.model';

/** El cupón del carrito: lo valida el servidor contra el subtotal (#29). */
@Injectable({ providedIn: 'root' })
export class CuponApi {
  /**
   * `POST /{apiBase}/promo` — valida un cupón contra el carrito (#29).
   *
   * **No degrada a mock.** Un descuento inventado del lado del cliente es una
   * promesa de plata que el checkout va a romper; el peor momento para descubrirlo
   * es al pagar. Si el endpoint no responde, esto contesta `failed` y la pantalla
   * lo dice.
   */
  async applyPromo(
    apiBase: string,
    code: string,
    subtotalMinor: number,
  ): Promise<ShopPromoResult> {
    if (typeof fetch !== 'function') {
      return { ok: false, reason: 'failed' };
    }
    try {
      const response = await llamarAlBorde(apiBase, `${apiBase}/promo`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotalMinor }),
      });

      if (response.ok) {
        const data: unknown = await response.json();
        const promo = normalizePromo(data, code);
        // Una respuesta 200 que no trae un descuento utilizable NO es un cupón
        // aplicado: decir que sí dejaría el total sin cambiar y al comprador
        // creyendo que ahorró.
        return promo ? { ok: true, promo } : { ok: false, reason: 'unknown' };
      }

      if (response.status === 409) {
        return { ok: false, reason: 'already-used' };
      }
      if (response.status === 410) {
        return { ok: false, reason: 'expired' };
      }
      if (response.status === 404) {
        return { ok: false, reason: 'unknown' };
      }
      if (response.status === 422) {
        // El servidor dice por qué no aplica, y cuánto falta si es el mínimo.
        const data: unknown = await response.json().catch(() => null);
        const motivo = esRegistro(data) ? leerTexto(data['reason']).trim() : '';
        if (motivo === 'minimum-not-met') {
          const falta = esRegistro(data) ? leerNumero(data['shortfallMinor']) : 0;
          return { ok: false, reason: 'minimum-not-met', shortfallMinor: Math.max(0, falta) };
        }
        return { ok: false, reason: 'not-applicable' };
      }
      return { ok: false, reason: 'failed' };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }
}

/** El cupón que devuelve el servidor. Sin descuento utilizable, no hay cupón. */
function normalizePromo(value: unknown, fallbackCode: string): ShopPromo | null {
  if (!esRegistro(value)) {
    return null;
  }
  const source = esRegistro(value['promo']) ? (value['promo'] as Record<string, unknown>) : value;
  const raw = leerNumero(source['amountMinor'] ?? source['discountMinor']);
  if (!Number.isFinite(raw) || raw === 0) {
    return null;
  }
  // Se fuerza el signo: un backend que mande el descuento en positivo SUMARÍA al
  // total, y el error se vería como un cargo sorpresa.
  const amountMinor = -Math.abs(Math.round(raw));
  const code = leerTexto(source['code']).trim().toUpperCase() || fallbackCode.toUpperCase();
  const detail = leerTexto(source['detail']).trim();
  return {
    code,
    amountMinor,
    label: leerTexto(source['label']).trim() || `Cupón ${code}`,
    ...(detail ? { detail } : {}),
  };
}
