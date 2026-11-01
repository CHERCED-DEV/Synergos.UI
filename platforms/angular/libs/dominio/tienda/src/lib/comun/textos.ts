import { InjectionToken } from '@angular/core';

/**
 * Lo que los casos de uso de la fachada le dicen a quien compra (014-despiece-tienda, T008).
 *
 * La lib no escribe ni traduce copy —ninguna librería traduce (ADR 0136)—: la app que la monta provee estos textos,
 * con su diccionario o escritos a mano, y la deuda se cuenta en la app. La fachada sólo decide CUÁL se dice.
 */
export interface TextosDeLaTienda {
  readonly busquedaCaida: string;
  readonly productoCaido: string;
  readonly favoritoNoGuardado: string;
  readonly resenaEnRevision: string;
  readonly resenaPublicada: string;
  readonly resenaSinSesion: string;
  readonly resenaNoCompraste: string;
  readonly resenaInvalida: string;
  readonly resenaCaida: string;
  readonly reporteRecibido: string;
  readonly reporteSinSesion: string;
  readonly reporteCaido: string;
}

/** Los textos de la tienda. Sin factory a propósito: una app que monta la fachada sin decir qué se dice no arranca. */
export const TEXTOS_DE_LA_TIENDA = new InjectionToken<TextosDeLaTienda>('TEXTOS_DE_LA_TIENDA');
