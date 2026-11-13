/**
 * La consulta (003-salud-cita, I3) como la leen el consultorio y el médico, con la forma de `/api/healthcare`: la agenda
 * del día con la llegada de cada cita (P9, P10) y las notas SOAP firmadas (P6).
 */

/** En qué va la llegada de una cita: los estados del proceso `salud.llegada.v1`. */
export type LlegadaDeLaCita = 'agendada' | 'llego' | 'en-sala' | 'atendido' | 'no-vino';

/** Los pasos que mueven la llegada. */
export type PasoDeLlegada = 'llegar' | 'pasar' | 'atender' | 'no-vino';

export interface CitaDelDia {
  readonly reservaId: string;
  readonly inicio: string;
  readonly fin: string;
  readonly llegada: LlegadaDeLaCita;
  /** El nombre y la historia del paciente; `null` si todavía no tiene historia abierta. */
  readonly paciente: { readonly nombre: string | null; readonly patientKey: string | null };
}

/** Lo que el médico escribe de una consulta. Sin `id`, es una nota nueva. */
export interface NotaEscrita {
  readonly id?: string;
  readonly reservaId?: string;
  readonly subjetivo: string;
  readonly objetivo: string;
  readonly analisis: string;
  readonly plan: string;
}

export interface NotaDeLaConsulta {
  readonly id: string;
  readonly reservaId: string | null;
  readonly subjetivo: string;
  readonly objetivo: string;
  readonly analisis: string;
  readonly plan: string;
  readonly creadaUtc: string;
  readonly firmada: boolean;
  readonly firmadaUtc: string | null;
}

/** El paso que sigue para cada estado de la llegada; `null` cuando ya terminó. */
export function siguientePaso(llegada: LlegadaDeLaCita): PasoDeLlegada | null {
  switch (llegada) {
    case 'agendada':
      return 'llegar';
    case 'llego':
      return 'pasar';
    case 'en-sala':
      return 'atender';
    default:
      return null;
  }
}
