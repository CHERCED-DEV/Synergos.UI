import { cartStore } from './cart.store';

/**
 * Agregar al carrito SE OYE (#82).
 *
 * `product-card`, `product-grid` y `product-detail` despachan `sg:product:addToCart`; el store lo
 * confirma contra el servidor y, sólo si confirmó, abre el cajón. Eso se veía y no se oía: ni el
 * éxito ni el fallo —que además revierte el carrito— decían nada a un lector de pantalla. El store
 * no tiene inyector, así que habla por el anunciador del documento, la misma región que la de
 * `LiveAnnouncerService`.
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

function servidor(confirma: boolean): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: confirma,
        status: confirma ? 200 : 500,
        json: () => Promise.resolve({ lines: [LINEA], subtotal: 49000, currency: 'COP', itemCount: 1 }),
      } as Response),
    ),
  );
}

function agregar(): void {
  window.dispatchEvent(
    new CustomEvent('sg:product:addToCart', {
      detail: {
        productId: 'SKU-1',
        productSku: 'SKU-1',
        name: 'Silla Nórdica',
        price: 49000,
        currency: 'COP',
        quantity: 1,
      },
    }),
  );
}

/**
 * Hasta que el anuncio llegue a la región: el servidor responde en microtareas y el anunciador
 * escribe 100 ms después. Se espera la CONDICIÓN y no un plazo fijo: con un `setTimeout(160)`
 * fijo, el primer test del fichero salió rojo con la región todavía vacía (visto en esta máquina).
 */
async function esperarAnuncio(texto: string): Promise<void> {
  await vi.waitFor(() => expect(region()?.textContent).toBe(texto), { timeout: 2000, interval: 20 });
}

const region = (): HTMLElement | null => document.querySelector('[data-syn-live-announcer]');

describe('cart.store — agregar al carrito se oye (#82)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cartStore.closeDrawer();
  });

  it('confirmado por el servidor: abre el cajón Y lo dice', async () => {
    servidor(true);
    agregar();
    await esperarAnuncio('Silla Nórdica agregado al carrito.');

    expect(cartStore.open()).toBe(true);
    expect(region()?.getAttribute('aria-live')).toBe('polite');
  });

  it('rechazado: NO abre el cajón, y el fallo se dice asertivo', async () => {
    servidor(false);
    agregar();
    await esperarAnuncio('No se pudo agregar Silla Nórdica al carrito.');

    expect(cartStore.open()).toBe(false);
    expect(region()?.getAttribute('aria-live')).toBe('assertive');
  });

  it('agregar dos veces lo mismo lo dice dos veces', async () => {
    servidor(true);
    agregar();
    await esperarAnuncio('Silla Nórdica agregado al carrito.');
    region()!.textContent = '((no se volvió a anunciar))';

    agregar();
    await esperarAnuncio('Silla Nórdica agregado al carrito.');
  });
});
