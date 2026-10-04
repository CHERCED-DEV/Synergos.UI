import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Product } from '@synergos/contracts';
import { ProductCardComponent } from './product-card';

/**
 * Una página SÓLO con `product-card`: «agregar» llega al servidor (UI#85, el caso inverso).
 *
 * `product-card` sólo emitía `sg:product:addToCart` y no traía el carrito: en una página sin
 * `cart-summary` ni otro elemento de tienda que lo creara, nadie escuchaba y el clic se perdía —
 * 0 `POST`, sin error y sin anuncio (medido)—. Ahora el clic crea el carrito de la página antes
 * de despachar. Y no antes: montar la tarjeta no pide `GET /cart`.
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

const PRODUCTO: Product = {
  id: 'SKU-1',
  sku: 'SKU-1',
  name: 'Silla Nórdica',
  slug: 'silla-nordica',
  description: '',
  price: 49000,
  currency: 'COP',
  images: [],
  category: { id: 'C-1', name: 'Muebles', slug: 'muebles' },
  inStock: true,
};

describe('una página sólo con product-card (UI#85)', () => {
  // Una página nueva: vitest reutiliza el `globalThis` del worker entre ficheros, y el carrito que
  // registró otro spec (con su listener en OTRA ventana de jsdom) se quedaría como el de esta.
  beforeAll(() => {
    delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for('synergos.cart.v1')];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('montarla no pide nada; un clic en «agregar» es exactamente UN POST', async () => {
    const borde = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const agregar = String(url).endsWith('/api/shop/cart/add') && init?.method === 'POST';
      const cuerpo = agregar
        ? { lines: [LINEA], subtotal: 49000, currency: 'COP', itemCount: 1 }
        : { lines: [], subtotal: 0, currency: 'COP', itemCount: 0 };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) } as Response);
    });
    vi.stubGlobal('fetch', borde);

    await TestBed.configureTestingModule({
      imports: [ProductCardComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const tarjeta = TestBed.createComponent(ProductCardComponent);
    tarjeta.componentInstance.product.set(PRODUCTO);
    tarjeta.detectChanges();

    // Una página de catálogo no paga el carrito al cargar.
    expect(borde).not.toHaveBeenCalled();
    expect((globalThis as unknown as Record<symbol, unknown>)[Symbol.for('synergos.cart.v1')]).toBeUndefined();

    (tarjeta.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.product-card__add-btn button')!.click();

    const posts = (): number =>
      borde.mock.calls.filter(
        ([url, init]) => String(url).endsWith('/api/shop/cart/add') && (init as RequestInit | undefined)?.method === 'POST',
      ).length;
    await vi.waitFor(() => expect(posts()).toBe(1));
    const carrito = (globalThis as unknown as Record<symbol, { count: () => number } | undefined>)[
      Symbol.for('synergos.cart.v1')
    ];
    await vi.waitFor(() => expect(carrito?.count()).toBe(1));
    expect(posts()).toBe(1);
  });
});
