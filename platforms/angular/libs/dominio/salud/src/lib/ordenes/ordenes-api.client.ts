import { enviarJsonAlBorde, esRegistro, leerBooleano, leerJsonDelBorde, leerTexto } from '@synergos/core';
import type { ExamenDeLaOrden, OrdenDelPaciente, OrdenEscrita, ResultadoCargado, ResultadoDelExamen } from './ordenes.model';

/**
 * Los adaptadores de órdenes y resultados (`/api/healthcare`, I4). Otra forma **lanza**: un resultado que no se pudo leer no
 * es un examen sin resultado.
 */

const paciente = (base: string, key: string): string => `${base}/patients/${encodeURIComponent(key)}`;

export async function leerLasOrdenes(base: string, patientKey: string): Promise<readonly OrdenDelPaciente[]> {
  return lista(await leerJsonDelBorde(base, `${paciente(base, patientKey)}/ordenes`));
}

/** Las órdenes del paciente de la sesión: sólo sus resultados liberados. */
export async function leerMisOrdenes(base: string): Promise<readonly OrdenDelPaciente[]> {
  return lista(await leerJsonDelBorde(base, `${base}/me/ordenes`));
}

export async function ordenar(base: string, patientKey: string, orden: OrdenEscrita): Promise<OrdenDelPaciente> {
  return conForma(laOrden(await enviarJsonAlBorde(base, `${paciente(base, patientKey)}/ordenes`, orden)));
}

export async function cargarElResultado(
  base: string, patientKey: string, ordenId: string, resultado: ResultadoCargado,
): Promise<OrdenDelPaciente> {
  const url = `${paciente(base, patientKey)}/ordenes/${encodeURIComponent(ordenId)}/resultados`;
  return conForma(laOrden(await enviarJsonAlBorde(base, url, resultado)));
}

export async function liberarElResultado(base: string, patientKey: string, resultadoId: string): Promise<OrdenDelPaciente> {
  const url = `${paciente(base, patientKey)}/resultados/${encodeURIComponent(resultadoId)}/liberar`;
  return conForma(laOrden(await enviarJsonAlBorde(base, url, {})));
}

/** Dónde se descarga el informe: el del consultorio, o el del paciente de la sesión (`patientKey` nulo). */
export function urlDelInforme(base: string, resultadoId: string, patientKey: string | null): string {
  return patientKey
    ? `${paciente(base, patientKey)}/resultados/${encodeURIComponent(resultadoId)}/informe`
    : `${base}/me/resultados/${encodeURIComponent(resultadoId)}/informe`;
}

function lista(valor: unknown): readonly OrdenDelPaciente[] {
  if (!Array.isArray(valor)) {
    throw new Error('ordenes-shape');
  }
  return valor.map(laOrden).filter((o): o is OrdenDelPaciente => o !== null);
}

function conForma(orden: OrdenDelPaciente | null): OrdenDelPaciente {
  if (!orden) {
    throw new Error('orden-shape');
  }
  return orden;
}

function laOrden(valor: unknown): OrdenDelPaciente | null {
  if (!esRegistro(valor) || !Array.isArray(valor['examenes'])) {
    return null;
  }
  const id = leerTexto(valor['id']);
  if (!id) {
    return null;
  }
  return {
    id,
    tipo: leerTexto(valor['tipo']),
    indicacion: leerTexto(valor['indicacion']) || null,
    creadaUtc: leerTexto(valor['creadaUtc']),
    estado: leerTexto(valor['estado']),
    examenes: valor['examenes'].map(examen).filter((e): e is ExamenDeLaOrden => e !== null),
  };
}

function examen(valor: unknown): ExamenDeLaOrden | null {
  if (!esRegistro(valor) || !leerTexto(valor['id'])) {
    return null;
  }
  return { id: leerTexto(valor['id']), nombre: leerTexto(valor['nombre']), resultado: resultado(valor['resultado']) };
}

function resultado(valor: unknown): ResultadoDelExamen | null {
  if (!esRegistro(valor) || !leerTexto(valor['id'])) {
    return null;
  }
  return {
    id: leerTexto(valor['id']),
    valor: leerTexto(valor['valor']),
    unidad: leerTexto(valor['unidad']) || null,
    rango: leerTexto(valor['rango']) || null,
    marca: leerTexto(valor['marca']),
    nota: leerTexto(valor['nota']) || null,
    tieneInforme: leerBooleano(valor['tieneInforme']),
    liberado: leerBooleano(valor['liberado']),
  };
}
