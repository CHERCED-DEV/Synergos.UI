import { InjectionToken } from '@angular/core';
import type { ReturnAdvanceResult, ReturnCase, ReturnRequestResult } from '../devoluciones/devoluciones.model';

/** Por qué no salió una escritura de devoluciones, en el vocabulario del adaptador. */
type MotivoDelRechazo<R> = Extract<R, { readonly ok: false }> extends { readonly reason: infer M } ? M : never;

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
  readonly comprasCaidas: string;
  /** Por qué no se abrió la devolución, cuando el servidor no lo explicó (#32). */
  readonly devolucionNoAbierta: Readonly<Record<MotivoDelRechazo<ReturnRequestResult>, string>>;
  /** Por qué el reclamo no se movió, cuando el servidor no lo explicó. */
  readonly reclamoNoMovido: Readonly<Record<MotivoDelRechazo<ReturnAdvanceResult>, string>>;
  /** El aviso del reclamo que el vendedor movió, con su estado nuevo. */
  reclamoMovido(claim: ReturnCase): string;
  readonly opinionAprobada: string;
  readonly opinionRechazada: string;
  readonly opinionYaAtendida: string;
  readonly opinionAjena: string;
  readonly opinionNoGuardada: string;
  /** Cómo se llama la variante de un producto que no trae ninguna. */
  readonly varianteEstandar: string;
  /** Lo que se oye al agregar un producto al carrito, y al no poder. */
  agregadoAlCarrito(titulo: string): string;
  noSeAgregoAlCarrito(titulo: string): string;
  /** Cuánto falta para el mínimo del cupón, con el importe ya formateado. */
  faltaParaElCupon(importe: string): string;
}

/** Los textos de la tienda. Sin factory a propósito: una app que monta la fachada sin decir qué se dice no arranca. */
export const TEXTOS_DE_LA_TIENDA = new InjectionToken<TextosDeLaTienda>('TEXTOS_DE_LA_TIENDA');
