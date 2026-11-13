import { enviarJsonAlBorde, esRegistro, leerBooleano, leerJsonDelBorde, leerTexto } from '@synergos/core';
import type { CitaDelDia, LlegadaDeLaCita, NotaDeLaConsulta, NotaEscrita, PasoDeLlegada } from './consulta.model';

/**
 * Los adaptadores de la consulta (`/api/healthcare`, I3). Una respuesta con otra forma **lanza**: una agenda inventada
 * manda a atender a quien no vino, y una nota que no se pudo leer no es una nota vacía.
 */

const LLEGADAS: ReadonlySet<string> = new Set(['agendada', 'llego', 'en-sala', 'atendido', 'no-vino']);

/** La agenda del día de un profesional (`GET agenda?profesional=&dia=`). */
export async function leerLaAgenda(base: string, profesional: string, dia: string): Promise<readonly CitaDelDia[]> {
  const url = `${base}/agenda?profesional=${encodeURIComponent(profesional)}&dia=${encodeURIComponent(dia)}`;
  const valor = await leerJsonDelBorde(base, url);
  if (!esRegistro(valor) || !Array.isArray(valor['citas'])) {
    throw new Error('agenda-shape');
  }
  return valor['citas'].map(cita).filter((c): c is CitaDelDia => c !== null);
}

/** Marca un paso de la llegada (`POST agenda/{reserva}/llegada`). Devuelve en qué quedó. */
export async function marcarLaLlegada(base: string, reservaId: string, paso: PasoDeLlegada): Promise<LlegadaDeLaCita> {
  const valor = await enviarJsonAlBorde(base, `${base}/agenda/${encodeURIComponent(reservaId)}/llegada`, { paso });
  const llegada = esRegistro(valor) ? leerTexto(valor['llegada']) : '';
  if (!LLEGADAS.has(llegada)) {
    throw new Error('llegada-shape');
  }
  return llegada as LlegadaDeLaCita;
}

export async function leerLasNotas(base: string, patientKey: string): Promise<readonly NotaDeLaConsulta[]> {
  const valor = await leerJsonDelBorde(base, `${base}/patients/${encodeURIComponent(patientKey)}/notas`);
  if (!Array.isArray(valor)) {
    throw new Error('notas-shape');
  }
  return valor.map(nota).filter((n): n is NotaDeLaConsulta => n !== null);
}

export async function escribirLaNota(base: string, patientKey: string, escrita: NotaEscrita): Promise<NotaDeLaConsulta> {
  return conForma(nota(await enviarJsonAlBorde(base, `${base}/patients/${encodeURIComponent(patientKey)}/notas`, escrita)));
}

export async function firmarLaNota(base: string, patientKey: string, id: string): Promise<NotaDeLaConsulta> {
  const url = `${base}/patients/${encodeURIComponent(patientKey)}/notas/${encodeURIComponent(id)}/firmar`;
  return conForma(nota(await enviarJsonAlBorde(base, url, {})));
}

/** Si la firma de una nota sigue valiendo con lo que hoy dice la nota. */
export async function comprobarLaNota(base: string, patientKey: string, id: string): Promise<boolean> {
  const url = `${base}/patients/${encodeURIComponent(patientKey)}/notas/${encodeURIComponent(id)}/comprobar`;
  const valor = await leerJsonDelBorde(base, url);
  return esRegistro(valor) && leerBooleano(valor['valida']);
}

function conForma(n: NotaDeLaConsulta | null): NotaDeLaConsulta {
  if (!n) {
    throw new Error('nota-shape');
  }
  return n;
}

function cita(valor: unknown): CitaDelDia | null {
  if (!esRegistro(valor)) {
    return null;
  }
  const reservaId = leerTexto(valor['reservaId']).trim();
  const llegada = leerTexto(valor['llegada']);
  if (!reservaId || !LLEGADAS.has(llegada)) {
    return null;
  }
  const paciente = esRegistro(valor['paciente']) ? valor['paciente'] : {};
  return {
    reservaId,
    inicio: leerTexto(valor['inicio']),
    fin: leerTexto(valor['fin']),
    llegada: llegada as LlegadaDeLaCita,
    paciente: {
      nombre: leerTexto(paciente['nombre']).trim() || null,
      patientKey: leerTexto(paciente['patientKey']).trim() || null,
    },
  };
}

function nota(valor: unknown): NotaDeLaConsulta | null {
  if (!esRegistro(valor)) {
    return null;
  }
  const id = leerTexto(valor['id']).trim();
  if (!id) {
    return null;
  }
  const texto = (clave: string): string => leerTexto(valor[clave]);
  return {
    id,
    reservaId: texto('reservaId') || null,
    subjetivo: texto('subjetivo'),
    objetivo: texto('objetivo'),
    analisis: texto('analisis'),
    plan: texto('plan'),
    creadaUtc: texto('creadaUtc'),
    firmada: leerBooleano(valor['firmada']),
    firmadaUtc: texto('firmadaUtc') || null,
  };
}
