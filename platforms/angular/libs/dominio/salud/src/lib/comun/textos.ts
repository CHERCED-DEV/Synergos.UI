import { InjectionToken } from '@angular/core';

/** Los textos del permiso de datos de salud: los de la sección `Health.Consent`, cuya versión declara el CMS. */
export interface TextosDelPermiso {
  readonly titulo: string;
  readonly proposito: string;
  readonly uso: string;
  readonly responsable: string;
  readonly aceptar: string;
  readonly retirar: string;
  readonly dado: string;
  readonly retirado: string;
}

/**
 * Lo que las fachadas de Salud le dicen al paciente (T051), con la receta de la tienda (`TEXTOS_DE_LA_TIENDA`).
 *
 * La lib no escribe ni traduce copy —ninguna librería traduce (ADR 0136)—: la app que la monta provee estos textos con su
 * diccionario. La fachada sólo decide CUÁL se dice.
 */
export interface TextosDeSalud {
  readonly permiso: TextosDelPermiso;
  /** Lo que se dice de un rechazo de la cita o del permiso, elegido por su `code`. */
  mensajeDeLaCita(code: string): string;
  /** Que el profesional no tiene horas libres en los próximos días. */
  readonly sinHorasLibres: string;
}

/** Los textos de Salud. Sin factory a propósito: una app que monta las fachadas sin decir qué se dice no arranca. */
export const TEXTOS_DE_SALUD = new InjectionToken<TextosDeSalud>('TEXTOS_DE_SALUD');
