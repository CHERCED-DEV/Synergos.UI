import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HostIdentityService } from '@synergos/core';
import { FULFILLMENT_STRATEGIES, SessionStore } from '@synergos/transaction-engine';
import {
  aMenores,
  definirCoordinador,
  type CoordinadorDelFlujo,
  type Enviar,
  type Peticion,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';
import { asentar } from '../../../../../../tools/asentar';
import { ShopApiClient } from './shop-api.client';
import { ShopFulfillmentStrategy, llaveRetenida } from './shop-fulfillment.strategy';
import { StorefrontElementComponent } from './storefront';
import type { ShopProduct } from './shop.model';

/**
 * El storefront por la puerta (004-tienda-compra: T021, T025, T030, T036, T043): lo que el ELEMENTO hace con
 * el camino que declara el CMS —la sesión antes de pagar, el cupón que cotiza el servidor, el carrito fijo
 * mientras una compra pueda cobrar, el enlace del aviso— y lo que dice por cada código. Contra un
 * `<synergos-flujo>` de verdad con el cable sustituido; la estrategia, sus caminos, en su propia spec.
 */

const PUERTA = { apiBase: '/api/shop', purchasePath: 'puerta', shippingCountry: 'CO' };
const DIRECTA = { apiBase: '/api/shop', purchasePath: 'directa', shippingCountry: 'CO' };

const TAZA: ShopProduct = {
  id: 'TAZA-001',
  title: 'Taza',
  subtitle: '',
  amount: 20_000,
  currency: 'COP',
  images: [],
  rating: 0,
  reviewCount: 0,
  badges: [],
  inStock: true,
  category: 'Hogar',
  seller: 'Synergos',
} as unknown as ShopProduct;

const CAMISETA = { ...TAZA, id: 'CAMI-001', title: 'Camiseta' } as ShopProduct;

function memoria(): void {
  const datos = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() {
      return datos.size;
    },
    clear: () => datos.clear(),
    getItem: (k: string) => datos.get(k) ?? null,
    key: (i: number) => Array.from(datos.keys())[i] ?? null,
    removeItem: (k: string) => datos.delete(k),
    setItem: (k: string, v: string) => datos.set(k, v),
  } as Storage);
}

/** El registro del CMS: la orden de la compra del enlace, y lo que se le pidió. El catálogo, sin red. */
function registro(orden: (id: string) => { status: number; body: unknown }): string[] {
  const vistas: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const ruta = new URL(String(url), 'http://sitio.test').pathname;
      vistas.push(`${(init?.method ?? 'GET').toUpperCase()} ${ruta}`);
      const id = /^\/api\/shop\/compras\/([^/]+)$/.exec(ruta)?.[1];
      if (!id || id === 'pendientes') {
        return Promise.reject(new Error('offline'));
      }
      const { status, body } = orden(decodeURIComponent(id));
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': status < 300 ? 'application/json' : 'application/problem+json' },
        }),
      );
    }),
  );
  return vistas;
}

const ORDEN_PAGADA = {
  orderRef: 'saga-1',
  orderNumber: 'COMPRA01',
  status: 'Paid',
  total: 40_000,
  currency: 'COP',
  items: [{ productId: 'TAZA-001', variantId: null, title: 'Taza', qty: 2, unitPrice: 20_000, lineTotal: 40_000 }],
};

const bien = <T>(valor: T): ResultadoDelFlujo<T> => ({ ok: true, valor, estado: 200, correlacion: '' });
const mal = (code: string, status: number): ResultadoDelFlujo<never> => ({
  ok: false,
  rechazo: { code, status, transient: false, detail: '', origen: 'servidor', extra: {} },
  correlacion: '',
});

