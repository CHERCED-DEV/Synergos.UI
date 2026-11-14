import { Injector, type Type } from '@angular/core';
import { TEXTOS_DE_SALUD, type TextosDeSalud } from '../comun/textos';
import { MiMedicacion, RecetasDelPaciente } from './recetas';

/** Recetas y medicación en el dominio (I5). El doble contesta con la forma del SERVIDOR (`RecetaParaLeer` del CMS). */
const VIGENTE = {
  id: 'r-1', medicamento: 'Metformina 850 mg', dosis: '1 tableta', frecuencia: 'cada 12 horas', indicaciones: null,
  desdeUtc: '2027-03-01T00:00:00Z', hastaUtc: '2027-03-31T00:00:00Z', estado: 'active', vigente: true, firmada: true, renuevaA: null,
};
const ANULADA = { ...VIGENTE, id: 'r-0', estado: 'revoked', vigente: false };
const PEDIDA = { id: 's-1', recetaId: 'r-1', nota: null, estado: 'pedida', pedidaUtc: '2027-03-20T00:00:00Z', resueltaUtc: null, nuevaRecetaId: null, motivo: null };

function servidor(...respuestas: { estado: number; cuerpo?: unknown }[]): void {
  const cola = [...respuestas];
  vi.stubGlobal('fetch', vi.fn(async () => {
    const r = cola.length > 1 ? cola.shift()! : cola[0];
    return new Response(r.cuerpo === undefined ? null : JSON.stringify(r.cuerpo), { status: r.estado });
  }));
}

function fachada<T>(tipo: Type<T>): T {
  const historia = {
    recetaEmitida: 'recetaEmitida', recetaRevisa: 'recetaRevisa', recetaAnulada: 'recetaAnulada', renovacionPedida: 'renovacionPedida',
    renovacionAprobada: 'renovacionAprobada', renovacionRechazada: 'renovacionRechazada', renovacionImposible: 'renovacionImposible',
    guardarFallo: 'guardarFallo', notaSinLlave: 'notaSinLlave',
  };
  return Injector.create({
    providers: [
      { provide: TEXTOS_DE_SALUD, useValue: { historia } as unknown as TextosDeSalud },
      { provide: tipo, useClass: tipo, deps: [] },
    ],
  }).get(tipo);
}

afterEach(() => vi.unstubAllGlobals());

describe('Recetas y medicación (I5)', () => {
  it('la medicación activa son las vigentes; las anuladas van aparte, y pedir una renovación imposible lo dice', async () => {
    const m = fachada(MiMedicacion);
    servidor({ estado: 200, cuerpo: [VIGENTE, ANULADA] }, { estado: 200, cuerpo: [] });
    await m.cargar('/api/healthcare');
    expect([m.vigentes().map((r) => r.id), m.anteriores().map((r) => r.id)]).toEqual([['r-1'], ['r-0']]);

    servidor({ estado: 200, cuerpo: PEDIDA });
    await m.pedir('/api/healthcare', 'r-1');
    expect([m.renovacionDe('r-1')?.estado, m.aviso()]).toEqual(['pedida', 'renovacionPedida']);

    servidor({ estado: 409, cuerpo: { error: 'Esa receta no se puede renovar.' } });
    await m.pedir('/api/healthcare', 'r-0');
    expect(m.aviso()).toBe('renovacionImposible');
  });

  it('sin la llave del consultorio, emitir lo dice y no suma una receta', async () => {
    const r = fachada(RecetasDelPaciente);
    servidor({ estado: 200, cuerpo: [] }, { estado: 200, cuerpo: [] });
    await r.cargar('/api/healthcare', 'p-1');

    servidor({ estado: 409, cuerpo: { error: 'signing.no_active_key' } });
    const emitio = await r.emitir('/api/healthcare', 'p-1', { medicamento: 'Metformina', dosis: '1', frecuencia: 'diaria' });

    expect([emitio, r.recetas().length, r.aviso()]).toEqual([false, 0, 'notaSinLlave']);
  });
});
