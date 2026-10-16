import {
  definirCoordinador,
  type CoordinadorDelFlujo,
  type Enviar,
  type Peticion,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';
import { diasAbiertos, franjaLegible, horasDelDia, instanteEnZona, ventanaDe } from './reserva.horario';
import {
  cerrarReserva,
  cotizarReserva,
  escribirYAsentar,
  guardarPendiente,
  leerPendiente,
  llaveDeLaIntencion,
  olvidarPendiente,
} from './reserva.strategy';

/**
 * La estrategia de la reserva y el horario en la zona del sitio (011-booking-reserva): lo que
 * decide qué viaja y qué se afirma, sin la pantalla.
 */

const SERVICIO = {
  id: 'svc-1',
  nombre: 'Asesoría',
  duracionMinutos: 90,
  dias: ['Saturday', 'Sunday'],
  abre: '09:00',
  cierra: '13:00',
};

describe('el horario en la zona del sitio', () => {
  it('la hora de reloj del sitio viaja como su instante UTC, también al cruzar un cambio de hora', () => {
    expect(new Date(instanteEnZona('2026-10-21', '10:00', 'America/Bogota')).toISOString()).toBe('2026-10-21T15:00:00.000Z');
    // Nueva York pasa de EDT (UTC−4) a EST (UTC−5) el domingo 1 de noviembre de 2026.
    expect(new Date(instanteEnZona('2026-10-31', '09:00', 'America/New_York')).toISOString()).toBe('2026-10-31T13:00:00.000Z');
    expect(new Date(instanteEnZona('2026-11-01', '09:00', 'America/New_York')).toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('las horas caben enteras en el horario, de una duración en una duración, y no las que ya pasaron', () => {
    const sabado = '2026-10-31';
    const antes = Date.parse('2026-10-30T12:00:00Z');
    expect(horasDelDia(SERVICIO, sabado, 'America/New_York', antes)).toEqual(['09:00', '10:30']);
    // 10:00 en Nueva York: la de 09:00 ya empezó.
    expect(horasDelDia(SERVICIO, sabado, 'America/New_York', Date.parse('2026-10-31T14:00:00Z'))).toEqual(['10:30']);
    // Un viernes no abre.
    expect(horasDelDia(SERVICIO, '2026-10-30', 'America/New_York', antes)).toEqual([]);
  });

  it('los días abiertos son los del sitio, desde HOY en su zona y no en la del navegador', () => {
    // Sábado 22:00 en Bogotá ya es domingo en UTC. Con el día del sitio, la semana va del sábado
    // (cerrado a esa hora) al viernes; con el de UTC iría del domingo al sábado siguiente.
    const ahora = Date.parse('2026-11-01T03:00:00Z');
    expect(diasAbiertos(SERVICIO, 'America/Bogota', ahora, 'es-CO', 7).map((d) => d.fecha)).toEqual(['2026-11-01']);
  });

  it('la franja dura lo que el servicio y se lee en la zona del sitio', () => {
    const ventana = ventanaDe(SERVICIO, '2026-10-31', '10:30', 'America/Bogota');
    expect(ventana).toEqual({ start: '2026-10-31T15:30:00Z', end: '2026-10-31T17:00:00Z' });
    expect(franjaLegible(ventana!, 'America/Bogota', 'es-CO')).toContain('10:30–12:00');
  });
});

describe('la llave de la intención y la pendiente', () => {
  afterEach(() => sessionStorage.clear());

  const VENTANA = { start: '2026-10-31T15:30:00Z', end: '2026-10-31T17:00:00Z' };

  it('la misma franja da la misma llave; otra franja, otra', () => {
    const una = llaveDeLaIntencion('svc-1', VENTANA);
    expect(una).toMatch(/^[0-9a-f]{32}$/);
    expect(llaveDeLaIntencion('svc-1', VENTANA)).toBe(una);
    expect(llaveDeLaIntencion('svc-1', { ...VENTANA, start: '2026-10-31T14:00:00Z' })).not.toBe(una);
    expect(llaveDeLaIntencion('svc-2', VENTANA)).not.toBe(una);
  });

  it('la pendiente sobrevive a la recarga y lo que no tiene su forma se ignora', () => {
    guardarPendiente({ servicio: 'svc-1', ventana: VENTANA, llave: 'k', id: null });
    expect(leerPendiente('svc-1')).toEqual({ servicio: 'svc-1', ventana: VENTANA, llave: 'k', id: null });
    sessionStorage.setItem('synergos:reserva:pendiente:svc-2', '{"servicio":"svc-2"}');
    expect(leerPendiente('svc-2')).toBeNull();
    olvidarPendiente('svc-1');
    expect(leerPendiente('svc-1')).toBeNull();
  });
});

describe('la estrategia por el coordinador', () => {
  beforeAll(() => definirCoordinador());

  let flujo: CoordinadorDelFlujo;
  let participante: HTMLElement;
  const vistas: Peticion[] = [];

  function montar(responder: (p: Peticion) => ResultadoDelFlujo<unknown>): void {
    vistas.length = 0;
    flujo = document.createElement('synergos-flujo') as CoordinadorDelFlujo;
    flujo.setAttribute('flujo', 'reservas.servicio');
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

  const reserva = (estado: string) => ({
    id: 'rs-1',
    flujo: 'reservas.servicio',
    numero: 'R-1',
    estado,
    datos: { servicio: 'svc-1', ventana: null, total: null },
    compensacionesPendientes: 0,
    error: null,
    deshaciendo: false,
  });

  it('cotizar va sin llave por la puerta y devuelve el total del servidor, o null si no lo dio', async () => {
    montar(() => ({ ok: true, valor: { flujo: 'reservas.servicio', datos: { servicio: 'svc-1', ventana: null, total: null } }, estado: 200, correlacion: '' }));
    const r = await cotizarReserva(participante, { servicio: 'svc-1', ventana: { start: 'a', end: 'b' } });
    expect(r).toMatchObject({ ok: true, valor: null });
    expect(vistas[0]!.url).toBe('/api/flujos/reservas.servicio/cotizar');
    expect(vistas[0]!.cabeceras['Idempotency-Key']).toBeUndefined();
  });

  it('una escritura que falla se CONSULTA: lo que queda es el estado leído, con el rechazo para decir por qué', async () => {
    montar((p) =>
      p.url.includes('/cerrar')
        ? { ok: false, rechazo: { code: 'booking.unreachable', status: 503, transient: true, detail: '', origen: 'servidor', extra: {} }, correlacion: '' }
        : { ok: true, valor: reserva('Completed'), estado: 200, correlacion: '' },
    );
    const asentada = await escribirYAsentar(participante, 'rs-1', cerrarReserva);
    expect(vistas.map((p) => p.url)).toEqual([
      '/api/flujos/reservas.servicio/cerrar?id=rs-1',
      '/api/flujos/reservas.servicio/consultar?id=rs-1',
    ]);
    expect(asentada).toMatchObject({ tipo: 'leida', reserva: { estado: 'Completed' }, rechazo: { code: 'booking.unreachable' } });
  });

  it('sin sesión no consulta: la sesión es lo que falta', async () => {
    montar(() => ({ ok: false, rechazo: { code: 'puerta.sesion_requerida', status: 401, transient: false, detail: '', origen: 'servidor', extra: {} }, correlacion: '' }));
    const asentada = await escribirYAsentar(participante, 'rs-1', cerrarReserva);
    expect(vistas).toHaveLength(1);
    expect(asentada.tipo).toBe('sesion');
  });
});
