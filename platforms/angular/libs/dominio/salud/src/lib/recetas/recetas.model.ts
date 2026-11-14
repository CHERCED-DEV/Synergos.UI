/** Las recetas firmadas y su renovación (003-salud-cita, I5), con la forma de `/api/healthcare`. */

export interface RecetaDelPaciente {
  readonly id: string;
  readonly medicamento: string;
  readonly dosis: string;
  readonly frecuencia: string;
  readonly indicaciones: string | null;
  readonly desdeUtc: string;
  readonly hastaUtc: string;
  /** `active` o `revoked`. */
  readonly estado: string;
  /** Activa, firmada y en su vigencia: la medicación activa. */
  readonly vigente: boolean;
  readonly firmada: boolean;
  readonly renuevaA: string | null;
}

export interface RenovacionDeReceta {
  readonly id: string;
  readonly recetaId: string;
  readonly nota: string | null;
  /** `pedida`, `aprobada` o `rechazada`. */
  readonly estado: string;
  readonly pedidaUtc: string;
  readonly nuevaRecetaId: string | null;
  readonly motivo: string | null;
}

export interface RecetaEscrita {
  readonly medicamento: string;
  readonly dosis: string;
  readonly frecuencia: string;
  readonly indicaciones?: string;
  readonly dias?: number;
}
