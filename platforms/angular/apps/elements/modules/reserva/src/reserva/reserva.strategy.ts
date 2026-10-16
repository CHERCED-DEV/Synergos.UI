import type { BffReservas } from '@synergos/contracts';
import {
  idAleatorio,
  pedirAlFlujo,
  type Flujo,
  type RechazoDelFlujo,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';
import type { Ventana } from './reserva.horario';

/**
 * La reserva de un servicio por la puerta, tipada con el contrato GENERADO de
 * `Synergos.Bff.Reservas` (011-booking-reserva, ADR 0140): la clave del flujo, sus cinco
 * operaciones y la lectura de su respuesta.
 *
 * <p>Habla SÓLO con el coordinador (`<synergos-flujo>`) que la vista coloca alrededor del elemento:
 * ninguna ruta propia, ningún `fetch`. Un renombre en el orquestador se regenera en
 * `bff-reservas.contract.ts` y rompe la compilación de este fichero (regla 24).</p>
 *
 * <p><b>Lo que decide esta capa y no la pantalla</b>: que una respuesta que no dice en qué quedó la
 * reserva se CONSULTA antes de afirmar nada (cerrar o cancelar que fallan), que la llave de abrir es
 * la de la INTENCIÓN —el mismo servicio y la misma franja dan la misma llave, así que reintentar no
 * aparta dos veces— y que la reserva pendiente se guarda antes de abrir, para resolverla al volver.
 * Nunca reintenta una escritura sola: abrir sin respuesta se le ofrece a la persona con la misma
 * llave.</p>
 */
export const FLUJO_RESERVA = 'reservas.servicio' as const satisfies Flujo;

/** El dinero como lo publica el contrato: unidades MAYORES de su moneda. */
export interface Importe {
  readonly amount: number;
  readonly currency: string;
}

/** Lo que la pantalla necesita de una reserva: lo que contestó el servidor, sin adornos. */
export interface ReservaLeida {
  readonly id: string;
  readonly numero: string;
  /** Running, Completed, Compensating, Compensated o CompensationFailed. */
  readonly estado: string;
  readonly ventana: Ventana | null;
  /** `null` si el servidor no lo dio: la pantalla no muestra precio. */
  readonly total: Importe | null;
  /** Si queda algo por deshacer: mientras tanto no se afirma que no se cobró. */
  readonly deshaciendo: boolean;
}

export function leerReserva(r: BffReservas.ReservasServicioRespuesta): ReservaLeida {
  return {
    id: r.id,
    numero: r.numero,
    estado: r.estado,
    ventana: r.datos.ventana,
    total: r.datos.total,
    deshaciendo: r.deshaciendo || r.compensacionesPendientes > 0,
  };
}

function leida(r: ResultadoDelFlujo<BffReservas.ReservasServicioRespuesta>): ResultadoDelFlujo<ReservaLeida> {
  return r.ok ? { ...r, valor: leerReserva(r.valor) } : r;
}

/**
 * El total de la franja SIN apartar nada: el orquestador corre la fase que abre hasta antes de la
 * agenda y no guarda nada. Sin llave. `null` si el servidor no da total: no se inventa uno.
 */
export async function cotizarReserva(desde: Element, cuerpo: BffReservas.ReservasServicioEntrada): Promise<ResultadoDelFlujo<Importe | null>> {
  const r = await pedirAlFlujo(desde, FLUJO_RESERVA, 'cotizar', { cuerpo });
  return r.ok ? { ...r, valor: r.valor.datos.total } : r;
}

/** Aparta la franja y autoriza el cobro. La llave es la de la intención (`llaveDeLaIntencion`). */
export async function abrirReserva(
  desde: Element,
  cuerpo: BffReservas.ReservasServicioEntrada,
  llave: string,
): Promise<ResultadoDelFlujo<ReservaLeida>> {
  return leida(await pedirAlFlujo(desde, FLUJO_RESERVA, 'abrir', { cuerpo, llave }));
}

export async function consultarReserva(desde: Element, id: string): Promise<ResultadoDelFlujo<ReservaLeida>> {
  return leida(await pedirAlFlujo(desde, FLUJO_RESERVA, 'consultar', { consulta: { id } }));
}

export async function cerrarReserva(desde: Element, id: string): Promise<ResultadoDelFlujo<ReservaLeida>> {
  return leida(await pedirAlFlujo(desde, FLUJO_RESERVA, 'cerrar', { consulta: { id } }));
}

export async function cancelarReserva(desde: Element, id: string): Promise<ResultadoDelFlujo<ReservaLeida>> {
  return leida(await pedirAlFlujo(desde, FLUJO_RESERVA, 'cancelar', { consulta: { id } }));
}

/**
 * Lo que quedó después de cerrar o cancelar: la reserva LEÍDA del servidor (con el rechazo de la
 * operación, si lo hubo, para decir por qué), la sesión que falta, o que no se pudo saber.
 */
export type ReservaAsentada =
  | { readonly tipo: 'leida'; readonly reserva: ReservaLeida; readonly rechazo: RechazoDelFlujo | null }
  | { readonly tipo: 'sesion'; readonly rechazo: RechazoDelFlujo }
  | { readonly tipo: 'desconocida'; readonly rechazo: RechazoDelFlujo };

const esDeSesion = (r: RechazoDelFlujo): boolean =>
  r.code === 'puerta.sesion_requerida' || r.code === 'cliente.redirigido';

/**
 * Una escritura sobre una reserva que ya existe y, si no contestó con la reserva, la CONSULTA:
 * después de un rechazo —el pago, la agenda, un 503, una respuesta ilegible— lo que dice qué
 * quedó es su estado, no el rechazo. Así la pantalla nunca dice «no se cobró» sin saberlo.
 */
export async function escribirYAsentar(
  desde: Element,
  id: string,
  escribir: (desde: Element, id: string) => Promise<ResultadoDelFlujo<ReservaLeida>>,
): Promise<ReservaAsentada> {
  const r = await escribir(desde, id);
  if (r.ok) return { tipo: 'leida', reserva: r.valor, rechazo: null };
  if (esDeSesion(r.rechazo)) return { tipo: 'sesion', rechazo: r.rechazo };
  const consulta = await consultarReserva(desde, id);
  if (consulta.ok) return { tipo: 'leida', reserva: consulta.valor, rechazo: r.rechazo };
  if (esDeSesion(consulta.rechazo)) return { tipo: 'sesion', rechazo: consulta.rechazo };
  return { tipo: 'desconocida', rechazo: r.rechazo };
}

// ── La pendiente y la llave de la intención, en la sesión del navegador ───────────────────────

/**
 * La reserva que se abrió desde esta pestaña y todavía no se resolvió: sobrevive a la recarga y a la
 * vuelta del login. `id` es `null` mientras abrir no contestó (nadie tiene su id; reintentar con la
 * misma llave lo devuelve).
 */
export interface PendienteGuardada {
  readonly servicio: string;
  readonly ventana: Ventana;
  readonly llave: string;
  readonly id: string | null;
}

const PREFIJO = 'synergos:reserva';

function almacen(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function leerJson(clave: string): unknown {
  try {
    const crudo = almacen()?.getItem(clave);
    return crudo ? (JSON.parse(crudo) as unknown) : null;
  } catch {
    return null;
  }
}

function escribirJson(clave: string, valor: unknown): void {
  try {
    if (valor === null) almacen()?.removeItem(clave);
    else almacen()?.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento la reserva sigue: sólo no sobrevive a la recarga.
  }
}

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function esVentana(v: unknown): v is Ventana {
  return typeof v === 'object' && v !== null && esTexto((v as Ventana).start) && esTexto((v as Ventana).end);
}

/** La pendiente del servicio, o `null`. Lo que no tiene su forma se ignora. */
export function leerPendiente(servicio: string): PendienteGuardada | null {
  const v = leerJson(`${PREFIJO}:pendiente:${servicio}`) as Partial<PendienteGuardada> | null;
  if (!v || v.servicio !== servicio || !esTexto(v.llave) || !esVentana(v.ventana)) return null;
  return { servicio, ventana: v.ventana, llave: v.llave, id: esTexto(v.id) ? v.id : null };
}

export function guardarPendiente(pendiente: PendienteGuardada): void {
  escribirJson(`${PREFIJO}:pendiente:${pendiente.servicio}`, pendiente);
}

export function olvidarPendiente(servicio: string): void {
  escribirJson(`${PREFIJO}:pendiente:${servicio}`, null);
}

/** Cuántas intenciones se recuerdan por servicio: las de una sesión de navegación, no un historial. */
const INTENCIONES = 20;

/**
 * La llave de abrir para ESTA intención —este servicio, esta franja—: la misma al reintentar, otra
 * si cambia la franja. Con la misma llave el orquestador devuelve la reserva en curso, o reabre la
 * que se deshizo (el pago rechazado se reintenta sin apartar dos veces).
 */
export function llaveDeLaIntencion(servicio: string, ventana: Ventana): string {
  const clave = `${PREFIJO}:intenciones:${servicio}`;
  const crudo = leerJson(clave);
  const vistas: Array<[string, string]> = Array.isArray(crudo)
    ? crudo.filter((par): par is [string, string] => Array.isArray(par) && esTexto(par[0]) && esTexto(par[1]))
    : [];
  const franja = `${ventana.start}|${ventana.end}`;
  const vista = vistas.find(([f]) => f === franja);
  if (vista) return vista[1];
  const llave = idAleatorio();
  escribirJson(clave, [...vistas, [franja, llave]].slice(-INTENCIONES));
  return llave;
}
