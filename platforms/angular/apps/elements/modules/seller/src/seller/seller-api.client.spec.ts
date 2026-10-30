import { type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MUESTRAS_DE_LA_CONSOLA, SellerApiClient, type LecturaDeLaConsola } from './seller-api.client';

// ══ LAS LECTURAS DE LA CONSOLA NO INVENTAN (013-seller-operaciones, T006) ══════════════════════════════════════
//
// Cada lectura dice lo que pasó: leída, vacía, sin sesión (401), sin permiso (403) o caída (la red, un 5xx, una ruta
// que no existe o una forma que no se entiende). Los ejemplos sólo salen con `MUESTRAS_DE_LA_CONSOLA`, la marca que una
// demo declara a propósito: antes caían solos con cualquier fallo, y un personal de la tienda veía ventas, devoluciones
// y reputación que nadie tenía.
//
// Los dobles tienen la forma del SERVIDOR: `GET orders` y `GET messages` contestan lo que emite `ShopCatalogController`
// (`OrdersResponse`, `InboxResponse`), y las rutas que hoy no declara contestan 404, como contestan.

const API = '/api/shop';

/** La demo que DECLARA los ejemplos: sin esta marca, la consola no los pinta. */
const CON_MUESTRAS: Provider[] = [{ provide: MUESTRAS_DE_LA_CONSOLA, useValue: true }];

/** Un pedido como lo emite `OrderDto` del CMS. */
const PEDIDO_DEL_CMS = {
  orderRef: 'saga-7f3a',
  orderNumber: 'T-2026-0042',
  status: 'Paid',
  customerName: 'Lucía Gómez',
  customerEmail: 'lucia@correo.co',
  total: 259000,
  totalFormatted: '$ 259.000',
  currency: 'COP',
  date: '2026-10-20T15:00:00+00:00',
  createdAt: '2026-10-20T15:00:00+00:00',
  items: [
    {
      productId: 'P-9',
      variantId: null,
      title: 'Teclado mecánico compacto 65%',
      qty: 1,
      amount: 259000,
      productName: 'Teclado mecánico compacto 65%',
      quantity: 1,
      unitPrice: 259000,
      unitPriceFormatted: '$ 259.000',
      lineTotal: 259000,
      lineTotalFormatted: '$ 259.000',
      currency: 'COP',
      canReturn: false,
      returnBlock: null,
    },
  ],
};

/** Un hilo como lo emite hoy `ThreadSummaryDto` del CMS: `threadId` y no `id`, y sin asunto (T030 las suma). */
const HILO_DEL_CMS = {
  threadId: 'th_31',
  contextRef: 'P-9',
  participants: ['comprador@correo.co', 'vendedor@tienda.co'],
  lastMessagePreview: '¿Tiene garantía?',
  lastMessageAt: '2026-09-30T10:00:00+00:00',
  messageCount: 1,
};

type Lector = (cliente: SellerApiClient, apiBase: string) => Promise<LecturaDeLaConsola<unknown>>;

/** Las cinco lecturas de la consola. */
const LECTURAS: ReadonlyArray<readonly [string, Lector]> = [
  ['el resumen', (cliente, apiBase) => cliente.summary(apiBase)],
  ['las ventas', (cliente, apiBase) => cliente.orders(apiBase, 'COP')],
  ['las publicaciones', (cliente, apiBase) => cliente.listings(apiBase, 'COP')],
  ['las devoluciones', (cliente, apiBase) => cliente.returns(apiBase)],
  ['los mensajes', (cliente, apiBase) => cliente.threads(apiBase)],
];

function contestar(status: number, cuerpo: unknown): ReturnType<typeof vi.fn> {
  const red = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } }),
    ),
  );
  vi.stubGlobal('fetch', red);
  return red;
}

