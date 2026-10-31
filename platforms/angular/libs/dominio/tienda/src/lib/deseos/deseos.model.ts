/** La lista de deseos de quien compra (014-despiece-tienda, T008). */

/** One saved product from `GET /api/shop/wishlist`. */
export interface WishlistEntry {
  readonly productId: string;
  readonly title: string;
  /** Price in major units. */
  readonly amount: number;
  readonly currency: string;
  readonly image?: string;
}
