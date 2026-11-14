import { Injector } from '@angular/core';
import { definirCoordinador, type CoordinadorDelFlujo, type Peticion, type ResultadoDelFlujo } from '@synergos/vitals-core';
import { TEXTOS_DE_SALUD, type TextosDeSalud } from '../comun/textos';
import { CancelacionesDeCitas, devolucionPrevista, type PoliticaDeDevolucion } from './cancelacion';

/** Cancelar una cita confirmada (I6). El doble contesta con la forma del SERVIDOR (`salud.cancelacion` del orquestador). */
const INICIO = '2027-03-10T15:00:00Z';
const COPAGO = { amount: 50_000, currency: 'COP' };
const DE_SIEMPRE: PoliticaDeDevolucion = { totalHoras: 24, parcialHoras: 2, porcentaje: 50 };
const antes = (minutos: number) => Date.parse(INICIO) - minutos * 60_000;

const cancelacion = (cita: string, devuelto: { amount: number; currency: string } | null, estado = 'Completed') => ({
  id: `can-${cita}`, flujo: 'salud.cancelacion', numero: 'C-1', estado, datos: { cita, aDevolver: devuelto },
  compensacionesPendientes: 0, error: null, deshaciendo: false,
});

describe('La devolución prevista (I6)', () => {
  it('cada tramo empieza en su hora exacta, como en el orquestador', () => {
    expect(
      [24 * 60, 24 * 60 - 1, 2 * 60, 2 * 60 - 1, 0].map((m) => devolucionPrevista(COPAGO, INICIO, antes(m), DE_SIEMPRE)),
    ).toEqual([
      { tramo: 'total', monto: COPAGO },
      { tramo: 'parcial', monto: { amount: 25_000, currency: 'COP' } },
      { tramo: 'parcial', monto: { amount: 25_000, currency: 'COP' } },
      { tramo: 'nada', monto: null },
      { tramo: 'empezo', monto: null },
    ]);
  });

  it('la parte se redondea hacia abajo, y una cita sin copago no promete devolver nada', () => {
    const tercio = devolucionPrevista({ amount: 50_001, currency: 'COP' }, INICIO, antes(5 * 60), { ...DE_SIEMPRE, porcentaje: 33 });
    expect([tercio.monto?.amount, devolucionPrevista(null, INICIO, antes(48 * 60), DE_SIEMPRE)]).toEqual([
      16_500.33,
      { tramo: 'total', monto: null },
    ]);
  });
});

describe('Cancelar una cita confirmada por la puerta (I6)', () => {
  beforeAll(() => definirCoordinador());

  const pedidas: Peticion[] = [];
  let flujo: CoordinadorDelFlujo;
  let participante: HTMLElement;

  function montar(responder: (p: Peticion) => ResultadoDelFlujo<unknown>): void {
    pedidas.length = 0;
    flujo = document.createElement('synergos-flujo') as CoordinadorDelFlujo;
    flujo.setAttribute('flujo', 'salud.cancelacion');
    flujo.enviar = (p) => {
      pedidas.push(p);
      return Promise.resolve(responder(p));
    };
    participante = document.createElement('div');
    flujo.appendChild(participante);
    document.body.appendChild(flujo);
  }

  afterEach(() => flujo?.remove());

  function fachada(): CancelacionesDeCitas {
    const textos = {
      cancelacion: {
        cancelada: (d: { amount: number } | null) => (d ? `devolvemos ${d.amount}` : 'sin devolución'),
        mensaje: (code: string) => `rechazo ${code}`,
      },
    } as unknown as TextosDeSalud;
    return Injector.create({
      providers: [
        { provide: TEXTOS_DE_SALUD, useValue: textos },
        { provide: CancelacionesDeCitas, useClass: CancelacionesDeCitas, deps: [] },
      ],
    }).get(CancelacionesDeCitas);
  }

  it('cancela con la llave de la cita, guarda lo devuelto y lo dice; el rechazo se dice por su código', async () => {
    const c = fachada();
    montar(() => ({ ok: true, valor: cancelacion('cita-1', { amount: 25_000, currency: 'COP' }), estado: 201, correlacion: 'x' }));

    expect(await c.cancelar(participante, 'cita-1')).toBe(true);
    expect(pedidas[0]).toMatchObject({ url: '/api/flujos/salud.cancelacion/abrir', cabeceras: { 'Idempotency-Key': 'cancelacion:cita-1' } });
    expect(JSON.parse(String(pedidas[0]!.cuerpo))).toEqual({ cita: 'cita-1' });
    expect([c.cancelacionDe('cita-1')?.devuelto?.amount, c.aviso()]).toEqual([25_000, { citaId: 'cita-1', texto: 'devolvemos 25000' }]);

    flujo.remove();
    montar(() => ({
      ok: false, correlacion: 'x',
      rechazo: { code: 'salud.cita_ya_empezo', status: 409, transient: false, detail: '', origen: 'servidor', extra: {} },
    }));
    expect(await c.cancelar(participante, 'cita-2')).toBe(false);
    expect([c.cancelacionDe('cita-2'), c.aviso()?.texto]).toEqual([null, 'rechazo salud.cita_ya_empezo']);
  });

  it('las cancelaciones del paciente son las completadas, por la cita que cancelan', async () => {
    const c = fachada();
    montar(() => ({
      ok: true, estado: 200, correlacion: 'x',
      valor: { items: [cancelacion('cita-1', null), cancelacion('cita-2', COPAGO, 'Compensated')], total: 2, offset: 0, limit: 50 },
    }));

    expect(await c.cargar(participante)).toBe(true);
    expect([...c.canceladas().keys()]).toEqual(['cita-1']);
  });
});
