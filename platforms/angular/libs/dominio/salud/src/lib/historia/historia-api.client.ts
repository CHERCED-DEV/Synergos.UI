import { enviarJsonAlBorde, esRegistro, leerBooleano, leerJsonDelBorde, leerTexto, leerTextos } from '@synergos/core';
import type {
  AperturaDeLaHistoria,
  CheckInDelPaciente,
  DatoDelResumen,
  HistoriaEncontrada,
  PermisoDeLaHistoria,
  PreRegistroLeido,
  ResumenDeLaHistoria,
} from './historia.model';

/**
 * Los adaptadores de la historia clínica de producción (`/api/healthcare`, I2 T062–T063). Una respuesta con otra forma
 * **lanza**: un resumen inventado diría que alguien no tiene alergias, y el que llama decide qué decir.
 */

/** El resumen del paciente de la sesión (`GET me/resumen`). */
export async function leerMiResumen(base: string): Promise<ResumenDeLaHistoria> {
  return conForma(resumenDeLaHistoria(await leerJsonDelBorde(base, `${base}/me/resumen`)));
}

/** El check-in del paciente de la sesión (`POST me/check-in`): devuelve el resumen como quedó. */
export async function enviarElCheckIn(base: string, checkIn: CheckInDelPaciente): Promise<ResumenDeLaHistoria> {
  return conForma(resumenDeLaHistoria(await enviarJsonAlBorde(base, `${base}/me/check-in`, checkIn)));
}

/** Recepción o el médico buscan la historia de un miembro por su correo (`POST patients/buscar`). */
export async function buscarLaHistoria(base: string, correo: string): Promise<HistoriaEncontrada> {
  const valor = await enviarJsonAlBorde(base, `${base}/patients/buscar`, { correo });
  if (!esRegistro(valor)) {
    throw new Error('historia-shape');
  }
  const clave = leerTexto(valor['patientKey']).trim();
  return { patientKey: clave || null, nombre: leerTexto(valor['nombre']).trim(), preRegistrado: leerBooleano(valor['preRegistrado']) };
}

/** Recepción abre la historia de un miembro (`POST patients/abrir`): la clave de la nueva, o de la que ya tenía. */
export async function abrirLaHistoria(base: string, apertura: AperturaDeLaHistoria): Promise<string> {
  const valor = await enviarJsonAlBorde(base, `${base}/patients/abrir`, apertura);
  const clave = esRegistro(valor) ? leerTexto(valor['patientKey']).trim() : '';
  if (!clave) {
    throw new Error('historia-shape');
  }
  return clave;
}

/** El resumen de un paciente para el médico con su permiso (`GET patients/{clave}/resumen`). */
export async function leerElResumenDelPaciente(base: string, clave: string): Promise<ResumenDeLaHistoria> {
  return conForma(resumenDeLaHistoria(await leerJsonDelBorde(base, `${base}/patients/${encodeURIComponent(clave)}/resumen`)));
}

/** El médico valida un dato declarado (`POST patients/{clave}/resumen/{dato}/validar`); idempotente. */
export async function validarElDato(base: string, clave: string, datoId: string): Promise<ResumenDeLaHistoria> {
  const url = `${base}/patients/${encodeURIComponent(clave)}/resumen/${encodeURIComponent(datoId)}/validar`;
  return conForma(resumenDeLaHistoria(await enviarJsonAlBorde(base, url, {})));
}

/** El resumen de una respuesta de `/api/healthcare`, o `null` si no tiene su forma. */
export function resumenDeLaHistoria(valor: unknown): ResumenDeLaHistoria | null {
  if (!esRegistro(valor) || !Array.isArray(valor['datos'])) {
    return null;
  }
  const permiso = leerTexto(valor['permisoDeLaHistoria']);
  return {
    datos: valor['datos'].map(dato).filter((d): d is DatoDelResumen => d !== null),
    preRegistro: preRegistro(valor['preRegistro']),
    hayResumen: leerBooleano(valor['hayResumen']),
    permisoDeLaHistoria: esPermiso(permiso) ? permiso : null,
  };
}

function conForma(resumen: ResumenDeLaHistoria | null): ResumenDeLaHistoria {
  if (!resumen) {
    throw new Error('historia-shape');
  }
  return resumen;
}

function esPermiso(texto: string): texto is PermisoDeLaHistoria {
  return texto === 'vigente' || texto === 'falta' || texto === 'desconocido';
}

function dato(valor: unknown): DatoDelResumen | null {
  if (!esRegistro(valor)) {
    return null;
  }
  const id = leerTexto(valor['id']).trim();
  const descripcion = leerTexto(valor['descripcion']).trim();
  if (!id || !descripcion) {
    return null;
  }
  const fecha = leerTexto(valor['fecha']).trim();
  return {
    id,
    tipo: leerTexto(valor['tipo']).trim(),
    descripcion,
    fecha: fecha || null,
    estado: leerTexto(valor['estado']).trim(),
    origen: leerTexto(valor['origen']).trim(),
  };
}

function preRegistro(valor: unknown): PreRegistroLeido | null {
  if (!esRegistro(valor)) {
    return null;
  }
  const texto = (clave: string): string => leerTexto(valor[clave]).trim();
  return {
    documento: texto('documento'),
    telefono: texto('telefono'),
    direccion: texto('direccion'),
    contactoDeEmergencia: texto('contactoDeEmergencia'),
    aseguradora: texto('aseguradora'),
    numeroDeAfiliacion: texto('numeroDeAfiliacion'),
    medicamentos: leerTextos(valor['medicamentos']),
    motivoDeLaVisita: texto('motivoDeLaVisita'),
    declaradoUtc: texto('declaradoUtc'),
  };
}
