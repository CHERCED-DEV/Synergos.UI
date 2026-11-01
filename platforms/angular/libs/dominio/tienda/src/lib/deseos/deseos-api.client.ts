import { Injectable, inject } from '@angular/core';
import { enviarJsonAlBorde, esRegistro, leerJsonDelBorde, leerNumero, leerTexto } from '@synergos/core';
import { LecturasDeLaTienda } from '../comun/lecturas';
import type { WishlistEntry } from './deseos.model';

/** La lista de deseos de quien compra (`GET` y `POST /wishlist`). */
/**
 * La colección genérica (014-despiece-tienda, I4). Lo que el catálogo ya no tiene sale con su id y sin precio, como
 * en la interina: se muestra que estaba, no se inventa.
 */
function leerColeccion(value: unknown, monedaPorDefecto: string): readonly WishlistEntry[] | null {
  if (!esRegistro(value) || !Array.isArray(value['elementos'])) {
    return null;
  }
  return value['elementos']
    .map((entry): WishlistEntry | null => {
      if (!esRegistro(entry)) {
        return null;
      }
      const productId = leerTexto(entry['id']).trim();
      if (!productId) {
        return null;
      }
      const elemento = esRegistro(entry['elemento']) ? entry['elemento'] : {};
      const precio = esRegistro(elemento['precio']) ? elemento['precio'] : {};
      const image = leerTexto(elemento['imagen']).trim();
      return {
        productId,
        title: leerTexto(elemento['titulo']).trim() || productId,
        amount: leerNumero(precio['monto']),
        currency: leerTexto(precio['moneda']).trim() || monedaPorDefecto,
        image: image || undefined,
      };
    })
    .filter((entry): entry is WishlistEntry => entry !== null);
}

/** La colección de la tienda que es la lista de deseos (la de `IUserCollection`). */
const COLECCION_DE_DESEOS = 'wishlist';

@Injectable({ providedIn: 'root' })
export class DeseosApi {
  readonly #lecturas: LecturasDeLaTienda = inject(LecturasDeLaTienda);

  // ─── Wishlist (favoritos / listas) ───────────────────────────────────────────

  /**
   * La lista de deseos. Con `lecturasBase`, la colección genérica (`GET {lecturasBase}/colecciones/wishlist`,
   * 014-despiece-tienda, I4), con cada producto del catálogo; sin ella, la ruta interina de siempre.
   */
  async wishlist(apiBase: string, currency: string, lecturasBase = ''): Promise<readonly WishlistEntry[]> {
    const url = `${apiBase}/wishlist`;
    const endpoint = lecturasBase ? 'GET /api/lecturas/{vertical}/colecciones/{coleccion}' : 'GET /api/shop/wishlist';
    try {
      const entries = lecturasBase
        ? leerColeccion(await leerJsonDelBorde(lecturasBase, `${lecturasBase}/colecciones/${COLECCION_DE_DESEOS}`), currency)
        : normalizeWishlist(await leerJsonDelBorde(apiBase, url), currency);
      if (entries) {
        return entries;
      }
      throw new Error('wishlist-shape');
    } catch (error) {
      this.#lecturas.markDegraded(endpoint, error);
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
