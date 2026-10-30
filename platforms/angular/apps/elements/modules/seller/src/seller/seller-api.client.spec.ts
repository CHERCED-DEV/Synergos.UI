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

/** Las lecturas de la consola. */
const LECTURAS: ReadonlyArray<readonly [string, Lector]> = [
  ['el resumen', (cliente, apiBase) => cliente.summary(apiBase)],
  ['la bandeja', (cliente, apiBase) => cliente.pedidos(apiBase, null, 1)],
  ['el detalle', (cliente, apiBase) => cliente.pedido(apiBase, 'saga-7f3a')],
  ['las publicaciones', (cliente, apiBase) => cliente.listings(apiBase, 'COP')],
  ['las devoluciones', (cliente, apiBase) => cliente.devoluciones(apiBase)],
  ['los mensajes', (cliente, apiBase) => cliente.threads(apiBase)],
];

/** Un pedido como lo emite `VendedorDeLaTiendaController` (T011) en la bandeja. */
const PEDIDO_DE_LA_BANDEJA = {
  orderRef: 'saga-7f3a',
  orderNumber: 'T-2026-0042',
  fecha: '2026-10-20T15:00:00+00:00',
  comprador: 'Lucía Gómez',
  camino: 'puerta',
  etapa: 'paid',
  total: 259000,
  totalFormatted: '$ 259.000',
  moneda: 'COP',
  lineas: [{ title: 'Teclado mecánico compacto 65%', qty: 1, amount: 259000, amountFormatted: '$ 259.000' }],
  actos: ['preparar'],
  motivoSinActos: null,
};

