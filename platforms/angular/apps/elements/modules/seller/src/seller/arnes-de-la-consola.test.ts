/**
 * El arnés de las specs de la consola (014-despiece-tienda, T013): la consola montada entera, con los dobles que
 * tienen la forma del CMS. Las specs se repartieron por el componente que ejercitan y todas montan lo mismo; lo común
 * vive aquí. `*.test.ts` y no `*.spec.ts`: no lo corre vitest ni lo empaqueta el build del elemento.
 */
import { type Provider, type ProviderToken, provideZonelessChangeDetection, type Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ConsoleShellComponent } from '@synergos/shells';
import { MUESTRAS_DE_LA_CONSOLA } from '@synergos/dominio/tienda';
import { DespachoDeLaConsola } from './estado/despacho';
import { EstadoDeLaConsola } from './estado/estado-de-la-consola';
import { PresentacionDeLaConsola } from './estado/presentacion';
import { ReembolsosDeLaConsola } from './estado/reembolsos';
import { ConsolaPanelComponent } from './vistas/panel/panel';
import { ConsolaPublicarComponent } from './vistas/publicar/publicar';
import { ConsolaMensajesComponent } from './vistas/mensajes/mensajes';
import { SellerElementComponent } from './seller';
import { asentar } from '../../../../../../tools/asentar';
import { SELLER_SYNHOST } from '@synergos/contracts';

/** La configuración de negocio que el CMS manda con los valores base de su sección (ADR 0137). */
export const NEGOCIO_DEL_CMS = { apiBase: SELLER_SYNHOST.ejemplo.apiBase };

/** La demo que DECLARA los ejemplos de la consola (T006): sin esta marca, la consola no los pinta. */
export const CON_MUESTRAS_DE_LA_CONSOLA: Provider[] = [{ provide: MUESTRAS_DE_LA_CONSOLA, useValue: true }];

/**
 * Un pedido como lo emite la bandeja del CMS (`VendedorDeLaTiendaController.PedidoDto`, T011). La consola ya no lee
 * `GET orders`, que es «Mis compras» del comprador (T012).
 */
export const PEDIDO_DEL_CMS = {
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

/** La bandeja como la emite el CMS (`BandejaDto`): una página, las cuentas de la tienda entera y lo no conciliado. */
export function bandejaDelCms(pedidos: readonly object[] = [PEDIDO_DEL_CMS], cambios: object = {}): object {
  return {
    pedidos,
    pagina: 1,
    porPagina: 50,
    total: pedidos.length,
    cuentas: { paid: pedidos.length, preparing: 0, shipped: 0, delivered: 0 },
    sinConciliar: 0,
    ...cambios,
  };
}

/** Un hilo como lo emite hoy `ThreadSummaryDto` del CMS en `GET messages`: `threadId` y no `id`, sin asunto (T030). */
export const HILO_DEL_CMS = {
  threadId: 'th_31',
  contextRef: 'P-9',
  participants: ['comprador@correo.co', 'vendedor@tienda.co'],
  lastMessagePreview: '¿Tiene garantía?',
  lastMessageAt: '2026-09-30T10:00:00+00:00',
  messageCount: 1,
};

/** Un borde que contesta `status` a todo: la sesión vencida (401), el que no es del personal (403), el caído (500). */
export function installStatus(status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'no' }), { status, headers: { 'content-type': 'application/json' } }),
      ),
    ),
  );
}

/** Minimal in-memory localStorage stand-in so the wizard's draft store can persist. */
export function installMemoryStorage(): void {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
  vi.stubGlobal('localStorage', mock);
}

/**
 * Settle a fetch().then() chain — fetch rejection is a macrotask in jsdom, so we
 * yield to real timers between microtask drains to let each hop resolve.
 */
export async function flushMicrotasks(times = 8): Promise<void> {
  await asentar(times);
}

