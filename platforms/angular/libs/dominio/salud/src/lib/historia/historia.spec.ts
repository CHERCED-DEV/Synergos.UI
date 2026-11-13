import { Injector, type Type } from '@angular/core';
import { TEXTOS_DE_SALUD, type TextosDeLaHistoria, type TextosDeSalud } from '../comun/textos';
import { HistoriaEnElConsultorio, MiHistoria } from './historia';
import { resumenDeLaHistoria } from './historia-api.client';

/** Los textos los provee la app; la fachada decide CUÁL se dice. Cada uno se llama como su clave. */
const HISTORIA: TextosDeLaHistoria = {
  checkInGuardado: 'checkInGuardado',
  checkInRevisa: 'checkInRevisa',
  checkInSinHistoria: 'checkInSinHistoria',
  checkInSinSesion: 'checkInSinSesion',
  checkInFallo: 'checkInFallo',
  aperturaLista: 'aperturaLista',
  aperturaSinRol: 'aperturaSinRol',
  aperturaRevisa: 'aperturaRevisa',
  aperturaFallo: 'aperturaFallo',
  validarSinPermiso: 'validarSinPermiso',
  validarFallo: 'validarFallo',
  llegadaNoSigue: 'llegadaNoSigue',
  llegadaFallo: 'llegadaFallo',
  notaGuardada: 'notaGuardada',
  notaFirmada: 'notaFirmada',
  notaYaFirmada: 'notaYaFirmada',
  notaRevisa: 'notaRevisa',
  notaSinLlave: 'notaSinLlave',
  notaFallo: 'notaFallo',
  ordenGuardada: 'ordenGuardada',
  ordenRevisa: 'ordenRevisa',
  resultadoCargado: 'resultadoCargado',
  resultadoRevisa: 'resultadoRevisa',
  resultadoLiberado: 'resultadoLiberado',
  guardarFallo: 'guardarFallo',
};

function fachada<T>(tipo: Type<T>): T {
  return Injector.create({
    providers: [
      { provide: TEXTOS_DE_SALUD, useValue: { historia: HISTORIA } as unknown as TextosDeSalud },
      { provide: tipo, useClass: tipo, deps: [] },
    ],
  }).get(tipo);
}

/**
 * La historia de producción en el dominio (I2 T062–T063). El doble contesta con la forma del SERVIDOR: el
 * `ResumenParaLeer` del CMS tal como lo serializa ASP.NET.
 */
const RESUMEN = {
  datos: [
    { id: 'd1', tipo: 'alergia', descripcion: 'Penicilina', fecha: null, estado: 'declarado', origen: 'paciente' },
    { id: 'd2', tipo: 'condicion', descripcion: 'Hipertensión', fecha: null, estado: 'validado', origen: 'medico' },
  ],
  preRegistro: {
    documento: 'CC 52.123.456',
    telefono: null,
    direccion: null,
    contactoDeEmergencia: null,
    aseguradora: 'EPS Sura',
    numeroDeAfiliacion: null,
    medicamentos: ['Losartán 50 mg'],
    motivoDeLaVisita: 'Control',
    declaradoUtc: '2026-11-13T15:00:00Z',
  },
  hayResumen: true,
  permisoDeLaHistoria: 'falta',
};

function servidor(estado: number, cuerpo: unknown = null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(cuerpo === null ? null : JSON.stringify(cuerpo), { status: estado })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('El resumen de la historia (T062)', () => {
  it('se lee con la forma del CMS, y lo que no es un dato no entra', () => {
    const r = resumenDeLaHistoria({ ...RESUMEN, datos: [...RESUMEN.datos, { id: '', descripcion: 'x' }, 'basura'] });
    expect(r?.datos.map((d) => [d.descripcion, d.estado])).toEqual([
      ['Penicilina', 'declarado'],
      ['Hipertensión', 'validado'],
    ]);
    expect(r?.preRegistro?.medicamentos).toEqual(['Losartán 50 mg']);
    expect(r?.permisoDeLaHistoria).toBe('falta');
  });

  it('otra forma no es un resumen vacío: es «no se pudo leer»', () => {
    expect(resumenDeLaHistoria({ hayResumen: false })).toBeNull();
    expect(resumenDeLaHistoria(null)).toBeNull();
  });
});

describe('«Mi salud» del paciente (T062)', () => {
  it('lista, sin historia o ilegible son tres cosas distintas', async () => {
    const historia = fachada(MiHistoria);

    servidor(200, RESUMEN);
    await historia.cargar('/api/healthcare');
    expect([historia.estado(), historia.faltaElPermiso()]).toEqual(['lista', true]);

    servidor(404, { error: 'no vinculada' });
    await historia.cargar('/api/healthcare');
    expect([historia.estado(), historia.resumen()]).toEqual(['sin-historia', null]);

    servidor(500);
    await historia.cargar('/api/healthcare');
    expect(historia.estado()).toBe('ilegible');
  });

  it('dar el permiso deja de pedirlo, y el check-in conserva lo que se sabía de él', async () => {
    const historia = fachada(MiHistoria);
    servidor(200, RESUMEN);
    await historia.cargar('/api/healthcare');
    historia.permisoDado();
    expect(historia.faltaElPermiso()).toBe(false);

    servidor(200, { ...RESUMEN, permisoDeLaHistoria: undefined });
    expect(await historia.enviarCheckIn('/api/healthcare', { alergias: ['Penicilina'] })).toBe(true);
    expect(historia.resumen()?.permisoDeLaHistoria).toBe('vigente');

    servidor(400, { error: 'documento: más de 200 caracteres.' });
    expect(await historia.enviarCheckIn('/api/healthcare', {})).toBe(false);
    expect(historia.aviso()).toBe('checkInRevisa');
  });
});

describe('La historia en el consultorio (T063)', () => {
  it('un miembro sin historia se distingue de un correo que no es de nadie', async () => {
    const consultorio = fachada(HistoriaEnElConsultorio);

    servidor(200, { patientKey: null, nombre: null, preRegistrado: false });
    await consultorio.buscar('/api/healthcare', 'camila@ejemplo.co');
    expect(consultorio.busqueda()).toBe('sin-historia');

    servidor(404, { error: 'No hay un miembro con ese correo.' });
    await consultorio.buscar('/api/healthcare', 'nadie@ejemplo.co');
    expect(consultorio.busqueda()).toBe('sin-miembro');

    servidor(200, { patientKey: '6f1c', nombre: 'Camila Restrepo', preRegistrado: true });
    await consultorio.buscar('/api/healthcare', 'camila@ejemplo.co');
    expect([consultorio.busqueda(), consultorio.encontrada()?.preRegistrado]).toEqual(['encontrada', true]);
  });

  it('sin el permiso del paciente el resumen queda negado, sin datos', async () => {
    const consultorio = fachada(HistoriaEnElConsultorio);
    servidor(200, { patientKey: '6f1c', nombre: 'Camila Restrepo', preRegistrado: true });
    await consultorio.buscar('/api/healthcare', 'camila@ejemplo.co');

    servidor(403);
    await consultorio.leerResumen('/api/healthcare');

    expect([consultorio.estadoDelResumen(), consultorio.resumen()]).toEqual(['negada', null]);
  });
});
