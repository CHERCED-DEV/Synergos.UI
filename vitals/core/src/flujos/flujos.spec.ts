// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CABECERA_DE_CORRELACION,
  TECHO_DE_UNA_PETICION_MS,
  crearEnvioPorFetch,
  idAleatorio,
  transportePorDefecto,
  type Enviar,
  type Medida,
  type RechazoDelFlujo,
} from './transporte';
import { OPERACIONES_DE_LA_PUERTA, crearClienteDeLaPuerta, esFlujo, type OperacionesDeLaPuerta } from './puerta';
import {
  ETIQUETA_DEL_COORDINADOR,
  EVENTOS_DEL_FLUJO,
  claseDelCoordinador,
  definirCoordinador,
  hayCoordinador,
  pedirAlFlujo,
  type CoordinadorDelFlujo,
  type DetalleDeResultado,
} from './coordinador';
import { abrirCompraDeEventos, cerrarCompraDeEventos, leerCompra } from './eventos-compra';
import { clasificarRechazo, elegirMensaje } from './rechazos';

/**
 * Los flujos del front (ADR 0140 F4): el transporte, el cliente de la puerta, `<synergos-flujo>` y
 * la compra de Eventos, contra un `fetch` de mentira que contesta con la forma de la puerta de
 * verdad (problem+json con `code` y `transient`, y `title` = la frase HTTP).
 */

type Llamada = { url: string; init: RequestInit };

function json(status: number, cuerpo: unknown, tipo = 'application/json'): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': tipo } });
}

const compra = {
  id: 'saga1',
  buyerKind: 'eventos.comprador',
  buyerId: 'm1',
  eventId: 'ev1',
  status: 'Running',
  total: { amount: 100800, currency: 'COP' },
  held: [{ tier: 'GEN', seat: null, quantity: 2 }],
  pendingCompensations: 0,
  lastError: null,
};

function falsoFetch(respuestas: Array<Response | Error | ((init: RequestInit) => Response | Error)>) {
  const llamadas: Llamada[] = [];
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    const siguiente = respuestas.length > 1 ? respuestas.shift()! : respuestas[0]!;
    const r = typeof siguiente === 'function' ? siguiente(init ?? {}) : siguiente;
    if (r instanceof Error) throw r;
    // Cada llamada recibe un CLON: es la rama de un tee, donde `await body.cancel()` se cuelga.
    return r.clone();
  }) as typeof fetch;
  return { f, llamadas };
}

/** El transporte de PRODUCCIÓN, con el fetch de mentira y sin dormir entre reintentos. */
function transporte(f: typeof fetch, medidas: Medida[] = []): Enviar {
  return transportePorDefecto({ hacerFetch: f, dormir: async () => {}, emitir: (m) => medidas.push(m) });
}

const cabecera = (l: Llamada, n: string) => new Headers(l.init.headers).get(n);

function cliente(f: typeof fetch, medidas: Medida[] = []) {
  return crearClienteDeLaPuerta<OperacionesDeLaPuerta>(OPERACIONES_DE_LA_PUERTA, transporte(f, medidas));
}

// Va PRIMERO: los de abajo definen la etiqueta, y un registro de custom elements no se vacía.
describe('importar no define nada', () => {
  it('importar el módulo no define <synergos-flujo>; definirCoordinador() lo hace, y dos veces no lanza', () => {
    expect(customElements.get(ETIQUETA_DEL_COORDINADOR)).toBeUndefined();
    definirCoordinador();
    expect(() => definirCoordinador()).not.toThrow();
    expect(customElements.get(ETIQUETA_DEL_COORDINADOR)).toBe(claseDelCoordinador());
  });
});

