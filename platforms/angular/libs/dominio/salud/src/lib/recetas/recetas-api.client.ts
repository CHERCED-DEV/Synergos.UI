import { enviarJsonAlBorde, esRegistro, leerBooleano, leerJsonDelBorde, leerTexto } from '@synergos/core';
import type { RecetaDelPaciente, RecetaEscrita, RenovacionDeReceta } from './recetas.model';

/** Los adaptadores de recetas y renovaciones (`/api/healthcare`, I5). Otra forma **lanza**. */

const paciente = (base: string, key: string): string => `${base}/patients/${encodeURIComponent(key)}`;

export async function leerLasRecetas(base: string, patientKey: string): Promise<readonly RecetaDelPaciente[]> {
  return lista(await leerJsonDelBorde(base, `${paciente(base, patientKey)}/recetas`), receta);
}

export async function leerMisRecetas(base: string): Promise<readonly RecetaDelPaciente[]> {
  return lista(await leerJsonDelBorde(base, `${base}/me/recetas`), receta);
}

export async function emitirLaReceta(base: string, patientKey: string, escrita: RecetaEscrita): Promise<RecetaDelPaciente> {
  return conForma(receta(await enviarJsonAlBorde(base, `${paciente(base, patientKey)}/recetas`, escrita)));
}

export async function anularLaReceta(base: string, patientKey: string, id: string): Promise<RecetaDelPaciente> {
  return conForma(receta(await enviarJsonAlBorde(base, `${paciente(base, patientKey)}/recetas/${encodeURIComponent(id)}/anular`, {})));
}

export async function leerLasRenovaciones(base: string, patientKey: string): Promise<readonly RenovacionDeReceta[]> {
  return lista(await leerJsonDelBorde(base, `${paciente(base, patientKey)}/renovaciones`), renovacion);
}

export async function leerMisRenovaciones(base: string): Promise<readonly RenovacionDeReceta[]> {
  return lista(await leerJsonDelBorde(base, `${base}/me/renovaciones`), renovacion);
}

export async function pedirLaRenovacion(base: string, recetaId: string): Promise<RenovacionDeReceta> {
  return conForma(renovacion(await enviarJsonAlBorde(base, `${base}/me/recetas/${encodeURIComponent(recetaId)}/renovacion`, {})));
}

export async function resolverLaRenovacion(
  base: string, patientKey: string, id: string, aprobar: boolean, motivo?: string,
): Promise<RenovacionDeReceta> {
  const url = `${paciente(base, patientKey)}/renovaciones/${encodeURIComponent(id)}/${aprobar ? 'aprobar' : 'rechazar'}`;
  return conForma(renovacion(await enviarJsonAlBorde(base, url, aprobar ? {} : { motivo })));
}

/** Dónde se descarga el PDF de la receta: el del consultorio, o el del paciente de la sesión (`patientKey` nulo). */
export function urlDeLaReceta(base: string, recetaId: string, patientKey: string | null): string {
  return patientKey
    ? `${paciente(base, patientKey)}/recetas/${encodeURIComponent(recetaId)}/pdf`
    : `${base}/me/recetas/${encodeURIComponent(recetaId)}/pdf`;
}

function lista<T>(valor: unknown, leer: (v: unknown) => T | null): readonly T[] {
  if (!Array.isArray(valor)) {
    throw new Error('recetas-shape');
  }
  return valor.map(leer).filter((x): x is T => x !== null);
}

function conForma<T>(valor: T | null): T {
  if (!valor) {
    throw new Error('recetas-shape');
  }
  return valor;
}

function receta(valor: unknown): RecetaDelPaciente | null {
  if (!esRegistro(valor) || !leerTexto(valor['id'])) {
    return null;
  }
  const texto = (clave: string): string => leerTexto(valor[clave]);
  return {
    id: texto('id'),
    medicamento: texto('medicamento'),
    dosis: texto('dosis'),
    frecuencia: texto('frecuencia'),
    indicaciones: texto('indicaciones') || null,
    desdeUtc: texto('desdeUtc'),
    hastaUtc: texto('hastaUtc'),
    estado: texto('estado'),
    vigente: leerBooleano(valor['vigente']),
    firmada: leerBooleano(valor['firmada']),
    renuevaA: texto('renuevaA') || null,
  };
}

function renovacion(valor: unknown): RenovacionDeReceta | null {
  if (!esRegistro(valor) || !leerTexto(valor['id'])) {
    return null;
  }
  const texto = (clave: string): string => leerTexto(valor[clave]);
  return {
    id: texto('id'),
    recetaId: texto('recetaId'),
    nota: texto('nota') || null,
    estado: texto('estado'),
    pedidaUtc: texto('pedidaUtc'),
    nuevaRecetaId: texto('nuevaRecetaId') || null,
    motivo: texto('motivo') || null,
  };
}