/** La bandeja como la emite el CMS: una página, las cuentas de la tienda entera y lo que no se concilió. */
const BANDEJA_DEL_CMS = {
  pedidos: [PEDIDO_DE_LA_BANDEJA],
  pagina: 1,
  porPagina: 50,
  total: 1,
  cuentas: { paid: 1, preparing: 3, shipped: 0, delivered: 7 },
  sinConciliar: 0,
};

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
    contestar(200, BANDEJA_DEL_CMS);

    const lectura = await crearCliente().pedidos(API, null, 1);

    expect(lectura).toMatchObject({
      tipo: 'leidas',
      datos: { pedidos: [{ orderNumber: 'T-2026-0042', etapa: 'paid', total: 259000, moneda: 'COP' }] },
    });
  });

  it('la lista que el servidor contesta sin nada es vacía, no caída; y con la marca tampoco se tapa con ejemplos', async () => {
    // Una bandeja de mensajes sin hilos, como la contesta `InboxResponse`.
    contestar(200, { threads: [] });
    expect(await crearCliente().threads(API)).toEqual({ tipo: 'vacia', datos: [] });

    TestBed.resetTestingModule();
    expect(await crearCliente(CON_MUESTRAS).threads(API)).toEqual({ tipo: 'vacia', datos: [] });
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
    const red = contestar(200, BANDEJA_DEL_CMS);

    for (const [nombre, leer] of LECTURAS) {
      expect(await leer(crearCliente(), ''), nombre).toEqual({ tipo: 'caida' });
      TestBed.resetTestingModule();
    }
    expect(red).not.toHaveBeenCalled();
  });

  // ── La bandeja del personal (T012) ────────────────────────────────────────────────────────────────────────────────

  it('la bandeja se pide al servidor con su etapa y su página, y trae las cuentas de la tienda entera', async () => {
    const red = contestar(200, BANDEJA_DEL_CMS);

    const lectura = await crearCliente().pedidos(API, 'shipped', 2);

    expect(String(red.mock.calls[0][0])).toBe(`${API}/seller/orders?etapa=shipped&pagina=2`);
    expect(lectura).toMatchObject({
      tipo: 'leidas',
      datos: { pagina: 1, total: 1, cuentas: { paid: 1, preparing: 3, shipped: 0, delivered: 7 }, sinConciliar: 0 },
    });
    if (lectura.tipo !== 'leidas') return;
    expect(lectura.datos.pedidos[0]).toMatchObject({ orderRef: 'saga-7f3a', etapa: 'paid', camino: 'puerta', actos: ['preparar'] });
  });

  it('una bandeja sin pedidos es vacía y conserva sus cuentas; una con una cuenta que falta no se entiende', async () => {
    contestar(200, { ...BANDEJA_DEL_CMS, pedidos: [], total: 0 });
    expect(await crearCliente().pedidos(API, null, 1)).toMatchObject({ tipo: 'vacia', datos: { cuentas: { delivered: 7 } } });

    TestBed.resetTestingModule();
    contestar(200, { ...BANDEJA_DEL_CMS, cuentas: { paid: 1, preparing: 3, shipped: 0 } });
    expect(await crearCliente().pedidos(API, null, 1)).toEqual({ tipo: 'caida' });
  });

  it('un pedido sin etapa del despacho o sin camino no se entiende: no se pinta un supuesto', async () => {
    contestar(200, { ...BANDEJA_DEL_CMS, pedidos: [{ ...PEDIDO_DE_LA_BANDEJA, etapa: 'pending' }] });
    expect(await crearCliente().pedidos(API, null, 1)).toEqual({ tipo: 'caida' });

    TestBed.resetTestingModule();
    contestar(200, { ...BANDEJA_DEL_CMS, pedidos: [{ ...PEDIDO_DE_LA_BANDEJA, camino: undefined }] });
    expect(await crearCliente().pedidos(API, null, 1)).toEqual({ tipo: 'caida' });
  });

  it('el detalle trae el envío como lo dijo el servidor, o su motivo', async () => {
    contestar(200, {
      ...PEDIDO_DE_LA_BANDEJA,
      envio: {
        destino: { line1: 'Calle 1 # 2-3', line2: null, city: 'Bogotá', region: null, postalCode: null, country: 'CO', contact: 'Lucía' },
        transportadora: 'servientrega',
        estado: 'Ready',
        eventos: [{ estado: 'Ready', nota: null, fecha: '2026-10-25T14:02:11+00:00' }],
      },
      motivoSinEnvio: null,
    });
    const conEnvio = await crearCliente().pedido(API, 'saga-7f3a');

    TestBed.resetTestingModule();
    contestar(200, { ...PEDIDO_DE_LA_BANDEJA, envio: null, motivoSinEnvio: 'envio_no_disponible' });
    const sinEnvio = await crearCliente().pedido(API, 'saga-7f3a');

    expect(conEnvio).toMatchObject({
      tipo: 'leidas',
      datos: { envio: { destino: { city: 'Bogotá', contact: 'Lucía' }, transportadora: 'servientrega' }, motivoSinEnvio: null },
    });
    expect(sinEnvio).toMatchObject({ tipo: 'leidas', datos: { envio: null, motivoSinEnvio: 'envio_no_disponible' } });
  });

  // Hoy `GET messages` contesta `threadId` y no `id`, sin asunto: el normalizador descarta cada hilo. Sin esta regla
  // la lista quedaba en `[]` y la consola decía «No tienes mensajes de compradores» con hilos en el servidor. T031 lee
  // esas claves y este caso pasa a leído.
  it('una lista con entradas de las que no se entiende ninguna es una caída, no una vacía', async () => {
    contestar(200, { threads: [HILO_DEL_CMS] });

    expect(await crearCliente().threads(API)).toEqual({ tipo: 'caida' });
  });

  // ── Los actos del personal (T021) ─────────────────────────────────────────────────────────────────────────────────

  it('un acto va a la ruta del personal con { acto, guia } y trae el pedido como lo dejó el servidor', async () => {
    const red = contestar(200, { ...PEDIDO_DE_LA_BANDEJA, etapa: 'shipped', actos: ['entregar'] });

    const resultado = await crearCliente().avanzar(API, 'saga 7f3a', 'enviar', 'GUIA-123');

    const [url, init] = red.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API}/seller/orders/saga%207f3a/advance`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ acto: 'enviar', guia: 'GUIA-123' });
    expect(resultado).toMatchObject({ hecho: true, pedido: { etapa: 'shipped', actos: ['entregar'] } });
  });

  it('un rechazo trae su código y la etapa en que sigue; un transitorio o un 5xx, que no se pudo ahora', async () => {
    contestar(409, { code: 'tienda.acto_fuera_de_orden', error: 'No le toca.', etapa: 'shipped' });
    expect(await crearCliente().avanzar(API, 'saga-7f3a', 'preparar')).toEqual({
      hecho: false, por: 'rechazo', codigo: 'tienda.acto_fuera_de_orden', etapa: 'shipped',
    });

    TestBed.resetTestingModule();
    contestar(409, { code: 'fulfillment.transition_not_allowed', error: 'No.', transient: false });
    expect(await crearCliente().avanzar(API, 'saga-7f3a', 'entregar')).toEqual({
      hecho: false, por: 'rechazo', codigo: 'fulfillment.transition_not_allowed', etapa: null,
    });

    TestBed.resetTestingModule();
    contestar(503, { code: 'fulfillment.unreachable', error: 'No respondió.', transient: true });
    expect(await crearCliente().avanzar(API, 'saga-7f3a', 'enviar')).toEqual({
      hecho: false, por: 'caida', codigo: 'fulfillment.unreachable', etapa: null,
    });
  });

  it('401 y 403 son la sesión y el permiso; la red o sin base, que no se pudo, y sin base no sale nada', async () => {
    contestar(401, { error: 'Se requiere iniciar sesión.' });
    expect(await crearCliente().avanzar(API, 'saga-7f3a', 'preparar')).toMatchObject({ hecho: false, por: 'sin-sesion' });

    TestBed.resetTestingModule();
    contestar(403, {});
    expect(await crearCliente().avanzar(API, 'saga-7f3a', 'preparar')).toMatchObject({ hecho: false, por: 'sin-permiso' });

    TestBed.resetTestingModule();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await crearCliente().avanzar(API, 'saga-7f3a', 'preparar')).toMatchObject({ hecho: false, por: 'caida' });

    TestBed.resetTestingModule();
    const red = contestar(200, PEDIDO_DE_LA_BANDEJA);
    expect(await crearCliente().avanzar('', 'saga-7f3a', 'preparar')).toMatchObject({ hecho: false, por: 'caida' });
    expect(red).not.toHaveBeenCalled();
  });

  it('un sí que no se entiende se hizo igual: el servidor dijo que sí, y la consola vuelve a leer', async () => {
    contestar(200, { raro: true });

    expect(await crearCliente().avanzar(API, 'saga-7f3a', 'preparar')).toEqual({ hecho: true, pedido: null });
  });
  // ── La cola de devoluciones (T025) ───────────────────────────────────────────────────────────────────────────────

  it('la cola se lee de seller/returns con el estado exacto; una devolución sin estado del CMS no se entiende', async () => {
    const red = contestar(200, {
      devoluciones: [
        {
          rmaId: 'RMA-1', orderRef: 'saga-7f3a', orderNumber: 'T-2026-0042', camino: 'puerta', producto: 'Teclado', cantidad: 1,
          motivo: 'Falla', monto: 259000, montoFormatted: '$ 259.000', moneda: 'COP', estado: 'Received', nota: null,
          solicitada: '2026-10-20T15:00:00+00:00', actualizada: '2026-10-21T15:00:00+00:00',
        },
      ],
    });

    const lectura = await crearCliente().devoluciones(API);

    expect(String(red.mock.calls[0][0])).toBe(`${API}/seller/returns`);
    expect(lectura).toMatchObject({ tipo: 'leidas', datos: [{ rmaId: 'RMA-1', estado: 'Received', camino: 'puerta', orderNumber: 'T-2026-0042' }] });

    TestBed.resetTestingModule();
    contestar(200, { devoluciones: [{ rmaId: 'RMA-1', estado: 'en-revision' }] });
    expect(await crearCliente().devoluciones(API)).toEqual({ tipo: 'caida' });
  });

  it('mover una devolución manda { status, note } y trae su estado; un reembolso que no sale trae el motivo del servidor', async () => {
    const red = contestar(200, { claimId: 'RMA-1', rmaId: 'RMA-1', status: 'en-revision', estado: 'Approved' });

    const movida = await crearCliente().moverDevolucion(API, 'RMA 1', 'approved');

    const [url, init] = red.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API}/return/RMA%201/advance`);
    expect(JSON.parse(String(init.body))).toEqual({ status: 'approved', note: null });
    expect(movida).toEqual({ hecho: true, estado: 'Approved' });

    TestBed.resetTestingModule();
    contestar(400, { error: 'El orquestador no pudo devolver la plata.' });
    expect(await crearCliente().moverDevolucion(API, 'RMA-1', 'refunded')).toEqual({
      hecho: false, por: 'rechazo', motivo: 'El orquestador no pudo devolver la plata.',
    });

    TestBed.resetTestingModule();
    contestar(503, { error: 'caído' });
    expect(await crearCliente().moverDevolucion(API, 'RMA-1', 'refunded')).toMatchObject({ hecho: false, por: 'caida' });
  });
});
