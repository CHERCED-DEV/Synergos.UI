import type { RechazoDelFlujo } from '@synergos/vitals-core';

/** Una franja como la lee el host: dos instantes ISO. */
export interface Ventana {
  readonly start: string;
  readonly end: string;
}

/** El dinero como lo publica el contrato: unidades MAYORES de su moneda. */
export interface Importe {
  readonly amount: number;
  readonly currency: string;
}

/** Lo que la pantalla necesita de una cita: lo que contestó el servidor, sin adornos. */
export interface CitaLeida {
  readonly id: string;
  readonly numero: string;
  /** Running, Completed, Compensating, Compensated, CompensationFailed o Stuck. */
  readonly estado: string;
  readonly profesionalId: string;
  readonly ventana: Ventana | null;
  /** `null` si el servidor no lo dio: la pantalla no inventa un copago. */
  readonly total: Importe | null;
  /** Si queda algo por deshacer: mientras tanto no se afirma que no se cobró. */
  readonly deshaciendo: boolean;
}

/** Una franja de la agenda del profesional, con cuántos cupos le quedan. */
export interface FranjaDeLaAgenda {
  readonly ventana: Ventana;
  readonly libres: number;
}

/** Lo que quedó tras una escritura sobre una cita que ya existe. */
export type CitaAsentada =
  | { readonly tipo: 'leida'; readonly cita: CitaLeida; readonly rechazo: RechazoDelFlujo | null }
  | { readonly tipo: 'sesion'; readonly rechazo: RechazoDelFlujo }
  | { readonly tipo: 'desconocida'; readonly rechazo: RechazoDelFlujo };
