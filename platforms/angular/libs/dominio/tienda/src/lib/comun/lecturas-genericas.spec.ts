import { TestBed } from '@angular/core/testing';
import { CatalogoApi } from '../catalogo/catalogo-api.client';
import { MensajesDelVendedorApi } from '../consola/mensajes-api.client';
import { DeseosApi } from '../deseos/deseos-api.client';
import { DevolucionesApi } from '../devoluciones/devoluciones-api.client';
import { MensajesApi } from '../mensajes/mensajes-api.client';
import { PedidosApi } from '../pedidos/pedidos-api.client';
import { LecturasDeLaTienda } from './lecturas';

/**
 * Los adaptadores de la tienda sobre las lecturas genéricas `api/lecturas/{vertical}` (014-despiece-tienda, I4).
 *
 * Los dobles son la respuesta del SERVIDOR, con la forma que afirman las pruebas de contrato del CMS
 * (`Synergos.CMS.Tests/Controllers/Lecturas`): si la forma de la pantalla se colara aquí, el doble certificaría la
 * deriva en vez de cazarla.
 */
const LECTURAS = '/api/lecturas/tienda';

const ELEMENTO = {
  id: 'tec-audifonos-anc',
  titulo: 'Audífonos Inalámbricos ANC',
  imagen: '/media/shop/audifonos-anc.jpg',
  precio: { monto: 680000, moneda: 'COP', texto: '$ 680.000' },
  calificacion: { promedio: 4.5, cantidad: 1 },
  disponibles: 58,
  atributos: { marca: 'Sonido', categoria: 'Tecnología' },
};

const PRECIO = { monto: 680000, moneda: 'COP', texto: '$ 680.000' };

type Respuesta = { readonly estado?: number; readonly cuerpo?: unknown };

/** Un `fetch` que contesta por camino (sin la query) y guarda lo que se pidió. */
function contestar(respuestas: Readonly<Record<string, Respuesta>>): string[] {
  const pedidas: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      pedidas.push(String(url));
      const respuesta = respuestas[String(url).split('?')[0]] ?? { estado: 404, cuerpo: { error: 'No existe.' } };
      const estado = respuesta.estado ?? 200;
      return Promise.resolve({ ok: estado < 400, status: estado, json: () => Promise.resolve(respuesta.cuerpo) } as Response);
    }),
  );
  return pedidas;
}

