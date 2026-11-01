import { Injectable, computed, inject, signal } from '@angular/core';
import { CatalogoDeLaTienda } from '../catalogo/catalogo';
import type { ShopProduct } from '../catalogo/catalogo.model';
import { AvisosDeLaTienda } from '../comun/avisos';
import { ConfiguracionDeLaTienda } from '../comun/configuracion';
import { TEXTOS_DE_LA_TIENDA } from '../comun/textos';
import { DeseosApi } from './deseos-api.client';
import type { WishlistEntry } from './deseos.model';

/**
 * La lista de deseos de quien compra (014-despiece-tienda, T008): se pinta en optimista, la reconcilia el servidor, y
 * si no la guardó vuelve a como estaba y se dice (UI#92).
 */
@Injectable()
export class DeseosDeLaTienda {
  readonly #api = inject(DeseosApi);
  readonly #config = inject(ConfiguracionDeLaTienda);
  readonly #catalogo = inject(CatalogoDeLaTienda);
  readonly #avisos = inject(AvisosDeLaTienda);
  readonly #textos = inject(TEXTOS_DE_LA_TIENDA);

  readonly wishlist = signal<readonly WishlistEntry[]>([]);
  readonly wishlistLoaded = signal(false);
  readonly wishedIds = computed(() => new Set(this.wishlist().map((entry) => entry.productId)));

  isWished(productId: string): boolean {
    return this.wishedIds().has(productId);
  }

  toggleWishlist(product: ShopProduct): void {
    const entry: WishlistEntry = {
      productId: product.id,
      title: product.title,
      amount: product.amount,
      currency: product.currency || this.#catalogo.currency(),
      image: product.images[0],
    };
    const action = this.isWished(product.id) ? 'remove' : 'add';
    const before = this.wishlist().find((line) => line.productId === product.id) ?? null;
    // Optimistic update; the server's list reconciles after — or the failure reverts it.
    this.wishlist.update((list) => {
      const without = list.filter((line) => line.productId !== product.id);
      return action === 'add' ? [...without, entry] : without;
    });
    this.wishlistLoaded.set(true);
    this.#avisos.errorMessage.set('');
    void this.#api
      .wishlistMutate(this.#config.apiBase(), entry, action)
      .then((list) => this.wishlist.set(list))
      .catch(() => this.revertWish(product.id, before));
  }

  removeWishlistEntry(entry: WishlistEntry): void {
    const before = this.wishlist().find((line) => line.productId === entry.productId) ?? null;
    this.wishlist.update((list) => list.filter((line) => line.productId !== entry.productId));
    this.#avisos.errorMessage.set('');
    void this.#api
      .wishlistMutate(this.#config.apiBase(), entry, 'remove')
      .then((list) => this.wishlist.set(list))
      .catch(() => this.revertWish(entry.productId, before));
  }

  /**
   * El servidor no guardó el cambio (UI#92): ESE producto vuelve a como estaba —sin tocar
   * los demás, que pudieron cambiar entretanto— y se dice. Antes el cliente devolvía su
   * «lista local» como si fuera la guardada, y el favorito desaparecía al volver otro día.
   */
  private revertWish(productId: string, before: WishlistEntry | null): void {
    this.wishlist.update((list) => {
      const without = list.filter((line) => line.productId !== productId);
      return before ? [...without, before] : without;
    });
    this.#avisos.errorMessage.set(this.#textos.favoritoNoGuardado);
  }

  loadWishlist(): void {
    if (this.wishlistLoaded()) {
      return;
    }
    void this.#api.wishlist(this.#config.apiBase(), this.#catalogo.currency(), this.#config.lecturasBase()).then((list) => {
      this.wishlist.set(list);
      this.wishlistLoaded.set(true);
    });
  }
}
