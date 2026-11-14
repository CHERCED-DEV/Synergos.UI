import { Injector, type Type } from '@angular/core';
import { TEXTOS_DE_SALUD, type TextosDeSalud } from '../comun/textos';
import { BandejaDeLaConsulta, MiCuenta, MisMensajes } from './mensajes';

/** Mensajes, bandeja y estado de cuenta en el dominio (I7). El doble contesta con la forma del SERVIDOR (los records del CMS). */
const HILO = {
  id: 'thr_1', profesionalId: 'dra-1', profesional: 'Dra. Ana Gómez', esperando: true, ultimo: '2027-03-20T10:00:00Z',
  mensajes: [{ id: 'thr_1-m1', delPaciente: true, texto: '¿Ya salió mi examen?', fecha: '2027-03-20T10:00:00Z' }],
};
const DEL_CONSULTORIO = { ...HILO, pacienteKey: 'p-1', paciente: 'Camila Restrepo' };

function servidor(...respuestas: { estado: number; cuerpo?: unknown }[]): void {
  const cola = [...respuestas];
  vi.stubGlobal('fetch', vi.fn(async () => {
    const r = cola.length > 1 ? cola.shift()! : cola[0];
    return new Response(r.cuerpo === undefined ? null : JSON.stringify(r.cuerpo), { status: r.estado });
  }));
}

function fachada<T>(tipo: Type<T>): T {
  const historia = {
    mensajeEnviado: 'mensajeEnviado', mensajeRevisa: 'mensajeRevisa', respuestaEnviada: 'respuestaEnviada',
    guardarFallo: 'guardarFallo', validarSinPermiso: 'validarSinPermiso',
  };
  return Injector.create({
    providers: [
      { provide: TEXTOS_DE_SALUD, useValue: { historia } as unknown as TextosDeSalud },
      { provide: tipo, useClass: tipo, deps: [] },
    ],
  }).get(tipo);
}

afterEach(() => vi.unstubAllGlobals());

describe('Mensajes, bandeja y estado de cuenta (I7)', () => {
  it('el paciente escribe y su hilo queda arriba; un mensaje que no sirve lo dice', async () => {
    const m = fachada(MisMensajes);
    servidor({ estado: 200, cuerpo: [] });
    await m.cargar('/api/healthcare');

    servidor({ estado: 200, cuerpo: HILO });
    await m.escribir('/api/healthcare', 'dra-1', '¿Ya salió mi examen?');
    expect([m.hilos().map((h) => h.id), m.hilos()[0]?.esperando, m.aviso()]).toEqual([['thr_1'], true, 'mensajeEnviado']);

    servidor({ estado: 400, cuerpo: { error: 'El mensaje está vacío.' } });
    expect([await m.escribir('/api/healthcare', 'dra-1', ' '), m.aviso()]).toEqual([false, 'mensajeRevisa']);
  });

  it('contestar un mensaje lo saca de la bandeja; sin el permiso del paciente no se abre', async () => {
    const b = fachada(BandejaDeLaConsulta);
    servidor({
      estado: 200,
      cuerpo: {
        items: [
          { tipo: 'mensaje', id: 'thr_1', pacienteKey: 'p-1', paciente: 'Camila Restrepo', resumen: '¿Ya salió?', fecha: '2027-03-20T10:00:00Z', profesionalId: 'dra-1' },
          { tipo: 'resultado', id: 'r-1', pacienteKey: 'p-1', paciente: 'Camila Restrepo', resumen: 'HbA1c', fecha: '2027-03-19T10:00:00Z', profesionalId: null },
        ],
        sinPermiso: 1,
      },
    });
    await b.cargar('/api/healthcare');
    servidor({ estado: 200, cuerpo: DEL_CONSULTORIO }, { estado: 200, cuerpo: { ...DEL_CONSULTORIO, esperando: false } });
    await b.abrirHilo('/api/healthcare', 'thr_1');
    await b.responder('/api/healthcare', 'Sí, ya está.');

    expect([b.items().map((i) => i.tipo), b.sinPermiso(), b.hilo()?.esperando, b.aviso()]).toEqual([['resultado'], 1, false, 'respuestaEnviada']);

    servidor({ estado: 403 });
    await b.abrirHilo('/api/healthcare', 'thr_2');
    expect([b.hilo(), b.aviso()]).toEqual([null, 'validarSinPermiso']);
  });

  it('la cuenta trae sus líneas y sus totales; una que no se leyó no es «sin cobros»', async () => {
    const c = fachada(MiCuenta);
    servidor({
      estado: 200,
      cuerpo: {
        lineas: [{ citaId: 'c1', numero: 'CITA1', inicio: '2027-03-01T15:00:00Z', cobrado: 50000, devuelto: 25000, moneda: 'COP' }],
        totales: [{ moneda: 'COP', cobrado: 50000, devuelto: 25000, neto: 25000 }],
      },
    });
    await c.cargar('/api/healthcare');
    expect([c.estado(), c.cuenta().lineas[0]?.devuelto, c.cuenta().totales[0]?.neto]).toEqual(['lista', 25000, 25000]);

    servidor({ estado: 503 });
    await c.cargar('/api/healthcare');
    expect([c.estado() === 'lista', c.cuenta().lineas.length]).toEqual([false, 0]);
  });
});