describe('Las lecturas genéricas de la tienda', () => {
  const degradado = (): boolean => TestBed.inject(LecturasDeLaTienda).degraded;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('el listado pide el catálogo genérico con cada faceta por su campo y lee la tarjeta neutra', async () => {
    const pedidas = contestar({
      [`${LECTURAS}/catalogo`]: {
        cuerpo: {
          elementos: [ELEMENTO],
          facetas: [
            { campo: 'brand', titulo: 'Marca', tipo: 'MultiSelect', valores: [{ valor: 'Sonido', etiqueta: 'Sonido', cantidad: 1 }] },
          ],
          total: 30,
          pagina: 2,
          porPagina: 12,
        },
      },
    });

    const resultado = await TestBed.inject(CatalogoApi).search(
      '/api/shop',
      { q: 'audio', category: '', facets: { brand: ['Sonido', 'Aurora'] }, sort: 'price-asc', page: 2 },
      'COP',
      LECTURAS,
    );

    const url = new URL(pedidas[0], 'http://sitio');
    expect(url.pathname).toBe(`${LECTURAS}/catalogo`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      texto: 'audio',
      orden: 'price-asc',
      pagina: '2',
      'filtro.brand': 'Sonido,Aurora',
    });
    expect(resultado.total).toBe(30);
    expect(resultado.products[0]).toMatchObject({
      id: 'tec-audifonos-anc',
      title: 'Audífonos Inalámbricos ANC',
      amount: 680000,
      currency: 'COP',
      brand: 'Sonido',
      category: 'Tecnología',
      rating: 4.5,
      reviewCount: 1,
      inStock: true,
      images: ['/media/shop/audifonos-anc.jpg'],
    });
    expect(resultado.facets[0]).toEqual({
      key: 'brand',
      label: 'Marca',
      kind: 'MultiSelect',
      values: [{ value: 'Sonido', label: 'Sonido', count: 1 }],
    });
    expect(degradado()).toBe(false);
  });

  it('la ficha junta la ficha genérica y sus reseñas, y quien lo compró puede reseñar', async () => {
    contestar({
      [`${LECTURAS}/catalogo/tec-audifonos-anc`]: {
        cuerpo: {
          elemento: ELEMENTO,
          descripcion: 'Audífonos over-ear con cancelación activa de ruido.',
          imagenes: ['/media/shop/audifonos-anc.jpg', '/media/shop/audifonos-anc-2.jpg'],
          opciones: [{ id: 'tec-audifonos-anc-negro', titulo: 'Negro medianoche', precio: PRECIO, disponibles: 40 }],
          preguntas: [{ autor: 'Laura P.', pregunta: '¿Trae estuche?', respuesta: null, fecha: '2026-05-01' }],
        },
      },
      [`${LECTURAS}/catalogo/tec-audifonos-anc/resenas`]: {
        cuerpo: {
          id: 'tec-audifonos-anc',
          resumen: { promedio: 5, cantidad: 1 },
          resenas: [
            { autor: 'Ana Compradora', calificacion: 5, titulo: 'Llegó perfecta', texto: 'Rápida y liviana.', fecha: '2026-07-01', verificada: true },
          ],
          puedeResenar: true,
        },
      },
    });

    const ficha = await TestBed.inject(CatalogoApi).product('/api/shop', 'tec-audifonos-anc', 'COP', LECTURAS);

    expect(ficha.product.images).toHaveLength(2);
    expect(ficha.description).toBe('Audífonos over-ear con cancelación activa de ruido.');
    expect(ficha.variants).toEqual([
      { variantId: 'tec-audifonos-anc-negro', label: 'Negro medianoche', attributes: {}, amount: 680000, inStock: true, stock: 40 },
    ]);
    expect(ficha.questions[0]).toMatchObject({ author: 'Laura P.', question: '¿Trae estuche?', answer: undefined });
    expect(ficha.reviews[0]).toMatchObject({ author: 'Ana Compradora', rating: 5, body: 'Rápida y liviana.', date: '2026-07-01' });
    expect(ficha.canReview).toBe(true);
    expect(degradado()).toBe(false);
  });

  it('si las reseñas no llegan, la ficha sale sin ellas y sin el formulario, y no se pinta como ejemplo', async () => {
    contestar({
      [`${LECTURAS}/catalogo/tec-audifonos-anc`]: {
        cuerpo: { elemento: ELEMENTO, descripcion: 'x', imagenes: [], opciones: [], preguntas: [] },
      },
    });

    const ficha = await TestBed.inject(CatalogoApi).product('/api/shop', 'tec-audifonos-anc', 'COP', LECTURAS);

    expect(ficha.product.id).toBe('tec-audifonos-anc');
    expect(ficha.reviews).toEqual([]);
    expect(ficha.canReview).toBe(false);
    expect(degradado()).toBe(false);
  });

  it('«Mis compras» lee los pedidos genéricos de la sesión, sin el correo en la query, con el motivo de cada línea', async () => {
    const pedidas = contestar({
      [`${LECTURAS}/pedidos`]: {
        cuerpo: {
          pedidos: [
            {
              referencia: 'ord_1',
              numero: 'SYN-ABCDEF12',
              estado: 'shipped',
              fecha: '2026-10-31T15:00:00+00:00',
              total: PRECIO,
              lineas: [
                {
                  id: 'tec-audifonos-anc/tec-audifonos-anc-negro',
                  elementoId: 'tec-audifonos-anc',
                  opcionId: 'tec-audifonos-anc-negro',
                  titulo: 'Audífonos Inalámbricos ANC',
                  cantidad: 1,
                  unitario: PRECIO,
                  total: PRECIO,
                  puedeDevolverse: false,
                  motivoSinDevolucion: 'ya-abierta',
                },
              ],
            },
          ],
        },
      },
    });

    const lectura = await TestBed.inject(PedidosApi).orders('/api/shop', 'compradora@synergos.co', 'COP', LECTURAS);

    expect(pedidas).toEqual([`${LECTURAS}/pedidos`]);
    expect(lectura).toEqual({
      estado: 'leidas',
      pedidos: [
        {
          orderNumber: 'SYN-ABCDEF12',
          orderRef: 'ord_1',
          date: '2026-10-31T15:00:00+00:00',
          status: 'shipped',
          total: 680000,
          currency: 'COP',
          items: [
            {
              title: 'Audífonos Inalámbricos ANC',
              qty: 1,
              amount: 680000,
              productId: 'tec-audifonos-anc',
              variantId: 'tec-audifonos-anc-negro',
              canReturn: false,
              returnBlock: 'already-open',
            },
          ],
        },
      ],
    });
  });

  it('sin sesión, los pedidos genéricos dicen «sin sesión» y no inventan pedidos', async () => {
    contestar({ [`${LECTURAS}/pedidos`]: { estado: 401, cuerpo: { error: 'Se requiere iniciar sesión.' } } });

    expect(await TestBed.inject(PedidosApi).orders('/api/shop', '', 'COP', LECTURAS)).toEqual({ estado: 'sin-sesion' });
    expect(degradado()).toBe(false);
  });

  it('el seguimiento genérico lee sus etapas hechas, la actual y las pendientes', async () => {
    contestar({
      [`${LECTURAS}/pedidos/ord_1/seguimiento`]: {
        cuerpo: {
          referencia: 'ord_1',
          numero: 'SYN-ABCDEF12',
          estado: 'shipped',
          etapaActual: 'shipped',
          etapas: [
            { clave: 'paid', titulo: 'Pagado', estado: 'hecha', fecha: '2026-10-31T15:00:00+00:00', nota: null },
            { clave: 'shipped', titulo: 'Enviado', estado: 'actual', fecha: null, nota: 'Guía 123' },
            { clave: 'delivered', titulo: 'Entregado', estado: 'pendiente', fecha: null, nota: null },
          ],
        },
      },
    });

    const seguimiento = await TestBed.inject(PedidosApi).tracking('/api/shop', 'ord_1', 'shipped', LECTURAS);

    expect(seguimiento).toEqual({
      orderRef: 'ord_1',
      carrier: undefined,
      stages: [
        { id: 'paid', label: 'Pagado', date: '2026-10-31T15:00:00+00:00', description: undefined, state: 'done' },
        { id: 'shipped', label: 'Enviado', date: undefined, description: 'Guía 123', state: 'current' },
        { id: 'delivered', label: 'Entregado', date: undefined, description: undefined, state: 'pending' },
      ],
    });
  });

  it('las devoluciones genéricas leen los cinco estados en los cuatro de la pantalla', async () => {
    const caso = {
      linea: 'tec-audifonos-anc',
      titulo: 'Audífonos Inalámbricos ANC',
      cantidad: 1,
      monto: PRECIO,
      motivo: 'Llegó con un defecto',
      solicitada: '2026-10-31T15:00:00+00:00',
      actualizada: '2026-10-31T15:00:00+00:00',
    };
    contestar({
      [`${LECTURAS}/pedidos/ord_1/devoluciones`]: {
        cuerpo: {
          referencia: 'ord_1',
          devoluciones: [
            { ...caso, id: 'rma-1', estado: 'solicitada', nota: null },
            { ...caso, id: 'rma-2', estado: 'recibida', nota: null },
            { ...caso, id: 'rma-3', estado: 'reembolsada', nota: 'Devuelto a la tarjeta' },
          ],
        },
      },
    });

    const casos = await TestBed.inject(DevolucionesApi).orderReturns('/api/shop', 'ord_1', LECTURAS);

    expect(casos?.map((c) => c.status)).toEqual(['abierto', 'en-revision', 'resuelto']);
    expect(casos?.[2]).toMatchObject({
      claimId: 'rma-3',
      orderRef: 'ord_1',
      lineRef: 'tec-audifonos-anc',
      refundAmountFormatted: '$ 680.000',
      note: 'Devuelto a la tarjeta',
    });
  });

  it('la lista de deseos lee la colección genérica, y lo que el catálogo ya no tiene sale sin precio inventado', async () => {
    const pedidas = contestar({
      [`${LECTURAS}/colecciones/wishlist`]: {
        cuerpo: {
          coleccion: 'wishlist',
          elementos: [
            { id: 'tec-audifonos-anc', guardado: '2026-10-31T15:00:00+00:00', elemento: ELEMENTO },
            { id: 'ya-no-existe', guardado: '2026-10-31T15:00:00+00:00', elemento: null },
          ],
        },
      },
    });

    const deseos = await TestBed.inject(DeseosApi).wishlist('/api/shop', 'COP', LECTURAS);

    expect(pedidas).toEqual([`${LECTURAS}/colecciones/wishlist`]);
    expect(deseos).toEqual([
      { productId: 'tec-audifonos-anc', title: 'Audífonos Inalámbricos ANC', amount: 680000, currency: 'COP', image: '/media/shop/audifonos-anc.jpg' },
      { productId: 'ya-no-existe', title: 'ya-no-existe', amount: 0, currency: 'COP', image: undefined },
    ]);
  });

  const BANDEJA = {
    hilos: [
      {
        id: 'h-1',
        contexto: 'ord_1',
        asunto: 'Pedido SYN-ABCDEF12',
        contraparte: 'compradora@synergos.co',
        ultimo: 'Sale hoy en la tarde.',
        fecha: '2026-10-31T15:00:00+00:00',
        cantidad: 2,
        mensajes: [
          { id: 'm1', de: 'compradora@synergos.co', mio: false, texto: '¿Ya salió mi pedido?', fecha: '2026-10-31T14:00:00+00:00' },
          { id: 'm2', de: 'ventas@synergos.co', mio: true, texto: 'Sale hoy en la tarde.', fecha: '2026-10-31T15:00:00+00:00' },
        ],
      },
    ],
  };

  /** Era el defecto: la interina manda `threadId` sin asunto, y esta lectura descartaba todos los hilos. */
  it('los mensajes de quien compra leen la bandeja genérica con su asunto', async () => {
    contestar({ [`${LECTURAS}/mensajes`]: { cuerpo: BANDEJA } });

    expect(await TestBed.inject(MensajesApi).messages('/api/shop', LECTURAS)).toEqual([
      {
        id: 'h-1',
        subject: 'Pedido SYN-ABCDEF12',
        counterpart: 'compradora@synergos.co',
        lastMessage: 'Sale hoy en la tarde.',
        date: '2026-10-31',
        unread: false,
      },
    ]);
  });

  it('la consola lee la bandeja genérica con los mensajes de cada hilo: los suyos son del personal', async () => {
    contestar({ [`${LECTURAS}/mensajes`]: { cuerpo: BANDEJA } });

    const lectura = await TestBed.inject(MensajesDelVendedorApi).threads('/api/shop', LECTURAS);

    expect(lectura).toEqual({
      tipo: 'leidas',
      datos: [
        {
          id: 'h-1',
          subject: 'Pedido SYN-ABCDEF12',
          counterpart: 'compradora@synergos.co',
          date: '2026-10-31',
          unread: false,
          messages: [
            { id: 'm1', from: 'buyer', body: '¿Ya salió mi pedido?', date: '2026-10-31' },
            { id: 'm2', from: 'seller', body: 'Sale hoy en la tarde.', date: '2026-10-31' },
          ],
        },
      ],
    });
  });

  it('sin la base de las lecturas, cada adaptador sigue leyendo su ruta interina', async () => {
    const pedidas = contestar({ '/api/shop/messages': { cuerpo: { threads: [] } } });

    await TestBed.inject(MensajesApi).messages('/api/shop');

    expect(pedidas).toEqual(['/api/shop/messages']);
  });
});
