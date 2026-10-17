import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { FulfillmentProduct, SessionData, SessionItem } from '@synergos/transaction-engine';
import {
  definirCoordinador,
  type CoordinadorDelFlujo,
  type Enviar,
  type Peticion,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';
import { RealtyApiClient } from './realty-api.client';
import { RealtyFulfillmentStrategy, caminoDeLaVisitaEnCurso } from './realty-fulfillment.strategy';
import { abrirVisita, cerrarYAsentar } from './realty-visita.puerta';
import type { VisitSelectionPayload } from './realty.model';

/**
 * La visita a un inmueble por la puerta (008-propiedades-visita): lo que viaja, lo que se afirma y por qué camino
 * sale cada visita, sin la pantalla.
 */

const VENTANA = { start: '2026-11-03T14:00:00.000Z', end: '2026-11-03T15:00:00.000Z' };

const visita = (estado: string) => ({
  id: 'pv-1',
  flujo: 'propiedades.visita',
  numero: 'V-1',
  estado,
  datos: { inmueble: { kind: 'realty.listado', id: 'prop-001' }, ventana: VENTANA, modo: 'video' },
  compensacionesPendientes: 0,
  error: null,
  deshaciendo: false,
});

const ok = (valor: unknown, estado = 200): ResultadoDelFlujo<unknown> => ({ ok: true, valor, estado, correlacion: '' });
const rechazo = (code: string, status = 409): ResultadoDelFlujo<unknown> => ({
  ok: false,
  rechazo: { code, status, transient: false, detail: '', origen: 'servidor', extra: {} },
  correlacion: '',
});

describe('la visita por el coordinador', () => {
  beforeAll(() => definirCoordinador());

  let flujo: CoordinadorDelFlujo;
  let participante: HTMLElement;
  const vistas: Peticion[] = [];

  function montar(responder: (p: Peticion) => ResultadoDelFlujo<unknown>): void {
    vistas.length = 0;
    flujo = document.createElement('synergos-flujo') as CoordinadorDelFlujo;
    flujo.setAttribute('flujo', 'propiedades.visita');
    const enviar: Enviar = (p) => {
      vistas.push(p);
      return Promise.resolve(responder(p));
    };
    flujo.enviar = enviar;
    participante = document.createElement('div');
    flujo.appendChild(participante);
    document.body.appendChild(flujo);
  }

  afterEach(() => flujo?.remove());

  it('abrir manda el inmueble con su clase fija, la ventana de la franja, la modalidad y la llave', async () => {
    montar(() => ok(visita('Running'), 201));

    const r = await abrirVisita(participante, 'prop-001', VENTANA, 'video', 'llave-1');

    expect(r).toMatchObject({ ok: true, valor: { id: 'pv-1', numero: 'V-1', estado: 'Running', inmueble: 'prop-001', modo: 'video' } });
    expect(vistas[0]!.url).toBe('/api/flujos/propiedades.visita/abrir');
    expect(vistas[0]!.cabeceras['Idempotency-Key']).toBe('llave-1');
    // NR-1: el navegador sólo pone el id; la clase es la que declara la definición.
    expect(JSON.parse(vistas[0]!.cuerpo ?? '{}')).toEqual({
      inmueble: { kind: 'realty.listado', id: 'prop-001' },
      ventana: VENTANA,
      modalidad: 'video',
    });
  });

  it('un cierre que falla se CONSULTA: lo que queda es el estado leído, con el rechazo para decir por qué', async () => {
    montar((p) => (p.url.includes('/cerrar') ? rechazo('booking.hold_expired') : ok(visita('Compensated'))));

    const asentada = await cerrarYAsentar(participante, 'pv-1');

    expect(vistas.map((p) => p.url)).toEqual([
      '/api/flujos/propiedades.visita/cerrar?id=pv-1',
      '/api/flujos/propiedades.visita/consultar?id=pv-1',
    ]);
    expect(asentada.visita?.estado).toBe('Compensated');
    expect(asentada.rechazo?.code).toBe('booking.hold_expired');
  });

  it('sin sesión no se consulta nada: la puerta pide iniciarla', async () => {
    montar(() => rechazo('puerta.sesion_requerida', 401));

    const asentada = await cerrarYAsentar(participante, 'pv-1');

    expect(vistas).toHaveLength(1);
    expect(asentada.visita).toBeNull();
    expect(asentada.rechazo?.code).toBe('puerta.sesion_requerida');
  });

  // ── La estrategia: el asistente no sabe del camino ─────────────────────────────────────────────

  function estrategia(): RealtyFulfillmentStrategy {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), RealtyApiClient, RealtyFulfillmentStrategy],
    });
    return TestBed.inject(RealtyFulfillmentStrategy);
  }

  afterEach(() => TestBed.resetTestingModule());

  const PAYLOAD: VisitSelectionPayload = {
    listingId: 'prop-001',
    listingTitle: 'Apartamento en Chicó',
    slot: { date: '2026-11-03', time: '09:00', ...VENTANA },
    mode: 'video',
    contact: { name: '', email: '', phone: '' },
    path: 'puerta',
  };

  async function linea(s: RealtyFulfillmentStrategy, payload: VisitSelectionPayload): Promise<SessionItem> {
    const producto: FulfillmentProduct = {
      productRef: payload.listingId,
      kind: 'visit',
      label: payload.listingTitle,
      amount: 0,
      selection: { ...(payload as unknown as Record<string, unknown>), apiBase: '/api/realty' },
    };
    return (await s.select(producto, {} as SessionData)).item;
  }

  const sesion = (item: SessionItem, referencia?: string): SessionData =>
    ({ items: [item], payments: referencia ? [{ reference: referencia }] : [] }) as unknown as SessionData;

  it('por la puerta, pagar es APARTAR (abrir) y confirmar es CERRAR; el comprobante dice el número de la visita', async () => {
    montar((p) => (p.url.endsWith('/abrir') ? ok(visita('Running'), 201) : ok(visita('Completed'))));
    const s = estrategia();
    const item = await linea(s, PAYLOAD);

    const pagado = await s.pay({ session: sesion(item), instrument: { host: participante } });
    expect(pagado).toEqual({ accepted: true, reference: 'pv-1' });

    const confirmado = await s.confirm(sesion(item, 'pv-1'), { host: participante });
    expect(confirmado.confirmed).toBe(true);
    expect(confirmado.vouchers[0]).toMatchObject({
      reference: 'V-1',
      status: 'confirmed',
      detail: { visitId: 'pv-1', listingId: 'prop-001', date: '2026-11-03', time: '09:00', mode: 'video' },
    });
    expect(vistas.map((p) => p.url)).toEqual([
      '/api/flujos/propiedades.visita/abrir',
      '/api/flujos/propiedades.visita/cerrar?id=pv-1',
    ]);
  });

  it('reintentar el pago de la MISMA línea repite la llave: la puerta no aparta dos veces', async () => {
    montar(() => ok(visita('Running'), 201));
    const s = estrategia();
    const item = await linea(s, PAYLOAD);

    await s.pay({ session: sesion(item), instrument: { host: participante } });
    await s.pay({ session: sesion(item), instrument: { host: participante } });

    expect(vistas).toHaveLength(2);
    expect(vistas[0]!.cabeceras['Idempotency-Key']).toBeTruthy();
    expect(vistas[1]!.cabeceras['Idempotency-Key']).toBe(vistas[0]!.cabeceras['Idempotency-Key']);
  });

  it('un rechazo de la agenda llega con su código, para que la pantalla diga cuál', async () => {
    montar(() => rechazo('booking.at_capacity'));
    const s = estrategia();
    const item = await linea(s, PAYLOAD);

    expect(await s.pay({ session: sesion(item), instrument: { host: participante } })).toEqual({
      accepted: false,
      reason: 'booking.at_capacity',
    });
  });

  it('una visita que no quedó Completed no se da por agendada', async () => {
    montar((p) => (p.url.includes('/cerrar') ? rechazo('booking.hold_expired') : ok(visita('Compensated'))));
    const s = estrategia();
    const item = await linea(s, PAYLOAD);

    const confirmado = await s.confirm(sesion(item, 'pv-1'), { host: participante });

    expect(confirmado).toMatchObject({ confirmed: false, reason: 'booking.hold_expired', vouchers: [] });
  });

  it('una franja sin instantes no sale por la puerta: no se le inventa la ventana', async () => {
    montar(() => ok(visita('Running'), 201));
    const s = estrategia();
    const item = await linea(s, { ...PAYLOAD, slot: { date: '2026-11-03', time: '09:00' } });

    expect(await s.pay({ session: sesion(item), instrument: { host: participante } })).toEqual({
      accepted: false,
      reason: 'propiedades.franja_sin_instantes',
    });
    expect(vistas).toHaveLength(0);
  });

  it('por la directa no se toca la puerta: pagar sigue apagado, como siempre', async () => {
    montar(() => ok(visita('Running'), 201));
    const s = estrategia();
    const item = await linea(s, { ...PAYLOAD, path: 'directa' });

    const pagado = await s.pay({ session: sesion(item), instrument: { host: participante } });

    expect(pagado.accepted).toBe(true);
    expect(pagado.reference).toMatch(/^VISIT-/);
    expect(vistas).toHaveLength(0);
  });

  it('el camino de una visita en curso es el de su LÍNEA, no el de la página', async () => {
    const s = estrategia();
    const item = await linea(s, PAYLOAD);

    expect(caminoDeLaVisitaEnCurso(item.selection as Record<string, unknown>)).toBe('puerta');
    expect(caminoDeLaVisitaEnCurso({})).toBe('directa');
    expect(caminoDeLaVisitaEnCurso({ path: 'otra' })).toBe('directa');
  });
});

describe('la consola del agente con los leads del servidor (008, D-1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  const responder = (body: unknown): Promise<Response> =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

  it('un lead que la pestaña mandó y el servidor ya devuelve sale UNA vez, con el estado del servidor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        (init?.method ?? 'GET').toUpperCase() === 'POST'
          ? responder({ leadId: 'lead_42' })
          : responder({
              leads: [{ leadId: 'lead_42', listingId: 'prop-001', name: 'Mariana', email: 'm@ejemplo.co', status: 'contacted' }],
              portfolio: [],
              agenda: [],
            }),
      ),
    );
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), RealtyApiClient] });
    const api = TestBed.inject(RealtyApiClient);

    await api.submitLead(
      '/api/realty',
      { listingId: 'prop-001', contact: { name: 'Mariana', email: 'm@ejemplo.co', phone: '3001234567' }, message: '¿Sigue disponible?' },
      'Apartamento en Chicó',
    );
    const escritorio = await api.agentDesk('/api/realty');

    expect(escritorio.leads.filter((lead) => lead.id === 'lead_42')).toHaveLength(1);
    expect(escritorio.leads.find((lead) => lead.id === 'lead_42')?.status).toBe('contacted');
  });
});
