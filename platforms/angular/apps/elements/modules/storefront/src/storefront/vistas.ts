/**
 * Las vistas de `<synergos-storefront>` y quién las mira: son de la app, no del dominio (014-despiece-tienda, T008).
 * El modelo de la tienda vive en `@synergos/dominio/tienda`.
 */

/** The high-level phase / route the storefront is in (hash deep-linkable). */
export type StorefrontView =
  | 'home' // marketplace home: deals + featured categories
  | 'plp' // search results / category listing (SH-1)
  | 'pdp' // product detail (SH-2)
  | 'cart'
  | 'checkout' // SH-3 over the engine
  | 'confirmation'
  | 'account' // SH-4: mis compras + tracking + wishlist + mensajes + perfil
  | 'seller'; // SH-5: la cara B del vendedor (#32)

/** Quién está mirando: comprador (cara A) o vendedor (cara B). */
export type ShopRole = 'buyer' | 'seller';

/** Secciones de la consola del vendedor (#32). */
export type SellerView =
  | 'orders' // pedidos por atender
  | 'returns' // devoluciones: la cola que el endpoint `advance` esperaba
  | 'reviews' // la cola de moderación de #31, que se quedó sin sitio
  | 'messages'; // hilos con compradores

/** Account sections rendered inside SH-4. */
export type AccountSectionId = 'compras' | 'favoritos' | 'mensajes' | 'perfil';
