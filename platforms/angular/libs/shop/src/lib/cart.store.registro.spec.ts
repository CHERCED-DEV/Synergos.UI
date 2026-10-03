/**
 * Un carrito por página, aunque el módulo venga N veces (UI#85).
 *
 * `shop` se empaqueta dentro de cada elemento (`BUNDLED_SYNERGOS`), así que en una página con dos
 * elementos de tienda este módulo se evalúa DOS veces. Acá se simula exactamente eso: dos
 * `import()` con `vi.resetModules()` entre medio son dos copias del módulo —dos namespaces
 * distintos—, como las de dos bundles. Lo que se pide es que las dos encuentren el MISMO store en
 * `globalThis[Symbol.for('synergos.cart.v1')]`: un `hydrate()` y un solo listener de «agregar».
 *
 * Sin imports estáticos del store: el primero tiene que pasar DESPUÉS de doblar `fetch`, que es
 * lo que su `hydrate()` llama.
 */

const LINEA = {
  sku: 'SKU-1',
  variantSku: null,
  quantity: 1,
  productName: 'Silla Nórdica',
  unitPrice: 49000,
  lineTotal: 49000,
  imageUrl: null,
  productUrl: null,
};

/** El carrito del servidor: vacío al leerlo, con la línea después de agregar. */
function bordeDelCarrito(): ReturnType<typeof vi.fn> {
  return vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const agregar = String(url).endsWith('/api/shop/cart/add') && init?.method === 'POST';
    const cuerpo = agregar
      ? { lines: [LINEA], subtotal: 49000, currency: 'COP', itemCount: 1 }
      : { lines: [], subtotal: 0, currency: 'COP', itemCount: 0 };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) } as Response);
  });
}

const llamadas = (borde: ReturnType<typeof vi.fn>, metodo: string, ruta: string): number =>
  borde.mock.calls.filter(
    ([url, init]) => String(url) === ruta && ((init as RequestInit | undefined)?.method ?? 'GET') === metodo,
  ).length;

describe('cart.store — un carrito por página (UI#85)', { timeout: 30_000 }, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dos copias del módulo comparten UN store: un hydrate, y un «agregar» es UN POST', async () => {
    const borde = bordeDelCarrito();
    vi.stubGlobal('fetch', borde);

    vi.resetModules();
    const copiaA = await import('./cart.store');
    vi.resetModules();
    const copiaB = await import('./cart.store');

    // Dos módulos de verdad: dos bundles.
    expect(copiaA).not.toBe(copiaB);

    window.dispatchEvent(
      new CustomEvent('sg:product:addToCart', {
        detail: { productId: 'SKU-1', productSku: 'SKU-1', name: 'Silla Nórdica', price: 49000, currency: 'COP', quantity: 1 },
      }),
    );
    await vi.waitFor(() => expect(copiaA.cartStore.count()).toBe(1));

    // Lo que pasaba: dos listeners, dos POST, la cantidad sumada dos veces en el servidor.
    expect(llamadas(borde, 'POST', '/api/shop/cart/add')).toBe(1);
    expect(copiaB.cartStore.count()).toBe(copiaA.cartStore.count());
    // Y el hydrate no se repitió por la segunda copia.
    expect(llamadas(borde, 'GET', '/api/shop/cart')).toBe(1);
    // Porque las dos copias tienen la MISMA instancia, la del registro de la página.
    expect(copiaB.cartStore).toBe(copiaA.cartStore);
    expect((globalThis as unknown as Record<symbol, unknown>)[Symbol.for('synergos.cart.v1')]).toBe(copiaA.cartStore);
  });
});
