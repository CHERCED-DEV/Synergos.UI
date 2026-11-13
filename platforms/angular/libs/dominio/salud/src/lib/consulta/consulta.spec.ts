import { Injector } from '@angular/core';
import { TEXTOS_DE_SALUD, type TextosDeSalud } from '../comun/textos';
import { ConsultaDelDia } from './consulta';
import { siguientePaso } from './consulta.model';

/** La consulta en el dominio (I3). El doble contesta con la forma del SERVIDOR (`/api/healthcare`). */
const AVISOS = {
  llegadaNoSigue: 'llegadaNoSigue',
  llegadaFallo: 'llegadaFallo',
  notaGuardada: 'notaGuardada',
  notaFirmada: 'notaFirmada',
  notaYaFirmada: 'notaYaFirmada',
  notaRevisa: 'notaRevisa',
  notaSinLlave: 'notaSinLlave',
  notaFallo: 'notaFallo',
};

const AGENDA = {
  citas: [
    { reservaId: 'r-1', inicio: '2027-03-15T14:00:00+00:00', fin: '2027-03-15T14:30:00+00:00', llegada: 'agendada', paciente: { nombre: 'Camila Restrepo', patientKey: 'p-1' } },
    { reservaId: 'r-2', inicio: '2027-03-15T15:00:00+00:00', fin: '2027-03-15T15:30:00+00:00', llegada: 'llego', paciente: { nombre: null, patientKey: null } },
  ],
};

const NOTA = {
  id: 'n-1', reservaId: 'r-1', subjetivo: 'Cefalea', objetivo: 'PA 120/80', analisis: 'Cefalea tensional', plan: 'Control',
  creadaUtc: '2027-03-15T14:10:00Z', actualizadaUtc: '2027-03-15T14:10:00Z', firmada: false, firmadaUtc: null, llaveId: null,
};

function servidor(estado: number, cuerpo: unknown = null): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(cuerpo === null ? null : JSON.stringify(cuerpo), { status: estado })));
}

const consulta = (): ConsultaDelDia =>
  Injector.create({
    providers: [
      { provide: TEXTOS_DE_SALUD, useValue: { historia: AVISOS } as unknown as TextosDeSalud },
      { provide: ConsultaDelDia, useClass: ConsultaDelDia, deps: [] },
    ],
  }).get(ConsultaDelDia);

afterEach(() => vi.unstubAllGlobals());

describe('La consulta del día (I3)', () => {
  it('la agenda trae cada cita con su llegada, y quien no tiene historia viene sin nombre', async () => {
    const c = consulta();
    servidor(200, AGENDA);

    await c.cargarAgenda('/api/healthcare', 'dra-1', '2027-03-15');

    expect(c.estadoDeLaAgenda()).toBe('lista');
    expect(c.citas().map((x) => [x.reservaId, x.llegada, x.paciente.nombre])).toEqual([
      ['r-1', 'agendada', 'Camila Restrepo'],
      ['r-2', 'llego', null],
    ]);
    expect(siguientePaso('agendada')).toBe('llegar');
    expect(siguientePaso('atendido')).toBeNull();
  });

  it('marcar la llegada cambia sólo esa cita, y un paso que no sigue es su aviso', async () => {
    const c = consulta();
    servidor(200, AGENDA);
    await c.cargarAgenda('/api/healthcare', 'dra-1', '2027-03-15');

    servidor(200, { reservaId: 'r-1', llegada: 'llego' });
    await c.marcar('/api/healthcare', 'r-1', 'llegar');
    servidor(409, { error: 'workflow.transition_not_allowed' });
    await c.marcar('/api/healthcare', 'r-2', 'atender');

    expect(c.citas().map((x) => x.llegada)).toEqual(['llego', 'llego']);
    expect(c.aviso()).toBe('llegadaNoSigue');
  });

  it('guardar deja la nota como borrador para firmarla; sin la llave del consultorio, firmar es su aviso', async () => {
    const c = consulta();
    servidor(200, []);
    await c.abrirNotas('/api/healthcare', 'p-1', 'Camila Restrepo', 'r-1');

    servidor(200, NOTA);
    await c.guardar('/api/healthcare', { subjetivo: 'Cefalea', objetivo: 'PA 120/80', analisis: 'Cefalea tensional', plan: 'Control' });
    servidor(409, { error: 'signing.no_active_key' });
    const firmo = await c.firmar('/api/healthcare', 'n-1');

    expect([c.guardada(), c.notas()[0].firmada, firmo, c.aviso()]).toEqual(['n-1', false, false, 'notaSinLlave']);
  });
});
