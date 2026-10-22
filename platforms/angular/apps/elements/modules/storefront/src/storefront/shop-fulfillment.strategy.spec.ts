import { TestBed } from '@angular/core/testing';
import { SessionStore, type SessionData, type SessionItem } from '@synergos/transaction-engine';
import {
  aMenores,
  definirCoordinador,
  type CoordinadorDelFlujo,
  type Enviar,
  type Peticion,
  type RechazoDelFlujo,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';
import { ShopApiClient } from './shop-api.client';
import {
  CODIGO_COBRO_DEVUELTO,
  CODIGO_COMPRA_SIN_RESOLVER,
  CODIGO_SIN_SABER,
  ShopFulfillmentStrategy,
  compraPendiente,
  llaveDeLaIntencion,
  llaveRetenida,
} from './shop-fulfillment.strategy';
import type { CompraPendienteDelServidor, OrdenDeLaPuerta } from './shop.model';

/**
 * La estrategia de la tienda por los dos caminos (004-tienda-compra, T020, T024, T027): lo que viaja a la
 * puerta, lo que se afirma y lo que se consulta antes de afirmar, sin la pantalla. Contra un
 * `<synergos-flujo>` de verdad con el cable sustituido, y un cliente falso para el registro del CMS.
 */

const rechazo = (code: string, status: number, transient = false): RechazoDelFlujo => ({
  code,
  status,
  transient,
  detail: '',
  origen: 'servidor',
  extra: {},
});

const bien = <T>(valor: T, estado = 200): ResultadoDelFlujo<T> => ({ ok: true, valor, estado, correlacion: '' });
const mal = (r: RechazoDelFlujo): ResultadoDelFlujo<never> => ({ ok: false, rechazo: r, correlacion: '' });

/** El registro del CMS y la ruta directa: lo que se le pidió, y lo que contesta. */
class ApiFalsa {
  readonly checkouts: unknown[][] = [];
  readonly anotadas: string[] = [];
  readonly leidas: string[] = [];
  pendientes: ResultadoDelFlujo<readonly CompraPendienteDelServidor[]> = bien([]);
  orden: ResultadoDelFlujo<OrdenDeLaPuerta> = mal(rechazo('tienda.registro_no_disponible', 503, true));

  async search(): Promise<{ products: [] }> {
    return { products: [] };
  }

  async checkout(...args: unknown[]): Promise<{ orderRef: string; paymentSessionId: string; amount: number; currency: string }> {
    this.checkouts.push(args);
    return { orderRef: 'ord-directa', paymentSessionId: 'ps-1', amount: 75_000, currency: 'COP' };
  }

  async confirm(): Promise<{ status: string; orderNumber: string; items: [] }> {
    return { status: 'Paid', orderNumber: 'D-1', items: [] };
  }

  async anotarCompra(_apiBase: string, id: string): Promise<ResultadoDelFlujo<unknown>> {
    this.anotadas.push(id);
    return bien({});
  }

  async compraDeLaPuerta(_apiBase: string, id: string): Promise<ResultadoDelFlujo<OrdenDeLaPuerta>> {
    this.leidas.push(id);
    return this.orden;
  }

  async comprasPendientes(): Promise<ResultadoDelFlujo<readonly CompraPendienteDelServidor[]>> {
    return this.pendientes;
  }
}

/** Una compra de la tienda como la contesta la puerta. */
const compra = (estado: string, total: number | null = 75_000, id = 'saga-1') => ({
  id,
  flujo: 'tienda.compra',
  numero: 'COMPRA01',
  estado,
  datos: {
    lineasDelPedido: [
      { sujeto: { kind: 'tienda.producto', id: 'TAZA-001' }, cantidad: 2, precioUnitario: { amount: 20_000, currency: 'COP' } },
      { sujeto: { kind: 'tienda.producto', id: 'CAMI-001:azul' }, cantidad: 1, precioUnitario: { amount: 35_000, currency: 'COP' } },
    ],
    subtotal: total === null ? null : { amount: total, currency: 'COP' },
    descuento: { amount: 0, currency: 'COP' },
    impuesto: { amount: 0, currency: 'COP' },
    total: total === null ? null : { amount: total, currency: 'COP' },
    pedido: 'ped-1',
    envio: null,
  },
  compensacionesPendientes: 0,
  error: null,
  deshaciendo: false,
});

const linea = (productId: string, variantId: string, title: string, amount: number, quantity: number): SessionItem => ({
  id: `product:${productId}:${variantId}`,
  kind: 'product',
  productRef: productId,
  label: title,
  selection: { productId, variantId, variantLabel: '', currency: 'COP', image: '', seller: '', unitAmount: amount, apiBase: '/api/shop' },
  amount,
  quantity,
});

const DIRECCION = { linea1: 'Calle 1 # 2-3', ciudad: 'Bogotá', pais: 'CO', contacto: 'Ana' };

describe('ShopFulfillmentStrategy: la compra por los dos caminos', () => {
  beforeAll(() => definirCoordinador());

  let estrategia: ShopFulfillmentStrategy;
  let store: SessionStore;
  let api: ApiFalsa;
  let flujo: CoordinadorDelFlujo;
  let host: HTMLElement;
  const vistas: Peticion[] = [];

  function puerta(responder: (p: Peticion) => ResultadoDelFlujo<unknown>): void {
    vistas.length = 0;
    flujo = document.createElement('synergos-flujo') as CoordinadorDelFlujo;
    flujo.setAttribute('flujo', 'tienda.compra');
    const enviar: Enviar = (p) => {
      vistas.push(p);
      return Promise.resolve(responder(p));
    };
    flujo.enviar = enviar;
    host = document.createElement('div');
    flujo.appendChild(host);
    document.body.appendChild(flujo);
  }

  beforeEach(() => {
    localStorage.clear();
    api = new ApiFalsa();
    TestBed.configureTestingModule({ providers: [ShopFulfillmentStrategy, { provide: ShopApiClient, useValue: api }] });
    estrategia = TestBed.inject(ShopFulfillmentStrategy);
    store = TestBed.inject(SessionStore);
    store.init({ scope: `storefront.spec.${Math.random()}`, flow: 'storefront', ttlMs: 30 * 60 * 1000 });
    store.addItem(linea('TAZA-001', 'TAZA-001-default', 'Taza', aMenores(20_000, 'COP'), 2));
    store.addItem(linea('CAMI-001', 'azul', 'Camiseta', aMenores(35_000, 'COP'), 1));
    // El total LOCAL del carrito: 74.000 a propósito, para que el del servidor (75.000) se distinga.
    store.setPricing({ currency: 'COP', totalAmount: aMenores(74_000, 'COP'), balanceDue: aMenores(74_000, 'COP'), breakdown: [] });
  });

  afterEach(() => {
    flujo?.remove();
    TestBed.resetTestingModule();
  });

  const instrumento = (extra: Record<string, unknown> = {}) => ({
    apiBase: '/api/shop',
    customer: { name: 'Ana', email: 'ana@ejemplo.co', address: 'Calle 1 # 2-3', city: 'Bogotá' },
    host,
    camino: 'puerta',
    direccion: DIRECCION,
    ...extra,
  });

  /** Lo que hace el asistente cuando `pay` acepta: anota el pago con su referencia. */
  function pagoAnotado(referencia: string): void {
    const s = store.getValidSession();
    store.setSession({
      ...s,
      payments: [{ id: 'pay-1', amount: s.pricing.totalAmount, provider: 'shop-card', status: 'captured', reference: referencia }],
    });
  }

  // ── La ruta directa: lo de siempre ─────────────────────────────────────────────────────────

  it('sin declaración compra por la ruta directa y nunca le pide nada a la puerta', async () => {
    puerta(() => bien(compra('Running'), 201));

    const r = await estrategia.pay({ session: store.getValidSession(), instrument: instrumento({ camino: undefined }) });

    expect(r).toEqual({ accepted: true, reference: 'ord-directa' });
    expect(api.checkouts).toHaveLength(1);
    expect(vistas).toHaveLength(0);
  });

  // ── Por la puerta: abrir ─────────────────────────────────────────────────────────────────

  it('por la puerta abre con la llave de la intención, las líneas como referencias y el total del SERVIDOR, y la anota', async () => {
    puerta(() => bien(compra('Running'), 201));
    const sesion = store.getValidSession();

    const r = await estrategia.pay({ session: sesion, instrument: instrumento() });

    expect(r).toEqual({ accepted: true, reference: 'saga-1' });
    expect(vistas[0]!.url).toBe('/api/flujos/tienda.compra/abrir');
    expect(vistas[0]!.cabeceras['Idempotency-Key']).toBe(sesion.sessionId);
    // NR-1: cada producto viaja como referencia de su clase; la variante sintética del «agregar rápido» es el producto.
    expect(JSON.parse(vistas[0]!.cuerpo ?? '{}')).toEqual({
      lineas: [
        { producto: { kind: 'tienda.producto', id: 'TAZA-001' }, cantidad: 2 },
        { producto: { kind: 'tienda.producto', id: 'CAMI-001:azul' }, cantidad: 1 },
      ],
    });
    expect(store.pricing().totalAmount).toBe(aMenores(75_000, 'COP'));
    expect(api.checkouts).toHaveLength(0);
    expect(api.anotadas).toEqual(['saga-1']);
    expect(llaveRetenida(store.getValidSession())).toBe(sesion.sessionId);
  });

  it('sin coordinador no abre nada y lo dice con su código', async () => {
    const r = await estrategia.pay({ session: store.getValidSession(), instrument: instrumento({ host: undefined }) });

    expect(r).toEqual({ accepted: false, reason: 'cliente.sin_coordinador' });
    expect(api.checkouts).toHaveLength(0);
  });

  it('con cupón la intención es otra (otra llave) y del navegador viaja sólo el código', async () => {
    puerta(() => bien(compra('Running', 67_500), 201));
    const s = store.getValidSession();
    store.setPricing({ ...s.pricing, breakdown: [{ code: 'promo:DIEZ', label: 'DIEZ', amount: -aMenores(7_500, 'COP') }] });

    await estrategia.pay({ session: store.getValidSession(), instrument: instrumento() });

    expect(vistas[0]!.cabeceras['Idempotency-Key']).toBe(llaveDeLaIntencion(s.sessionId, 'DIEZ'));
    expect(vistas[0]!.cabeceras['Idempotency-Key']).not.toBe(s.sessionId);
    expect(JSON.parse(vistas[0]!.cuerpo ?? '{}')).toMatchObject({ promocion: 'DIEZ' });
    expect(store.pricing().breakdown.map((l) => l.code)).toEqual(['promo:DIEZ']);
  });

  it('un «no» del negocio suelta la llave; uno transitorio la retiene y el reintento abre con ESA llave', async () => {
    puerta(() => mal(rechazo('inventory.insufficient_stock', 409)));
    const negado = await estrategia.pay({ session: store.getValidSession(), instrument: instrumento() });
    expect(negado).toEqual({ accepted: false, reason: 'inventory.insufficient_stock' });
    expect(llaveRetenida(store.getValidSession())).toBeNull();
    flujo.remove();

    puerta(() => mal(rechazo('inventory.unreachable', 503, true)));
    await estrategia.pay({ session: store.getValidSession(), instrument: instrumento() });
    const retenida = llaveRetenida(store.getValidSession());
    expect(retenida).not.toBeNull();
    // Aunque ahora la sesión diga un cupón: la saga de la llave retenida puede estar viva.
    const s = store.getValidSession();
    store.setPricing({ ...s.pricing, breakdown: [{ code: 'promo:DIEZ', label: 'DIEZ', amount: -1 }] });
    await estrategia.pay({ session: store.getValidSession(), instrument: instrumento() });
    expect(vistas[1]!.cabeceras['Idempotency-Key']).toBe(retenida);
  });

  it('un 503 de la puerta no cae a la ruta directa: dos caminos para la misma intención abren dos órdenes', async () => {
    puerta(() => mal(rechazo('puerta.flujo_no_disponible', 503)));

    const r = await estrategia.pay({ session: store.getValidSession(), instrument: instrumento() });

    expect(r).toEqual({ accepted: false, reason: 'puerta.flujo_no_disponible' });
    expect(api.checkouts).toHaveLength(0);
  });

  it('con otra compra de la puerta sin resolver en el servidor no abre; la de esta misma sesión no frena', async () => {
    puerta(() => bien(compra('Running'), 201));
    api.pendientes = bien([{ id: 'saga-otra', numero: 'OTRA0001', total: 1, moneda: 'COP', estado: 'Pending' }]);

    const frenada = await estrategia.pay({ session: store.getValidSession(), instrument: instrumento() });
    expect(frenada).toEqual({ accepted: false, reason: CODIGO_COMPRA_SIN_RESOLVER });
    expect(vistas).toHaveLength(0);

    api.pendientes = bien([{ id: 'saga-1', numero: 'COMPRA01', total: 1, moneda: 'COP', estado: 'Pending' }]);
    const s = store.getValidSession();
    store.setSession({ ...s, items: s.items.map((i) => ({ ...i, selection: { ...i.selection, compra: 'saga-1' } })) });
    expect((await estrategia.pay({ session: store.getValidSession(), instrument: instrumento() })).accepted).toBe(true);
  });

  // ── Por la puerta: cerrar ─────────────────────────────────────────────────────────────────

  async function abierta(): Promise<SessionData> {
    puerta(() => bien(compra('Running'), 201));
    await estrategia.pay({ session: store.getValidSession(), instrument: instrumento() });
    pagoAnotado('saga-1');
    flujo.remove();
    return store.getValidSession();
  }

  it('cerrar lleva la dirección y la confirmación sale de la orden que registró el CMS', async () => {
    const sesion = await abierta();
    puerta(() => bien(compra('Completed')));
    api.orden = bien({
      orderRef: 'saga-1',
      orderNumber: 'COMPRA01',
      status: 'Paid',
      total: 75_000,
      currency: 'COP',
      items: [
        { productId: 'TAZA-001', variantId: null, title: 'Taza', qty: 2, unitPrice: 20_000, lineTotal: 40_000 },
        { productId: 'CAMI-001', variantId: 'azul', title: 'Camiseta — Azul', qty: 1, unitPrice: 35_000, lineTotal: 35_000 },
      ],
    });

    const c = await estrategia.confirm(sesion, instrumento());

    expect(vistas[0]!.url).toBe('/api/flujos/tienda.compra/cerrar?id=saga-1');
    expect(JSON.parse(vistas[0]!.cuerpo ?? '{}')).toEqual({ direccion: DIRECCION });
    expect(api.leidas).toEqual(['saga-1']);
    expect(c.confirmed).toBe(true);
    expect(c.vouchers.map((v) => v.detail)).toEqual([
      { title: 'Taza', qty: 2, orderNumber: 'COMPRA01' },
      { title: 'Camiseta — Azul', qty: 1, orderNumber: 'COMPRA01' },
    ]);
  });

  it('una compra que salió por la puerta se termina por la puerta aunque el CMS ya declare la directa', async () => {
    const sesion = await abierta();
    puerta(() => bien(compra('Completed')));

    const c = await estrategia.confirm(sesion, instrumento({ camino: 'directa' }));

    expect(c.confirmed).toBe(true);
    expect(vistas[0]!.url).toContain('/cerrar');
  });

  it('un cerrar que no contesta bien se CONSULTA: completa se confirma con lo que dijo el orquestador', async () => {
    const sesion = await abierta();
    puerta((p) => (p.url.includes('/cerrar') ? mal(rechazo('puerta.respuesta_invalida', 502)) : bien(compra('Completed'))));

    const c = await estrategia.confirm(sesion, instrumento());

    expect(vistas.map((p) => p.url)).toEqual(['/api/flujos/tienda.compra/cerrar?id=saga-1', '/api/flujos/tienda.compra/consultar?id=saga-1']);
    expect(c.confirmed).toBe(true);
    // Sin la orden del CMS, con las líneas del orquestador y el nombre de la línea del carrito.
    expect(c.vouchers.map((v) => v.detail)).toEqual([
      { title: 'Taza', qty: 2, orderNumber: 'COMPRA01' },
      { title: 'Camiseta', qty: 1, orderNumber: 'COMPRA01' },
    ]);
  });

  it('deshecha tras fallar el despacho dice que se devolvió el cobro, suelta la llave y marca el pago fallido', async () => {
    const sesion = await abierta();
    puerta((p) => (p.url.includes('/cerrar') ? mal(rechazo('fulfillment.carrier_rejected', 409)) : bien(compra('Compensated'))));

    const c = await estrategia.confirm(sesion, instrumento());

    expect(c).toEqual({ confirmed: false, reason: CODIGO_COBRO_DEVUELTO, vouchers: [] });
    expect(compraPendiente(store.getValidSession())).toBeNull();
    expect(store.getValidSession().payments.at(-1)?.status).toBe('failed');
  });

  it('deshecha por otra cosa dice su código, sin hablar de devoluciones', async () => {
    const sesion = await abierta();
    puerta((p) => (p.url.includes('/cerrar') ? mal(rechazo('payments.capture_failed', 409)) : bien(compra('Compensated'))));

    expect((await estrategia.confirm(sesion, instrumento())).reason).toBe('payments.capture_failed');
  });

  it('si la consulta no dice ni completa ni deshecha, no se afirma nada y el pago se queda', async () => {
    const sesion = await abierta();
    puerta((p) => (p.url.includes('/cerrar') ? mal(rechazo('puerta.respuesta_invalida', 502)) : bien(compra('Running'))));

    const c = await estrategia.confirm(sesion, instrumento());

    expect(c.reason).toBe(CODIGO_SIN_SABER);
    expect(store.getValidSession().payments.at(-1)?.status).toBe('captured');
    expect(compraPendiente(store.getValidSession())).not.toBeNull();
  });

  it('un cerrar transitorio no consulta: el reintento repite sólo cerrar, que es idempotente', async () => {
    const sesion = await abierta();
    puerta(() => mal(rechazo('payments.unreachable', 503, true)));

    const c = await estrategia.confirm(sesion, instrumento());

    expect(vistas).toHaveLength(1);
    expect(c.reason).toBe('payments.unreachable');
    expect(store.getValidSession().payments.at(-1)?.status).toBe('captured');
  });
});
