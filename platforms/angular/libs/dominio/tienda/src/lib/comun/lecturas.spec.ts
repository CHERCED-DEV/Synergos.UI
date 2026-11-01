import { TestBed } from '@angular/core/testing';
import { CompraApi } from '../compra/compra-api.client';
import { DeseosApi } from '../deseos/deseos-api.client';
import { LecturasDeLaTienda } from './lecturas';

describe('las lecturas y las escrituras de la tienda', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── EL QUE MUERDE: con la red caída no hay orden, ni pedido, ni favorito ─────
  it('con la red caída abrir la orden, colocar el pedido y tocar favoritos LANZAN (UI#92)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const compra = TestBed.inject(CompraApi);
    const deseos = TestBed.inject(DeseosApi);
    const entry = { productId: 'X1', title: 'Producto X', amount: 10, currency: 'COP' };

    await expect(
      compra.checkout('/api/shop', [{ productId: 'X1', variantId: 'V1', qty: 1 }], { name: 'Ada', email: 'a@b.co' }, 'COP'),
    ).rejects.toMatchObject({ name: 'ShopWriteFailedError', endpoint: 'POST /api/shop/checkout' });
    await expect(compra.confirm('/api/shop', 'ord_77')).rejects.toMatchObject({ name: 'ShopWriteFailedError' });
    await expect(deseos.wishlistMutate('/api/shop', entry, 'add')).rejects.toMatchObject({
      name: 'ShopWriteFailedError',
    });
    // Ninguna escritura caída enciende el cartel de «datos de ejemplo», y la lectura
    // degradada de favoritos no lleva el que no se guardó.
    expect(TestBed.inject(LecturasDeLaTienda).degraded).toBe(false);
    expect(await deseos.wishlist('/api/shop', 'COP')).toEqual([]);
  });
});
