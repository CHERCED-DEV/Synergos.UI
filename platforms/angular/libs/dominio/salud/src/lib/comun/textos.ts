import { InjectionToken } from '@angular/core';

/** Los textos del permiso de datos de salud: los de la sección `Health.Consent`, cuya versión declara el CMS. */
export interface TextosDelPermiso {
  readonly titulo: string;
  readonly proposito: string;
  readonly uso: string;
  readonly responsable: string;
  /** Que la historia clínica se conserva por ley aunque se borre la cuenta (ADR 0142 del CMS). */
  readonly conservacion: string;
  readonly aceptar: string;
  readonly retirar: string;
  readonly dado: string;
  readonly retirado: string;
}

/** Lo que dicen las fachadas de la historia (I2 T062–T063): los de la sección `Health.Record`. */
export interface TextosDeLaHistoria {
  readonly checkInGuardado: string;
  readonly checkInRevisa: string;
  readonly checkInSinHistoria: string;
  readonly checkInSinSesion: string;
  readonly checkInFallo: string;
  readonly aperturaLista: string;
  readonly aperturaSinRol: string;
  readonly aperturaRevisa: string;
  readonly aperturaFallo: string;
  readonly validarSinPermiso: string;
  readonly validarFallo: string;
  // La consulta (I3).
  readonly llegadaNoSigue: string;
  readonly llegadaFallo: string;
  readonly notaGuardada: string;
  readonly notaFirmada: string;
  readonly notaYaFirmada: string;
  readonly notaRevisa: string;
  readonly notaSinLlave: string;
  readonly notaFallo: string;
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
  readonly historia: TextosDeLaHistoria;
}

/** Los textos de Salud. Sin factory a propósito: una app que monta las fachadas sin decir qué se dice no arranca. */
export const TEXTOS_DE_SALUD = new InjectionToken<TextosDeSalud>('TEXTOS_DE_SALUD');
