import type { BffPropiedades } from '@synergos/contracts';
import {
  abrirPropiedadesVisita,
  cancelarPropiedadesVisita,
  cerrarPropiedadesVisita,
  consultarPropiedadesVisita,
  type Flujo,
  type RechazoDelFlujo,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';
import type { VisitMode } from './realty.model';

/**
 * La visita a un inmueble por la puerta, tipada con el contrato GENERADO de
 * `Synergos.Bff.Propiedades` (008-propiedades-visita, ADR 0140): la clave del flujo, sus
 * operaciones y la lectura de su respuesta.
 *
 * <p>Habla SÓLO con el coordinador (`<synergos-flujo>`) que la vista coloca alrededor del elemento,
 * y el transporte sale del envoltorio GENERADO del flujo (`generados/propiedades.visita.ts`, núcleo
 * N3: gana el generado). Un renombre en el orquestador se regenera allí y rompe la compilación de
 * este fichero (regla 24).</p>
 *
 * <p><b>El inmueble viaja como referencia con la clase que declara la definición</b> (NR-1): el
 * contrato generado la tipa como literal, así que otra clase no compila, y el orquestador la rechaza
 * igual si alguien la cambia en el DOM. El navegador sólo aporta el id de la ficha.</p>
 */
export const FLUJO_VISITA = 'propiedades.visita' as const satisfies Flujo;

/** Lo que la pantalla necesita de una visita por la puerta: lo que contestó el servidor. */
export interface VisitaLeida {
  readonly id: string;
  /** Lo que ve la persona y lo que dice su correo. */
  readonly numero: string;
  /** Running, Completed, Compensating, Compensated o CompensationFailed. */
  readonly estado: string;
  readonly inmueble: string;
  readonly ventana: { readonly start: string; readonly end: string } | null;
  readonly modo: VisitMode;
}

export function leerVisita(r: BffPropiedades.PropiedadesVisitaRespuesta): VisitaLeida {
  return {
    id: r.id,
    numero: r.numero,
    estado: r.estado,
    inmueble: r.datos.inmueble?.id ?? '',
    ventana: r.datos.ventana ?? null,
    modo: r.datos.modo === 'video' ? 'video' : 'in-person',
  };
}

function leida(r: ResultadoDelFlujo<BffPropiedades.PropiedadesVisitaRespuesta>): ResultadoDelFlujo<VisitaLeida> {
  return r.ok ? { ...r, valor: leerVisita(r.valor) } : r;
}

/** El cuerpo de abrir: el inmueble con su clase fija, la ventana de la franja y la modalidad. */
export function entradaDeLaVisita(
  inmueble: string,
  ventana: { readonly start: string; readonly end: string },
  modalidad: VisitMode,
): BffPropiedades.PropiedadesVisitaEntrada {
  return { inmueble: { kind: 'realty.listado', id: inmueble }, ventana: { start: ventana.start, end: ventana.end }, modalidad };
}

/** Aparta la franja. La llave es la de la INTENCIÓN: un reintento con ella no aparta dos veces. */
export async function abrirVisita(
  desde: Element,
  inmueble: string,
  ventana: { readonly start: string; readonly end: string },
  modalidad: VisitMode,
  llave: string,
): Promise<ResultadoDelFlujo<VisitaLeida>> {
  return leida(await abrirPropiedadesVisita(desde, { cuerpo: entradaDeLaVisita(inmueble, ventana, modalidad), llave }));
}

export async function cerrarVisita(desde: Element, id: string): Promise<ResultadoDelFlujo<VisitaLeida>> {
  return leida(await cerrarPropiedadesVisita(desde, { consulta: { id } }));
}

export async function consultarVisita(desde: Element, id: string): Promise<ResultadoDelFlujo<VisitaLeida>> {
  return leida(await consultarPropiedadesVisita(desde, { consulta: { id } }));
}

export async function cancelarVisita(desde: Element, id: string): Promise<ResultadoDelFlujo<VisitaLeida>> {
  return leida(await cancelarPropiedadesVisita(desde, { consulta: { id } }));
}

/** Si el rechazo es de la sesión: la puerta pide iniciarla y no dice nada de la visita. */
export const esDeSesion = (r: RechazoDelFlujo): boolean =>
  r.code === 'puerta.sesion_requerida' || r.code === 'cliente.redirigido';

/**
 * Cerrar y, si no contestó con la visita, CONSULTARLA: después de un rechazo lo que dice qué quedó es su
 * estado, no el rechazo. Así la pantalla nunca dice «agendada» ni «no quedó» sin saberlo.
 */
export async function cerrarYAsentar(
  desde: Element,
  id: string,
): Promise<{ readonly visita: VisitaLeida | null; readonly rechazo: RechazoDelFlujo | null }> {
  const r = await cerrarVisita(desde, id);
  if (r.ok) return { visita: r.valor, rechazo: null };
  if (esDeSesion(r.rechazo)) return { visita: null, rechazo: r.rechazo };
  const consulta = await consultarVisita(desde, id);
  return consulta.ok ? { visita: consulta.valor, rechazo: r.rechazo } : { visita: null, rechazo: r.rechazo };
}