/** Las caídas: lo que no es una respuesta legible del servidor. */
const CAIDAS: ReadonlyArray<readonly [string, () => void]> = [
  ['la red', () => vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))],
  ['un 500', () => contestar(500, { error: 'boom' })],
  ['un 404 (la ruta que el CMS no declara)', () => contestar(404, { error: 'not found' })],
  ['una forma que no se entiende', () => contestar(200, { error: 'x' })],
];

describe('SellerApiClient — las lecturas de la consola no inventan (013-seller-operaciones, T006)', () => {
  function crearCliente(extra: Provider[] = []): SellerApiClient {
    TestBed.configureTestingModule({ providers: [SellerApiClient, ...extra] });
    return TestBed.inject(SellerApiClient);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('lo que el servidor contesta es leído, con lo que el servidor dijo', async () => {
    contestar(200, { orders: [PEDIDO_DEL_CMS] });

    const lectura = await crearCliente().orders(API, 'COP');

    expect(lectura).toMatchObject({
      tipo: 'leidas',
      datos: [{ orderNumber: 'T-2026-0042', status: 'paid', total: 259000, currency: 'COP' }],
    });
  });

  it('la lista que el servidor contesta sin nada es vacía, no caída; y con la marca tampoco se tapa con ejemplos', async () => {
    contestar(200, { orders: [] });
    expect(await crearCliente().orders(API, 'COP')).toEqual({ tipo: 'vacia', datos: [] });

    TestBed.resetTestingModule();
    expect(await crearCliente(CON_MUESTRAS).orders(API, 'COP')).toEqual({ tipo: 'vacia', datos: [] });
  });

  it('401 es sin sesión y 403 sin permiso, en las cinco lecturas; y la marca no los tapa', async () => {
    for (const [status, tipo] of [
      [401, 'sin-sesion'],
      [403, 'sin-permiso'],
    ] as const) {
      for (const [nombre, leer] of LECTURAS) {
        for (const extra of [[], CON_MUESTRAS]) {
          contestar(status, { error: 'no' });
          const lectura = await leer(crearCliente(extra), API);
          expect(lectura, `${nombre} con ${status}`).toEqual({ tipo });
          TestBed.resetTestingModule();
        }
      }
    }
  });

  it('sin la marca nunca un ejemplo: ninguna de las cinco lecturas, con ninguna caída, pinta datos', async () => {
    for (const [caida, provocar] of CAIDAS) {
      for (const [nombre, leer] of LECTURAS) {
        provocar();
        const lectura = await leer(crearCliente(), API);
        expect(lectura, `${nombre} con ${caida}`).toEqual({ tipo: 'caida' });
        TestBed.resetTestingModule();
      }
    }
  });

  it('con la marca de la demo, una caída enseña su muestra, dicha como muestra', async () => {
    for (const [nombre, leer] of LECTURAS) {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
      const lectura = await leer(crearCliente(CON_MUESTRAS), API);
      expect(lectura.tipo, nombre).toBe('muestras');
      TestBed.resetTestingModule();
    }
  });

  it('sin la base de la API no llama a nada y es una caída (ADR 0137)', async () => {
    const red = contestar(200, { orders: [PEDIDO_DEL_CMS] });

    for (const [nombre, leer] of LECTURAS) {
      expect(await leer(crearCliente(), ''), nombre).toEqual({ tipo: 'caida' });
      TestBed.resetTestingModule();
    }
    expect(red).not.toHaveBeenCalled();
  });

  // Hoy `GET messages` contesta `threadId` y no `id`, sin asunto: el normalizador descarta cada hilo. Sin esta regla
  // la lista quedaba en `[]` y la consola decía «No tienes mensajes de compradores» con hilos en el servidor. T031 lee
  // esas claves y este caso pasa a leído.
  it('una lista con entradas de las que no se entiende ninguna es una caída, no una vacía', async () => {
    contestar(200, { threads: [HILO_DEL_CMS] });

    expect(await crearCliente().threads(API)).toEqual({ tipo: 'caida' });
  });
});
