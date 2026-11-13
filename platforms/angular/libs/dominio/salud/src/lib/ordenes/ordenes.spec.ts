import { Injector, type Type } from '@angular/core';
import { TEXTOS_DE_SALUD, type TextosDeSalud } from '../comun/textos';
import { MisResultados, OrdenesDelPaciente } from './ordenes';

/** Órdenes y resultados en el dominio (I4). El doble contesta con la forma del SERVIDOR (`OrdenParaLeer` del CMS). */
const ORDEN = {
  id: 'o-1', tipo: 'laboratorio', indicacion: 'Control', creadaUtc: '2027-03-15T14:00:00Z', estado: 'abierta',
  examenes: [
    { id: 'e1', nombre: 'HbA1c', resultado: { id: 'r-1', valor: '6,2', unidad: '%', rango: '4,0 – 5,6', marca: 'alto', nota: null, tieneInforme: true, liberado: false, cargadoUtc: '2027-03-16T10:00:00Z', liberadoUtc: null } },
    { id: 'e2', nombre: 'Perfil lipídico', resultado: null },
  ],
};

function servidor(estado: number, cuerpo: unknown = null): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(cuerpo === null ? null : JSON.stringify(cuerpo), { status: estado })));
}

function fachada<T>(tipo: Type<T>): T {
  const historia = { ordenGuardada: 'ordenGuardada', ordenRevisa: 'ordenRevisa', resultadoCargado: 'resultadoCargado', resultadoRevisa: 'resultadoRevisa', resultadoLiberado: 'resultadoLiberado', guardarFallo: 'guardarFallo' };
  return Injector.create({
    providers: [
      { provide: TEXTOS_DE_SALUD, useValue: { historia } as unknown as TextosDeSalud },
      { provide: tipo, useClass: tipo, deps: [] },
    ],
  }).get(tipo);
}

afterEach(() => vi.unstubAllGlobals());

describe('Órdenes y resultados (I4)', () => {
  it('se leen con la forma del CMS; un examen sin resultado es null, no un resultado vacío', async () => {
    const o = fachada(OrdenesDelPaciente);
    servidor(200, [ORDEN]);

    await o.cargar('/api/healthcare', 'p-1');

    const [hba1c, lipidos] = o.ordenes()[0].examenes;
    expect([hba1c.resultado?.valor, hba1c.resultado?.marca, hba1c.resultado?.liberado, lipidos.resultado]).toEqual(['6,2', 'alto', false, null]);
  });

  it('cargar un resultado que el servidor rechaza dice qué revisar, y liberar reemplaza la orden', async () => {
    const o = fachada(OrdenesDelPaciente);
    servidor(200, [ORDEN]);
    await o.cargar('/api/healthcare', 'p-1');

    servidor(400, { error: 'marca: normal, alto, bajo o critico.' });
    const cargo = await o.cargarResultado('/api/healthcare', 'p-1', 'o-1', { examenId: 'e2', valor: '180', marca: 'normal' });
    expect([cargo, o.aviso()]).toEqual([false, 'resultadoRevisa']);

    const liberada = { ...ORDEN, examenes: [{ ...ORDEN.examenes[0], resultado: { ...ORDEN.examenes[0].resultado, liberado: true } }, ORDEN.examenes[1]] };
    servidor(200, liberada);
    await o.liberar('/api/healthcare', 'p-1', 'r-1');
    expect([o.ordenes().length, o.ordenes()[0].examenes[0].resultado?.liberado, o.aviso()]).toEqual([1, true, 'resultadoLiberado']);
  });

  it('para el paciente, una lista que no se pudo leer no es una vacía', async () => {
    const r = fachada(MisResultados);
    servidor(500);
    await r.cargar('/api/healthcare');
    expect([r.estado(), r.ordenes()]).toEqual(['ilegible', []]);
  });
});