describe('StorefrontElementComponent por la puerta (004-tienda-compra)', () => {
  beforeAll(() => definirCoordinador());

  let fixture: ComponentFixture<StorefrontElementComponent>;
  let component: StorefrontElementComponent;
  let flujo: CoordinadorDelFlujo;
  const pedidos: Peticion[] = [];
  let responder: (p: Peticion) => ResultadoDelFlujo<unknown> = () => mal('puerta.flujo_no_disponible', 503);
  const autenticado = signal(true);

  async function crear(config: object): Promise<void> {
    pedidos.length = 0;
    await TestBed.configureTestingModule({
      imports: [StorefrontElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        ShopApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: ShopFulfillmentStrategy, multi: true },
        {
          provide: HostIdentityService,
          useValue: { isAuthenticated: autenticado, displayName: signal('Ana'), email: signal('ana@ejemplo.co') },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StorefrontElementComponent);
    component = fixture.componentInstance;
    // El participante va DENTRO de su coordinador, como lo coloca la vista del CMS.
    flujo = document.createElement('synergos-flujo') as CoordinadorDelFlujo;
    flujo.setAttribute('flujo', 'tienda.compra');
    const enviar: Enviar = (p) => {
      pedidos.push(p);
      return Promise.resolve(responder(p));
    };
    flujo.enviar = enviar;
    document.body.appendChild(flujo);
    flujo.appendChild(fixture.nativeElement as HTMLElement);
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    await asentar(8);
  }

  async function asentado(): Promise<void> {
    await asentar(8);
    fixture.detectChanges();
  }

  /** Lo que dejaría `pay` por la puerta: la llave retenida, el camino y el id de la saga en las líneas. */
  function compraAbierta(): void {
    const store = TestBed.inject(SessionStore);
    const s = store.getValidSession();
    store.setSession({
      ...s,
      items: s.items.map((i) => ({ ...i, holdRef: s.sessionId, selection: { ...i.selection, camino: 'puerta', compra: 'saga-1' } })),
    });
  }

  beforeEach(() => {
    memoria();
    autenticado.set(true);
    responder = () => mal('puerta.flujo_no_disponible', 503);
    window.history.replaceState(null, '', '/tienda/');
  });

  afterEach(() => {
    flujo?.remove();
    window.location.hash = '';
    window.history.replaceState(null, '', '/');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── La sesión antes de pagar (T021) ───────────────────────────────────────────────────────

  it('por la puerta y sin sesión, el checkout pide entrar ANTES de pagar; con sesión, el asistente', async () => {
    registro(() => ({ status: 404, body: {} }));
    autenticado.set(false);
    await crear(PUERTA);
    component.quickAdd(TAZA);
    await asentado();

    component.goToCheckout();
    fixture.detectChanges();

    const raiz = fixture.nativeElement as HTMLElement;
    expect(raiz.querySelector('.storefront__sesion')?.textContent).toContain('Inicia sesión para comprar');
    expect(raiz.querySelector('syn-checkout-wizard')).toBeNull();
    expect(raiz.querySelector('.storefront__sesion a')?.getAttribute('href')).toMatch(/^\/account\/login\?returnUrl=/);

    autenticado.set(true);
    fixture.detectChanges();
    expect(raiz.querySelector('syn-checkout-wizard')).not.toBeNull();
  });

  it('por la ruta directa no se pide sesión: el checkout de siempre', async () => {
    registro(() => ({ status: 404, body: {} }));
    autenticado.set(false);
    await crear(DIRECTA);
    component.quickAdd(TAZA);
    await asentado();

    component.goToCheckout();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('syn-checkout-wizard')).not.toBeNull();
  });

  // ── Lo que se dice por cada código (T021, T025) ───────────────────────────────────────────

  it('los fallos de la compra por la puerta se dicen por su código, y un 401 vuelve al panel de sesión', async () => {
    registro(() => ({ status: 404, body: {} }));
    await crear(PUERTA);
    const decir = component.checkoutConfig().mensajeDeFallo!;

    expect(decir('tienda.cobro_devuelto', '')).toContain('te devolvimos el cobro');
    expect(decir('payments.payment_declined', '')).toContain('otro medio de pago');
    expect(decir('inventory.insufficient_stock', '')).toContain('No quedan unidades');
    expect(decir('tienda.compra_sin_saber', 'saga-9')).toContain('saga-9');
    expect(decir('puerta.flujo_no_disponible', '')).toContain('no está disponible');
    // Lo que no es de la persona cae a los avisos del asistente, que nombran lo que QUEDÓ.
    expect(decir('puerta.respuesta_invalida', '')).toBeNull();

    expect(component.sesionRequerida()).toBe(false);
    expect(decir('puerta.sesion_requerida', '')).toContain('Tu sesión terminó');
    expect(component.sesionRequerida()).toBe(true);
    expect(component.pideSesion()).toBe(true);
  });

  it('por la ruta directa el asistente usa sus avisos de un cobro, sin los de la puerta', async () => {
    registro(() => ({ status: 404, body: {} }));
    await crear(DIRECTA);

    expect(component.checkoutConfig().mensajeDeFallo).toBeUndefined();
  });

  // ── El cupón: lo cotiza el servidor (T043) ────────────────────────────────────────────────

  it('por la directa el cupón no se pinta; por la puerta sí', async () => {
    registro(() => ({ status: 404, body: {} }));
    await crear(DIRECTA);
    component.quickAdd(TAZA);
    await asentado();
    component.goToCart();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('syn-promo-code')).toBeNull();

    TestBed.resetTestingModule();
    flujo.remove();
    await crear(PUERTA);
    component.quickAdd(TAZA);
    await asentado();
    component.goToCart();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('syn-promo-code')).not.toBeNull();
  });

  it('por la puerta el cupón lo cotiza el SERVIDOR: viaja sólo el código, sin llave, y el descuento es el suyo', async () => {
    registro(() => ({ status: 404, body: {} }));
    await crear(PUERTA);
    component.quickAdd(TAZA);
    await asentado();
    responder = () =>
      bien({
        flujo: 'tienda.compra',
        datos: {
          lineasDelPedido: null,
          subtotal: { amount: 20_000, currency: 'COP' },
          descuento: { amount: 2_000, currency: 'COP' },
          impuesto: null,
          total: { amount: 18_000, currency: 'COP' },
          pedido: null,
          envio: null,
        },
      });

    await component.applyPromo(' diez ');

    expect(pedidos[0]!.url).toBe('/api/flujos/tienda.compra/cotizar');
    expect(pedidos[0]!.cabeceras['Idempotency-Key']).toBeUndefined();
    expect(JSON.parse(pedidos[0]!.cuerpo ?? '{}')).toEqual({
      lineas: [{ producto: { kind: 'tienda.producto', id: 'TAZA-001' }, cantidad: 1 }],
      promocion: 'DIEZ',
    });
    expect(component.promo()).toMatchObject({ code: 'DIEZ', amountMinor: -aMenores(2_000, 'COP') });
  });

  it('un código que no existe o con demasiados intentos se dice por su motivo, y no se aplica nada', async () => {
    registro(() => ({ status: 404, body: {} }));
    await crear(PUERTA);
    component.quickAdd(TAZA);
    await asentado();

    responder = () => mal('pricing.promotion_not_found', 404);
    await component.applyPromo('NOPE');
    expect(component.promoRejection()).toBe('unknown');

    responder = () => mal('tienda.demasiados_codigos', 409);
    await component.applyPromo('DIEZ');
    expect(component.promoRejection()).toBe('too-many-attempts');
    expect(component.promo()).toBeNull();
  });

  // ── La compra pendiente (T024, T036) ──────────────────────────────────────────────────────

  it('con una compra por la puerta sin terminar, el carrito y el cupón no cambian y el aviso ofrece terminar o cancelar', async () => {
    registro(() => ({ status: 404, body: {} }));
    await crear(PUERTA);
    component.quickAdd(TAZA);
    await asentado();
    compraAbierta();

    component.quickAdd(CAMISETA);
    await component.applyPromo('DIEZ');
    await asentado();

    const store = TestBed.inject(SessionStore);
    expect(store.items().map((i) => i.productRef)).toEqual(['TAZA-001']);
    expect(pedidos).toHaveLength(0);
    expect(component.avisoDePendiente()).toBe(true);
    expect(component.cuponFijado()).toBe(true);
    const botones = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.storefront__aviso-de-compra button')).map(
      (b) => b.textContent?.trim(),
    );
    expect(botones).toEqual(['Terminar mi compra', 'Cancelar esa compra']);
  });

  it('cancelar la pendiente la deshace en el orquestador y deja el carrito libre', async () => {
    registro(() => ({ status: 404, body: {} }));
    await crear(PUERTA);
    component.quickAdd(TAZA);
    await asentado();
    compraAbierta();
    responder = () =>
      bien({
        id: 'saga-1',
        flujo: 'tienda.compra',
        numero: 'COMPRA01',
        estado: 'Compensated',
        datos: { lineasDelPedido: null, subtotal: null, descuento: null, impuesto: null, total: null, pedido: null, envio: null },
        compensacionesPendientes: 0,
        error: null,
        deshaciendo: false,
      });

    await component.cancelarPendiente();

    expect(pedidos.map((p) => p.url)).toEqual(['/api/flujos/tienda.compra/cancelar?id=saga-1']);
    expect(llaveRetenida(TestBed.inject(SessionStore).getValidSession())).toBeNull();
    expect(component.compraSinTerminar()).toBeNull();
    expect(component.avisoDePendiente()).toBe(false);
  });

  // ── El enlace del aviso (T030) ────────────────────────────────────────────────────────────

  it('el enlace del aviso se lee UNA vez de la consulta, sale de la URL y abre la compra; recargar no la vuelve a abrir', async () => {
    const vistas = registro(() => ({ status: 200, body: ORDEN_PAGADA }));
    window.history.replaceState(null, '', '/tienda/?compra=saga-1&utm=correo');

    await crear(PUERTA);
    await asentado();

    expect(vistas).toContain('GET /api/shop/compras/saga-1');
    expect(component.view()).toBe('confirmation');
    expect(component.orderNumber()).toBe('COMPRA01');
    expect(component.confirmedItems()).toEqual([{ title: 'Taza', qty: 2, reference: 'COMPRA01' }]);
    expect(window.location.search).toBe('?utm=correo');

    // F5: la página se crea otra vez, sin el parámetro.
    TestBed.resetTestingModule();
    flujo.remove();
    await crear(PUERTA);
    await asentado();
    expect(component.view()).not.toBe('confirmation');
  });

  it('el enlace sin sesión pide entrar «para ver tu compra», y el login vuelve CON la compra', async () => {
    const vistas = registro(() => ({ status: 200, body: ORDEN_PAGADA }));
    autenticado.set(false);
    window.history.replaceState(null, '', '/tienda/?compra=saga-1');

    await crear(PUERTA);
    await asentado();

    expect(vistas.filter((v) => v.includes('/compras/'))).toEqual([]);
    expect(component.avisoDelEnlace()).toContain('Inicia sesión para ver tu compra');
    expect(decodeURIComponent(component.loginUrl())).toContain('/tienda/?compra=saga-1');
  });

  it('una compra ajena o que no existe es «no la encontramos», sin pintar ninguna confirmación', async () => {
    registro(() => ({ status: 404, body: { code: 'tienda.purchase_not_found', status: 404, transient: false } }));
    window.history.replaceState(null, '', '/tienda/?compra=de-otro');

    await crear(PUERTA);
    await asentado();

    expect(component.avisoDelEnlace()).toContain('No encontramos esta compra');
    expect(component.view()).not.toBe('confirmation');
  });
});
