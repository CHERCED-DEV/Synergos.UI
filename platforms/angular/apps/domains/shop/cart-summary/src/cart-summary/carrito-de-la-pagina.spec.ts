import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Product } from '@synergos/contracts';

/**
 * Dos elementos de tienda en la misma página: un clic en «agregar» es UN `POST` (UI#85).
 *
 * Lo que había: `shop` va dentro de cada bundle y el store era estado de MÓDULO, así que dos
 * elementos eran dos carritos —el clic lo escuchaban los dos, el servidor sumaba la cantidad dos
 * veces y cada contador pintaba el suyo—. Acá: `cart-summary` (con su copia de `@synergos/shop`)
 * y la copia de OTRO bundle (otra evaluación del módulo, tras `vi.resetModules()`), y el clic de
 * verdad en el botón de `product-card`, que sólo emite el evento.
 *
 * Los módulos de la página se importan DESPUÉS de doblar `fetch`: crear el store lo hidrata.
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

describe('dos elementos de tienda en la página, un carrito (UI#85)', { timeout: 30_000 }, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('un clic en «agregar» es exactamente UN POST, y los dos contadores dicen lo mismo', async () => {
    const borde = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const agregar = String(url).endsWith('/api/shop/cart/add') && init?.method === 'POST';
      const cuerpo = agregar
        ? { lines: [LINEA], subtotal: 49000, currency: 'COP', itemCount: 1 }
        : { lines: [], subtotal: 0, currency: 'COP', itemCount: 0 };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) } as Response);
    });
    vi.stubGlobal('fetch', borde);

    // El bundle de `cart-summary`, con su copia de `@synergos/shop`; y `product-card`.
    const { CartSummaryComponent } = await import('./cart-summary');
    const { ProductCardComponent } = await import('../../../product-card/src/product-card/product-card');
    const { cartStore } = await import('@synergos/shop');
    // El bundle de OTRO elemento de tienda (product-detail, cart-item…): su propia copia.
    vi.resetModules();
    const otroBundle = await import('@synergos/shop');

    await TestBed.configureTestingModule({
      imports: [CartSummaryComponent, ProductCardComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const resumen = TestBed.createComponent(CartSummaryComponent);
    const tarjeta = TestBed.createComponent(ProductCardComponent);
    tarjeta.componentInstance.product.set(PRODUCTO);
    resumen.detectChanges();
    tarjeta.detectChanges();

    const boton = (tarjeta.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.product-card__add-btn button');
    expect(boton).not.toBeNull();
    boton!.click();
    await vi.waitFor(() => expect(cartStore.count()).toBe(1));
    resumen.detectChanges();

    const posts = borde.mock.calls.filter(
      ([url, init]) => String(url).endsWith('/api/shop/cart/add') && (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(posts.length).toBe(1);
    expect(otroBundle.cartStore.count()).toBe(1);
    expect(otroBundle.cartStore).toBe(cartStore);
    expect((resumen.nativeElement as HTMLElement).querySelector('.cart-drawer__count')?.textContent?.trim()).toBe('(1)');
  });
});
