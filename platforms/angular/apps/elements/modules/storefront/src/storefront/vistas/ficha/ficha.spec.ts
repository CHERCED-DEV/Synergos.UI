import { ComponentFixture, StorefrontElementComponent, bordeDeLaTienda, flushMicrotasks, installMemoryStorage, prepararLaTienda } from '../../arnes-de-la-tienda.test';

/**
 * La tienda montada entera, por la ficha: la variante, el carrito y el favorito (014-despiece-tienda, T013). Las
 * pruebas son las de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La tienda: la ficha', () => {
  let fixture: ComponentFixture<StorefrontElementComponent>;
  const { tienda, createComponent, alertas } = prepararLaTienda((montado) => {
    fixture = montado;
  });

  // ── PDP (SH-2): open product, switch variant, qty, add, wishlist toggle ──────
  it('opens the PDP, adds the selected variant and toggles wishlist once (SH-2 case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeLaTienda().fetchDoble);
    await createComponent();

    const first = tienda().catalogo.products()[0];
    tienda().navegacion.openProduct(first);
    await flushMicrotasks();
    fixture.detectChanges();

    expect(tienda().navegacion.view()).toBe('pdp');
    expect(tienda().catalogo.detail()).not.toBeNull();
    expect(tienda().catalogo.selectedVariant()).not.toBeNull();
    expect(window.location.hash).toContain(`/p/${first.id}`);

    tienda().catalogo.changeQuantity(1);
    expect(tienda().catalogo.pdpQuantity()).toBe(2);

    tienda().carrito.addCurrentToCart();
    await flushMicrotasks();
    expect(tienda().carrito.cartCount()).toBe(2);

    // Wishlist: toggle on + toggle on the same product stays a single entry.
    const product = tienda().catalogo.detail()!.product;
    tienda().deseos.toggleWishlist(product);
    await flushMicrotasks();
    expect(tienda().deseos.isWished(product.id)).toBe(true);
    // La lista es la que devolvió el SERVIDOR, no la entrada que pintó el optimista.
    expect(tienda().deseos.wishlist().map((line) => line.title)).toEqual(['Favorito guardado en el servidor']);

    tienda().deseos.toggleWishlist(product);
    await flushMicrotasks();
    expect(tienda().deseos.isWished(product.id)).toBe(false);
    expect(tienda().deseos.wishlist()).toHaveLength(0);
  });

  // ── UI#92: un favorito que el servidor no guardó se revierte y se dice ────────
  it('con el POST /wishlist caído el favorito vuelve a como estaba y se dice una vez', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeLaTienda({ caidas: ['POST /wishlist'] }).fetchDoble);
    await createComponent();
    const product = tienda().catalogo.products()[0];

    tienda().deseos.toggleWishlist(product);
    // El optimista se pinta…
    expect(tienda().deseos.isWished(product.id)).toBe(true);
    await flushMicrotasks();
    fixture.detectChanges();

    // …y el fallo lo revierte: nada quedó guardado.
    expect(tienda().deseos.isWished(product.id)).toBe(false);
    expect(tienda().deseos.wishlist()).toEqual([]);
    expect(alertas()).toEqual(['No pudimos guardar el cambio en tus favoritos. Intenta de nuevo.']);
  });
});
