import { TestBed } from '@angular/core/testing';
import { CompraApi } from './compra-api.client';

/** El checkout y la confirmación como los contesta el CMS (`ShopCatalogController`): el doble lleva su forma. */
function bordeDelPago(): ReturnType<typeof vi.fn> {
  const responder = (status: number, body: unknown): Promise<Response> =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response);
  const linea = (productId: string, title: string, amount: number) => ({
    productId,
    variantId: null,
    title,
    qty: 1,
    amount,
    productName: title,
    quantity: 1,
    unitPrice: amount,
    unitPriceFormatted: '',
    lineTotal: amount,
    lineTotalFormatted: '',
    currency: 'COP',
    canReturn: false,
    returnBlock: null,
  });
  return vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const ruta = new URL(String(url), 'http://borde.test').pathname.replace(/^\/api\/shop/, '');
    switch (`${(init?.method ?? 'GET').toUpperCase()} ${ruta}`) {
      case 'POST /checkout':
        return responder(200, {
          orderRef: 'ord_77',
          paymentSessionId: 'psp_77',
          amount: 700_000,
          amountFormatted: '$ 700.000',
          currency: 'COP',
        });
      case 'POST /confirm':
        return responder(200, {
          status: 'Paid',
          orderNumber: 'SYN-77',
          orderRef: 'ord_77',
          total: 700_000,
          totalFormatted: '$ 700.000',
          currency: 'COP',
          items: [linea('P-A', 'Audífonos Pro (servidor)', 500_000), linea('P-B', 'Mouse Pro (servidor)', 200_000)],
        });
      default:
        return responder(404, {});
    }
  });
}

describe('CompraApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('opens a single checkout session and confirms the order (happy case)', async () => {
    vi.stubGlobal('fetch', bordeDelPago());
    const client = TestBed.inject(CompraApi);

    const checkout = await client.checkout(
      '/api/shop',
      [{ productId: 'X1', variantId: 'V1', qty: 1 }],
      { name: 'Ada', email: 'a@b.co' },
      'COP',
    );
    expect(checkout.orderRef).toBe('ord_77');
    expect(checkout.paymentSessionId).toBe('psp_77');

    const confirmation = await client.confirm('/api/shop', 'ord_77');
    expect(confirmation.status).toBe('Paid');
    expect(confirmation.orderNumber).toBe('SYN-77');
  });
});
