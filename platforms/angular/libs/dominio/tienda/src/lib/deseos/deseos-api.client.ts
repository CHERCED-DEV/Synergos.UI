import { Injectable, inject } from '@angular/core';
import { enviarJsonAlBorde, esRegistro, leerJsonDelBorde, leerNumero, leerTexto } from '@synergos/core';
import { LecturasDeLaTienda } from '../comun/lecturas';
import type { WishlistEntry } from './deseos.model';

/** La lista de deseos de quien compra (`GET` y `POST /wishlist`). */
@Injectable({ providedIn: 'root' })
export class DeseosApi {
  readonly #lecturas: LecturasDeLaTienda = inject(LecturasDeLaTienda);

  // ─── Wishlist (favoritos / listas) ───────────────────────────────────────────

  async wishlist(apiBase: string, currency: string): Promise<readonly WishlistEntry[]> {
    const url = `${apiBase}/wishlist`;
    try {
      const data = await leerJsonDelBorde(apiBase, url);
      const entries = normalizeWishlist(data, currency);
      if (entries) {
        return entries;
      }
      throw new Error('wishlist-shape');
    } catch (error) {
      this.#lecturas.markDegraded('GET /api/shop/wishlist', error);
      return this.#localWishlist;
    }
  }

  /**
   * Añade o quita un favorito y devuelve la lista AUTORITATIVA del servidor. **Lanza si el
   * borde no la guardó** (UI#92): la «lista local» que devolvía era la intención del
   * comprador presentada como lo guardado, y al volver otro día el favorito no estaba.
   * Quien llama revierte lo que pintó en optimista.
   */
  async wishlistMutate(
    apiBase: string,
    entry: WishlistEntry,
    action: 'add' | 'remove',
  ): Promise<readonly WishlistEntry[]> {
    const url = `${apiBase}/wishlist`;
    try {
      const data = await enviarJsonAlBorde(apiBase, url, { productId: entry.productId, action });
      const entries = normalizeWishlist(data, entry.currency);
      if (entries) {
        this.#localWishlist = entries;
        return entries;
      }
      throw new Error('wishlist-shape');
    } catch (error) {
      this.#lecturas.writeFailed('POST /api/shop/wishlist', error);
    }
  }

  /**
   * La última lista que el SERVIDOR devolvió en esta sesión: es lo que la lectura enseña
   * si después se cae. Nunca lleva una escritura que no llegó (UI#92).
   */
  #localWishlist: readonly WishlistEntry[] = [];
}

function normalizeWishlist(
  value: unknown,
  fallbackCurrency: string,
): readonly WishlistEntry[] | null {
  const list = Array.isArray(value)
    ? value
    : esRegistro(value) && Array.isArray(value['items'])
      ? value['items']
      : null;
  if (!list) {
    return null;
  }
  return list
    .map((entry): WishlistEntry | null => {
      if (!esRegistro(entry)) {
        return null;
      }
      const productId = leerTexto(entry['productId']).trim() || leerTexto(entry['id']).trim();
      const title = leerTexto(entry['title']).trim();
      if (!productId || !title) {
        return null;
      }
      const image = leerTexto(entry['image']).trim();
      return {
        productId,
        title,
        amount: leerNumero(entry['amount'] ?? entry['price']),
        currency: leerTexto(entry['currency']).trim() || fallbackCurrency,
        image: image || undefined,
      };
    })
    .filter((entry): entry is WishlistEntry => entry !== null);
}
