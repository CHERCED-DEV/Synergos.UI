import { TestBed } from '@angular/core/testing';
import { LecturasDeLaTienda } from '../comun/lecturas';
import { DevolucionesApi } from '../devoluciones/devoluciones-api.client';
import { MensajesApi } from '../mensajes/mensajes-api.client';
import { MUESTRAS_DE_LA_CUENTA, PedidosApi } from './pedidos-api.client';

describe('PedidosApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('el seguimiento caído es `null`, sin cartel de ejemplo; la línea de tiempo de ejemplo, sólo con la marca de demo', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    // Sin la marca (el camino real, etapa 3): no se inventa una línea de tiempo con fechas que nadie registró.
    const real = TestBed.inject(PedidosApi);
    expect(await real.tracking('/api/shop', 'ORD-2026-00512', 'paid')).toBeNull();
    expect(TestBed.inject(LecturasDeLaTienda).degraded).toBe(false);
    TestBed.resetTestingModule();

    TestBed.configureTestingModule({ providers: [{ provide: MUESTRAS_DE_LA_CUENTA, useValue: true }] });
    const client = TestBed.inject(PedidosApi);
    const lecturas = TestBed.inject(LecturasDeLaTienda);

    // El estado que se pasa es `paid` porque es el ÚNICO que un pedido comprado
    // puede valer: el enum del CMS tiene `Pending | Paid | Cancelled` y nada más.
    // La FASE la lleva el seguimiento, por pedido (#33).
    const tracking = (await client.tracking('/api/shop', 'ORD-2026-00512', 'paid'))!;
    expect(lecturas.degraded).toBe(true);
    expect(tracking.orderRef).toBe('ORD-2026-00512');
    expect(tracking.stages.find((stage) => stage.id === 'shipped')?.state).toBe('current');
    expect(tracking.stages.find((stage) => stage.id === 'paid')?.state).toBe('done');
    expect(tracking.stages.find((stage) => stage.id === 'delivered')?.state).toBe('pending');

    // Y un pedido sin pagar NO avanza, esté donde esté en el mapa del ejemplo.
    const sinPagar = (await client.tracking('/api/shop', 'ORD-2026-00481', 'pending'))!;
    expect(sinPagar.stages.find((stage) => stage.id === 'delivered')?.state).toBe('pending');

    // Los mensajes SÍ degradan visibles — son una lectura.
    const threads = await TestBed.inject(MensajesApi).messages('/api/shop');
    expect(threads.length).toBeGreaterThan(0);

    // La devolución ya NO degrada (#32): es una escritura, y fingirla dejaba al
    // comprador con un número de reclamo que no existe en ninguna parte.
    const rechazo = await TestBed.inject(DevolucionesApi).requestReturn('/api/shop', 'ORD-9', 'SKU-1', 'damaged');
    expect(rechazo.ok).toBe(false);
  });
});