/**
 * Un borde de mentira CON LA FORMA del de verdad, apagable por MÉTODO y RUTA (#77).
 *
 * Hace falta porque los specs de acá tiraban `fetch` entero con `Promise.reject`, y entonces
 * **el sistema bajo prueba es el `catch`** — la regla 16. Tres de ellos afirmaban con todas
 * las letras lo que ese `catch` fabricaba: un RMA «aprobado», un pedido en «preparing» y un
 * recibo `PUB-…`, las tres cosas sin que el servidor existiera. Con la red apagada del todo no
 * hay forma de distinguir «lo publicó» de «se lo inventó».
 *
 * Las rutas que responden son las que el CMS DECLARA (`ShopCatalogController`, `api/shop`); las
 * que no están en esta tabla contestan **404**, que es lo que el CMS hace hoy con
 * `seller/product` y con `order/{ref}/tracking/advance`.
 */
export function installFakeServer(respuestas: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const ruta = url.split('?')[0];
    // Se busca por «MÉTODO ruta» y, si no, por la ruta sola: así un test puede apagar el POST
    // de una ruta cuyo GET sí contesta, que es el caso que de verdad alcanza a una escritura.
    const clave = Object.keys(respuestas).find(
      (k) => k === `${metodo} ${ruta}` || k === ruta || ruta.endsWith(k.replace(/^[A-Z]+ /, '')),
    );
    if (clave === undefined) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(respuestas[clave]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}


/**
 * Lo que cada spec de la consola comparte: montarla y sus capas. Se llama dentro del `describe`, donde deja su
 * `afterEach`; `alMontar` le entrega a la spec el `fixture` y el componente de cada montaje, así que las pruebas se
 * leen igual que en la spec única de antes.
 */
export function prepararLaConsola(
  alMontar: (fixture: ComponentFixture<SellerElementComponent>, component: SellerElementComponent) => void,
) {
  let fixture: ComponentFixture<SellerElementComponent>;
  let component: SellerElementComponent;

  /**
   * La consola montada, por capas (014-despiece-tienda, T011): el estado y los servicios de ESTE elemento (del
   * inyector del shell, que los provee) y, para lo que vive en una vista, la vista pintada.
   */
  function consola() {
    const de = <T>(token: ProviderToken<T>): T => fixture.debugElement.injector.get(token);
    return {
      estado: de(EstadoDeLaConsola),
      despacho: de(DespachoDeLaConsola),
      reembolsos: de(ReembolsosDeLaConsola),
      presentacion: de(PresentacionDeLaConsola),
      vista: <T>(tipo: Type<T>): T => {
        fixture.detectChanges();
        const pintada = fixture.debugElement.query(By.directive(tipo));
        if (!pintada) {
          throw new Error(`${tipo.name} no está pintada`);
        }
        return pintada.componentInstance as T;
      },
    };
  }

  async function createComponent(config: object = NEGOCIO_DEL_CMS, extra: Provider[] = []): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [SellerElementComponent],
      providers: [provideZonelessChangeDetection(), ...extra],
    }).compileComponents();

    fixture = TestBed.createComponent(SellerElementComponent);
    component = fixture.componentInstance;
    alMontar(fixture, component);
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    // Resumen y pedidos cargan en ngOnInit, ya con el config del CMS; que asienten.
    await flushMicrotasks();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });


  return { consola, createComponent };
}

// Lo que las specs usan de lo de arriba, desde un solo sitio.
export { provideZonelessChangeDetection, ComponentFixture, TestBed, By, ConsoleShellComponent, MUESTRAS_DE_LA_CONSOLA, DespachoDeLaConsola, EstadoDeLaConsola, PresentacionDeLaConsola, ReembolsosDeLaConsola, ConsolaPanelComponent, ConsolaPublicarComponent, ConsolaMensajesComponent, SellerElementComponent, asentar, SELLER_SYNHOST };
export type { Provider, ProviderToken, Type };
