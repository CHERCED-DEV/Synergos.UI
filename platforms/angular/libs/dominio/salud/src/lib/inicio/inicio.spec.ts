import { estadoDeLosMensajes, proximaCita, resultadosLiberados } from './inicio';

/** El inicio del paciente (I8 P19): qué cuenta cada tarjeta, con la forma que dan las lecturas de las otras vistas. */
const cita = (id: string, inicio: string, estado = 'Completed') => ({
  id, numero: id.toUpperCase(), estado, profesionalId: 'dra-1', ventana: { start: inicio, end: inicio }, total: null, deshaciendo: false,
});
const AHORA = Date.parse('2027-03-10T12:00:00Z');

describe('El inicio del paciente (I8)', () => {
  it('la próxima cita es la confirmada más cercana que no empezó ni se canceló', () => {
    const citas = [
      cita('pasada', '2027-03-09T15:00:00Z'),
      cita('cancelada', '2027-03-11T15:00:00Z'),
      cita('pendiente', '2027-03-11T16:00:00Z', 'Running'),
      cita('lejana', '2027-04-01T15:00:00Z'),
      cita('proxima', '2027-03-12T15:00:00Z'),
    ];
    expect([proximaCita(citas, new Set(['cancelada']), AHORA)?.id, proximaCita([citas[0]!], new Set(), AHORA)]).toEqual(['proxima', null]);
  });

  it('los resultados que cuenta son los liberados, y los mensajes, los respondidos y los que esperan', () => {
    const ordenes = [{
      id: 'o1', tipo: 'laboratorio', indicacion: null, creadaUtc: '', estado: 'abierta',
      examenes: [
        { id: 'e1', nombre: 'HbA1c', resultado: { id: 'r1', valor: '6', unidad: null, rango: null, marca: 'normal', nota: null, tieneInforme: false, liberado: true } },
        { id: 'e2', nombre: 'Perfil', resultado: null },
      ],
    }];
    const hilo = (esperando: boolean) => ({ id: String(esperando), profesionalId: 'dra-1', profesional: 'Dra.', esperando, ultimo: '', mensajes: [] });
    expect([resultadosLiberados(ordenes), estadoDeLosMensajes([hilo(true), hilo(false), hilo(false)])]).toEqual([1, { respondidos: 2, esperando: 1 }]);
  });
});
