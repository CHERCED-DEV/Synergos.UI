/** Las órdenes médicas y sus resultados (003-salud-cita, I4), con la forma de `/api/healthcare`. */

export type TipoDeOrden = 'laboratorio' | 'imagenes' | 'remision';
export type MarcaDelResultado = 'normal' | 'alto' | 'bajo' | 'critico';

export const TIPOS_DE_ORDEN: readonly TipoDeOrden[] = ['laboratorio', 'imagenes', 'remision'];
export const MARCAS_DEL_RESULTADO: readonly MarcaDelResultado[] = ['normal', 'alto', 'bajo', 'critico'];

export interface ResultadoDelExamen {
  readonly id: string;
  readonly valor: string;
  readonly unidad: string | null;
  readonly rango: string | null;
  readonly marca: string;
  readonly nota: string | null;
  readonly tieneInforme: boolean;
  /** Para el paciente siempre `true`: lo que no se ha liberado no le llega. */
  readonly liberado: boolean;
}

export interface ExamenDeLaOrden {
  readonly id: string;
  readonly nombre: string;
  readonly resultado: ResultadoDelExamen | null;
}

export interface OrdenDelPaciente {
  readonly id: string;
  readonly tipo: string;
  readonly indicacion: string | null;
  readonly creadaUtc: string;
  readonly estado: string;
  readonly examenes: readonly ExamenDeLaOrden[];
}

export interface OrdenEscrita {
  readonly tipo: TipoDeOrden;
  readonly examenes: readonly string[];
  readonly indicacion?: string;
}

export interface ResultadoCargado {
  readonly examenId: string;
  readonly valor: string;
  readonly unidad?: string;
  readonly rango?: string;
  readonly marca: MarcaDelResultado;
  readonly nota?: string;
  readonly informe?: { readonly nombre: string; readonly tipo: string; readonly contenidoBase64: string };
}