describe('transporte: interceptores', () => {
  it('correlación: 32 hex sin guiones, la MISMA en cada reintento de una lectura', async () => {
    const { f, llamadas } = falsoFetch([new TypeError('red'), json(503, { code: 'flow.busy', transient: true }), json(200, compra)]);
    const r = await cliente(f).llamar('eventos.compra', 'consultar', { consulta: { id: 'saga1' } });
    expect(r.ok).toBe(true);
    expect(llamadas).toHaveLength(3);
    const ids = llamadas.map((l) => cabecera(l, CABECERA_DE_CORRELACION));
    expect(ids[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(new Set(ids).size).toBe(1);
  });

  it('reintento SÓLO de lecturas: un POST transitorio vuelve al llamador sin repetirse', async () => {
    const { f, llamadas } = falsoFetch([json(503, { code: 'flow.busy', transient: true, title: 'Service Unavailable', status: 503 })]);
    const r = await cliente(f).llamar('eventos.compra', 'cerrar', { consulta: { id: 'saga1' } });
    expect(llamadas).toHaveLength(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rechazo).toMatchObject({ code: 'flow.busy', transient: true, status: 503, origen: 'servidor' });
  });

  it('una negativa no se reintenta, ni siquiera en una lectura (404 no transitorio)', async () => {
    const { f, llamadas } = falsoFetch([json(404, { code: 'eventos.purchase_not_found', transient: false })]);
    const r = await cliente(f).llamar('eventos.compra', 'consultar', { consulta: { id: 'x' } });
    expect(llamadas).toHaveLength(1);
    expect(r.ok).toBe(false);
  });

  it('503 puerta.flujo_no_disponible llega con transient:false: no se reintenta y su clase es no_disponible, no reintentable', async () => {
    const { f, llamadas } = falsoFetch([json(503, { title: 'Service Unavailable', status: 503, code: 'puerta.flujo_no_disponible', transient: false }, 'application/problem+json')]);
    const r = await cliente(f).llamar('eventos.compra', 'consultar', { consulta: { id: 's' } });
    expect(llamadas).toHaveLength(1);
    if (r.ok) throw new Error('esperaba rechazo');
    expect(clasificarRechazo(r.rechazo)).toBe('no_disponible');
  });

  it('el rechazo se lee por `code`, NO por `title`: la puerta pone la frase HTTP, y su clase es sesión', async () => {
    const { f } = falsoFetch([
      json(401, { type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'x', code: 'puerta.sesion_requerida', transient: false }, 'application/problem+json'),
    ]);
    const r = await cliente(f).llamar('eventos.compra', 'cerrar', { consulta: { id: 'saga1' } });
    if (r.ok) throw new Error('esperaba rechazo');
    expect(r.rechazo).toMatchObject({ code: 'puerta.sesion_requerida', status: 401, transient: false });
    expect(clasificarRechazo(r.rechazo)).toBe('sesion');
  });

  it('un 502 en HTML (un proxy) es un rechazo de FORMA, transitorio por ser 5xx, y el cuerpo se suelta sin esperar', async () => {
    const { f } = falsoFetch([new Response('<html>bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } })]);
    const r = await cliente(f).llamar('eventos.compra', 'cerrar', { consulta: { id: 'saga1' } });
    if (r.ok) throw new Error('esperaba rechazo');
    expect(r.rechazo).toMatchObject({ code: 'cliente.respuesta_sin_codigo', status: 502, transient: true, origen: 'forma' });
  });

  it('lo que el artefacto agrega al rechazo (purchaseStatus) se conserva aparte', async () => {
    const { f } = falsoFetch([json(409, { code: 'eventos.compra_en_curso', transient: false, purchaseStatus: 'Running' }, 'application/problem+json')]);
    const r = await transporte(f)({ metodo: 'GET', url: '/api/eventos/compras/s/entradas', cabeceras: {}, etiqueta: 'artefacto/entradas' });
    if (r.ok) throw new Error('esperaba rechazo');
    expect(r.rechazo.extra).toEqual({ purchaseStatus: 'Running' });
  });

  it('fetch sin seguir redirecciones (manual): un proxy que manda al login sale cliente.redirigido, de clase sesión y no transitorio', async () => {
    const opaca = { type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() } as unknown as Response;
    // Con `redirect: 'error'` el navegador lanza un TypeError, que parece una caída de red.
    const { f, llamadas } = falsoFetch([(init) => (init.redirect === 'manual' ? ({ clone: () => opaca } as unknown as Response) : new TypeError('Failed to fetch'))]);
    const r = await cliente(f).llamar('eventos.compra', 'cerrar', { consulta: { id: 'saga1' } });
    expect(llamadas[0]!.init).toMatchObject({ redirect: 'manual', credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) throw new Error('esperaba rechazo');
    expect(r.rechazo).toMatchObject({ code: 'cliente.redirigido', transient: false });
    expect(clasificarRechazo(r.rechazo)).toBe('sesion');
  });

  it('techo propio de 35 s, por encima de los 25 de la puerta y los 30 del CMS: sin respuesta, cliente.tiempo_agotado y transitorio', async () => {
    expect(TECHO_DE_UNA_PETICION_MS).toBe(35_000);
    const colgado = ((_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_bien, mal) => init?.signal?.addEventListener('abort', () => mal(new DOMException('aborted', 'AbortError'))))) as typeof fetch;
    const r = await crearEnvioPorFetch({ hacerFetch: colgado, techoMs: 20 })({ metodo: 'POST', url: '/api/flujos/eventos.compra/cerrar?id=s', cabeceras: {}, etiqueta: 'x' });
    if (r.ok) throw new Error('esperaba rechazo');
    expect(r.rechazo).toMatchObject({ code: 'cliente.tiempo_agotado', transient: true, origen: 'red' });
  });

  it('telemetría: una medida por intento, con correlación y code, sin cuerpo ni datos personales', async () => {
    const medidas: Medida[] = [];
    const { f } = falsoFetch([new TypeError('red'), json(200, compra)]);
    await cliente(f, medidas).llamar('eventos.compra', 'consultar', { consulta: { id: 'saga1' } });
    expect(medidas.map((m) => [m.ok, m.code])).toEqual([[false, 'cliente.sin_red'], [true, null]]);
    expect(Object.keys(medidas[0]!).sort()).toEqual(['code', 'correlacion', 'etiqueta', 'metodo', 'ms', 'ok', 'status', 'transient']);
  });
});

describe('cliente de la puerta (la tabla generada)', () => {
  it('abrir sin llave no sale a la red', async () => {
    const { f, llamadas } = falsoFetch([json(201, compra)]);
    const c = cliente(f);
    const r = await (c.llamar as (a: string, b: string, x: unknown) => ReturnType<typeof c.llamar>)('eventos.compra', 'abrir', { cuerpo: {} });
    expect(llamadas).toHaveLength(0);
    if (!r.ok) expect(r.rechazo.code).toBe('cliente.llave_requerida');
  });

  it('una operación que la tabla no tiene no sale a la red', async () => {
    const { f, llamadas } = falsoFetch([json(200, compra)]);
    const c = cliente(f);
    const r = await (c.llamar as (a: string, b: string, x: unknown) => ReturnType<typeof c.llamar>)('eventos.compra', 'reintentar', {});
    expect(llamadas).toHaveLength(0);
    if (!r.ok) expect(r.rechazo.code).toBe('cliente.operacion_desconocida');
  });

  it('abrir: POST a /api/flujos/eventos.compra/abrir con JSON y la llave; cerrar: la consulta lleva sólo lo declarado y sin llave', async () => {
    const { f, llamadas } = falsoFetch([json(201, compra), json(200, compra)]);
    const c = cliente(f);
    const r = await c.llamar('eventos.compra', 'abrir', { cuerpo: { eventId: 'ev1', lines: [{ quantity: 2, tier: 'GEN' }] }, llave: 'k1' });
    expect(llamadas[0]!.url).toBe('/api/flujos/eventos.compra/abrir');
    expect(llamadas[0]!.init.method).toBe('POST');
    expect(cabecera(llamadas[0]!, 'Idempotency-Key')).toBe('k1');
    expect(cabecera(llamadas[0]!, 'Content-Type')).toBe('application/json');
    expect(r.ok && leerCompra(r.valor)).toMatchObject({ id: 'saga1', importe: 100800, moneda: 'COP', apartadas: 2, gratis: false });
    await (c.llamar as (a: string, b: string, x: unknown) => unknown)('eventos.compra', 'cerrar', { consulta: { id: 'a b', colado: '1' } });
    expect(llamadas[1]!.url).toBe('/api/flujos/eventos.compra/cerrar?id=a+b');
    expect(llamadas[1]!.init.method).toBe('POST');
    expect(cabecera(llamadas[1]!, 'Idempotency-Key')).toBeNull();
  });

  it('esFlujo valida contra la tabla: lo del DOM no es frontera', () => {
    expect(esFlujo('eventos.compra')).toBe(true);
    expect(esFlujo('../admin')).toBe(false);
    expect(esFlujo('toString')).toBe(false);
  });
});

describe('<synergos-flujo>: el coordinador', () => {
  beforeAll(() => definirCoordinador());
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function conFetch(sel: string, f: typeof fetch): CoordinadorDelFlujo {
    const c = document.querySelector(sel) as CoordinadorDelFlujo;
    c.enviar = transporte(f);
    return c;
  }

  it('se pinta con display: contents: no cambia el layout de lo que envuelve', () => {
    document.body.innerHTML = '<synergos-flujo id="c" flujo="eventos.compra"></synergos-flujo>';
    expect((document.getElementById('c') as HTMLElement).style.display).toBe('contents');
  });

  it('sin coordinador arriba, el pedido contesta al instante cliente.sin_coordinador (no cuelga) y hayCoordinador dice que no', async () => {
    document.body.innerHTML = '<div><span id="p"></span></div>';
    const p = document.getElementById('p')!;
    expect(hayCoordinador(p, 'eventos.compra')).toBe(false);
    const r = await pedirAlFlujo(p, 'eventos.compra', 'consultar', { consulta: { id: 's' } });
    if (r.ok) throw new Error('esperaba rechazo');
    expect(r.rechazo.code).toBe('cliente.sin_coordinador');
    expect(clasificarRechazo(r.rechazo)).toBe('no_disponible');
  });

  it('el ancestro más cercano DEL MISMO FLUJO atiende; dos regiones no se mezclan', async () => {
    document.body.innerHTML = `
      <synergos-flujo id="a" flujo="eventos.compra"><span id="pa"></span></synergos-flujo>
      <synergos-flujo id="b" flujo="eventos.compra"><span id="pb"></span></synergos-flujo>`;
    const fa = falsoFetch([json(200, { ...compra, id: 'A' })]);
    const fb = falsoFetch([json(200, { ...compra, id: 'B' })]);
    conFetch('#a', fa.f);
    conFetch('#b', fb.f);
    const [ra, rb] = await Promise.all([
      pedirAlFlujo(document.getElementById('pa')!, 'eventos.compra', 'consultar', { consulta: { id: 'A' } }),
      pedirAlFlujo(document.getElementById('pb')!, 'eventos.compra', 'consultar', { consulta: { id: 'B' } }),
    ]);
    expect(ra.ok && ra.valor.id).toBe('A');
    expect(rb.ok && rb.valor.id).toBe('B');
    expect([fa.llamadas.length, fb.llamadas.length]).toEqual([1, 1]);
  });

  it('anidados del mismo flujo: atiende SÓLO el más cercano', async () => {
    document.body.innerHTML =
      '<synergos-flujo id="o" flujo="eventos.compra"><synergos-flujo id="i" flujo="eventos.compra"><span id="p"></span></synergos-flujo></synergos-flujo>';
    const fo = falsoFetch([json(200, compra)]);
    const fi = falsoFetch([json(200, compra)]);
    conFetch('#o', fo.f);
    conFetch('#i', fi.f);
    await pedirAlFlujo(document.getElementById('p')!, 'eventos.compra', 'consultar', { consulta: { id: 's' } });
    expect([fi.llamadas.length, fo.llamadas.length]).toEqual([1, 0]);
  });

  it('un flujo desconocido en el atributo (el DOM no es frontera) no sale a la red: atiende el de afuera que sí lo es', async () => {
    document.body.innerHTML =
      '<synergos-flujo id="c" flujo="eventos.compra"><synergos-flujo id="x" flujo="../admin"><span id="p"></span></synergos-flujo></synergos-flujo>';
    const fx = falsoFetch([json(200, compra)]);
    const fc = falsoFetch([json(200, compra)]);
    conFetch('#x', fx.f);
    conFetch('#c', fc.f);
    const r = await pedirAlFlujo(document.getElementById('p')!, 'eventos.compra', 'consultar', { consulta: { id: 's' } });
    expect(r.ok).toBe(true);
    expect(fx.llamadas).toHaveLength(0);
    expect(fc.llamadas).toHaveLength(1);
  });

  it('un pedido con otro número de protocolo se rechaza sin tocar la red', async () => {
    document.body.innerHTML = '<synergos-flujo id="c" flujo="eventos.compra"><span id="p"></span></synergos-flujo>';
    const fc = falsoFetch([json(200, compra)]);
    conFetch('#c', fc.f);
    const p = document.getElementById('p')!;
    const resultado = new Promise<DetalleDeResultado>((r) =>
      p.addEventListener(EVENTOS_DEL_FLUJO.resultado, (e) => r((e as CustomEvent<DetalleDeResultado>).detail), { once: true }),
    );
    p.dispatchEvent(
      new CustomEvent(EVENTOS_DEL_FLUJO.pedir, {
        bubbles: true,
        composed: true,
        detail: { protocolo: 2, flujo: 'eventos.compra', solicitud: 's1', operacion: 'consultar', consulta: { id: 's' } },
      }),
    );
    const d = await resultado;
    expect(d.outcome).toBe('failure');
    expect(!d.resultado.ok && d.resultado.rechazo.code).toBe('cliente.protocolo_distinto');
    expect(fc.llamadas).toHaveLength(0);
  });

  it('doble clic: dos pedidos iguales en vuelo son UNA llamada; aria-busy y ocupado sólo en los bordes', async () => {
    document.body.innerHTML = '<synergos-flujo id="c" flujo="eventos.compra"><span id="p"></span></synergos-flujo>';
    let soltar!: () => void;
    const puerta = new Promise<void>((r) => (soltar = r));
    const llamadas: string[] = [];
    const f = (async (u: RequestInfo | URL) => {
      llamadas.push(String(u));
      await puerta;
      return json(201, compra);
    }) as typeof fetch;
    const c = conFetch('#c', f);
    const p = document.getElementById('p')!;
    expect(hayCoordinador(p, 'eventos.compra')).toBe(true);
    const ocupado: boolean[] = [];
    p.addEventListener(EVENTOS_DEL_FLUJO.ocupado, (e) => ocupado.push((e as CustomEvent<{ ocupado: boolean }>).detail.ocupado));
    const args = { cuerpo: { eventId: 'ev1', lines: [{ quantity: 1 }] }, llave: 'k1' } as const;
    const uno = pedirAlFlujo(p, 'eventos.compra', 'abrir', args);
    const dos = pedirAlFlujo(p, 'eventos.compra', 'abrir', args);
    await Promise.resolve();
    expect(c.hasAttribute('aria-busy')).toBe(true);
    soltar();
    const [r1, r2] = await Promise.all([uno, dos]);
    expect(llamadas).toHaveLength(1);
    expect(r1.ok && r2.ok).toBe(true);
    expect(c.hasAttribute('aria-busy')).toBe(false);
    expect(ocupado).toEqual([true, false]);
  });

  it('la compra de Eventos: abrir con su llave y cerrar con el id, leídas con el contrato generado', async () => {
    document.body.innerHTML = '<synergos-flujo id="c" flujo="eventos.compra"><span id="p"></span></synergos-flujo>';
    const { f, llamadas } = falsoFetch([json(201, compra), json(200, { ...compra, status: 'Completed' })]);
    conFetch('#c', f);
    const p = document.getElementById('p')!;
    const abierta = await abrirCompraDeEventos(p, { eventId: 'ev1', lines: [{ quantity: 2, tier: 'GEN' }] }, 'sess-1');
    expect(abierta.ok && abierta.valor).toEqual({ id: 'saga1', estado: 'Running', importe: 100800, moneda: 'COP', gratis: false, apartadas: 2 });
    const cerrada = await cerrarCompraDeEventos(p, 'saga1');
    expect(cerrada.ok && cerrada.valor.estado).toBe('Completed');
    expect(llamadas.map((l) => [l.init.method, l.url, cabecera(l, 'Idempotency-Key')])).toEqual([
      ['POST', '/api/flujos/eventos.compra/abrir', 'sess-1'],
      ['POST', '/api/flujos/eventos.compra/cerrar?id=saga1', null],
    ]);
  });
});

describe('orden de definición: el coordinador que llega TARDE', () => {
  it('como bundle propio que carga después: sin espera se pierde; con espera y re-anuncio se atiende', async () => {
    document.body.innerHTML = '<synergos-flujo-tarde id="c" flujo="eventos.compra"><span id="p"></span></synergos-flujo-tarde>';
    const p = document.getElementById('p')!;
    const sin = await pedirAlFlujo(p, 'eventos.compra', 'consultar', { consulta: { id: 's' } });
    expect(!sin.ok && sin.rechazo.code).toBe('cliente.sin_coordinador');
    const f = falsoFetch([json(200, compra)]);
    const conEspera = pedirAlFlujo(p, 'eventos.compra', 'consultar', { consulta: { id: 's' } }, { esperarCoordinadorMs: 500 });
    const Base = claseDelCoordinador();
    setTimeout(() => {
      customElements.define(
        'synergos-flujo-tarde',
        class extends Base {
          constructor() {
            super();
            this.enviar = transporte(f.f);
          }
        },
      );
    }, 20);
    const r = await conEspera;
    expect(r.ok).toBe(true);
    expect(f.llamadas).toHaveLength(1);
  });

  // Que cada participante la DEFINA al cargar su bundle (la decisión 2 de la F4) no se prueba acá:
  // lo vigila `tools/lib/coordinador-de-los-participantes.mjs` sobre la entrada de cada uno.
  it('con la etiqueta ya definida cuando sale el pedido, se atiende sin esperar ningún re-anuncio', async () => {
    document.body.innerHTML = '<synergos-flujo id="c" flujo="eventos.compra"><span id="p"></span></synergos-flujo>';
    const f = falsoFetch([json(200, compra)]);
    (document.getElementById('c') as CoordinadorDelFlujo).enviar = transporte(f.f);
    const r = await pedirAlFlujo(document.getElementById('p')!, 'eventos.compra', 'consultar', { consulta: { id: 's' } });
    expect(r.ok).toBe(true);
  });
});

describe('rechazos: la clase sale del code; el texto lo pone la funcionalidad', () => {
  const r = (code: string, transient = false, status = 400): RechazoDelFlujo => ({ code, transient, status, detail: '', origen: 'servidor', extra: {} });

  it('el catálogo de la puerta y del cliente cae en su clase, y lo del dominio es una negativa', () => {
    expect(clasificarRechazo(r('puerta.sesion_requerida', false, 401))).toBe('sesion');
    expect(clasificarRechazo(r('puerta.tiempo_agotado', true, 504))).toBe('reintentable');
    expect(clasificarRechazo(r('flow.busy', true, 503))).toBe('reintentable');
    expect(clasificarRechazo(r('puerta.flujo_no_disponible', false, 503))).toBe('no_disponible');
    expect(clasificarRechazo(r('eventos.artefacto_no_disponible', false, 503))).toBe('no_disponible');
    expect(clasificarRechazo(r('puerta.llave_rechazada', false, 502))).toBe('defecto');
    expect(clasificarRechazo(r('pricing.price_not_in_effect', false, 400))).toBe('negado');
    expect(clasificarRechazo(r('inventory.insufficient_stock', false, 409))).toBe('negado');
  });

  it('el texto por code gana; si no, el de su clase (los códigos no se enumeran)', () => {
    const porClase = { sesion: 'S', reintentable: 'R', no_disponible: 'N', defecto: 'D', negado: 'G' };
    expect(elegirMensaje(r('pricing.price_not_in_effect'), { 'pricing.price_not_in_effect': 'La venta cerró' }, porClase)).toBe('La venta cerró');
    expect(elegirMensaje(r('inventory.algo_nuevo'), {}, porClase)).toBe('G');
    expect(elegirMensaje(r('toString'), {}, porClase)).toBe('G');
  });
});

describe('fuera de un contexto seguro (http://synergos.local:5000): sin crypto.randomUUID', () => {
  // En http, `crypto.randomUUID` vale undefined (WebCrypto lo marca [SecureContext]) y
  // `getRandomValues` sí existe: medido en Chromium con isSecureContext=false (ADR 0140 F4).
  const real = globalThis.crypto;
  beforeAll(() => definirCoordinador());
  beforeEach(() => vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) }));
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('abrir la compra SALE a la red, con una correlación de 32 hex y una solicitud propia', async () => {
    expect((globalThis.crypto as Partial<Crypto>).randomUUID).toBeUndefined();
    document.body.innerHTML = '<synergos-flujo id="c" flujo="eventos.compra"><span id="p"></span></synergos-flujo>';
    const { f, llamadas } = falsoFetch([json(201, compra)]);
    (document.getElementById('c') as CoordinadorDelFlujo).enviar = transporte(f);
    const p = document.getElementById('p')!;
    const solicitudes: string[] = [];
    p.parentElement!.addEventListener(EVENTOS_DEL_FLUJO.pedir, (e) => solicitudes.push((e as CustomEvent<{ solicitud: string }>).detail.solicitud), { capture: true });

    const r = await abrirCompraDeEventos(p, { eventId: 'ev1', lines: [{ quantity: 2, tier: 'GEN' }] }, 'sess-1');

    expect(r.ok).toBe(true);
    expect(llamadas).toHaveLength(1);
    expect(cabecera(llamadas[0]!, CABECERA_DE_CORRELACION)).toMatch(/^[0-9a-f]{32}$/);
    expect(solicitudes).toHaveLength(1);
    expect(solicitudes[0]).toMatch(/^[0-9a-f]{32}$/);
  });

  it('idAleatorio da 32 hex distintos cada vez', () => {
    const ids = new Set(Array.from({ length: 50 }, () => idAleatorio()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('un envío que LANZA también contesta: el pedido recibe cliente.fallo_interno y no se cuelga', async () => {
    document.body.innerHTML = '<synergos-flujo id="c" flujo="eventos.compra"><span id="p"></span></synergos-flujo>';
    (document.getElementById('c') as CoordinadorDelFlujo).enviar = () => {
      throw new TypeError('crypto.randomUUID is not a function');
    };
    const r = await pedirAlFlujo(document.getElementById('p')!, 'eventos.compra', 'consultar', { consulta: { id: 's' } });
    if (r.ok) throw new Error('esperaba rechazo');
    expect(r.rechazo.code).toBe('cliente.fallo_interno');
    expect(clasificarRechazo(r.rechazo)).toBe('defecto');
  });
});
