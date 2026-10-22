import type { BffReservas } from '@synergos/contracts';
import {
  abrirReservasServicio,
  cancelarReservasServicio,
  cerrarReservasServicio,
  consultarReservasServicio,
  cotizarReservasServicio,
  disponibilidadReservasServicio,
  idAleatorio,
  listarReservasServicio,
  type Flujo,
  type RechazoDelFlujo,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';
import type { Ventana } from './reserva.horario';

/**
 * La reserva de un servicio por la puerta, tipada con el contrato GENERADO de
 * `Synergos.Bff.Reservas` (011-booking-reserva, ADR 0140): la clave del flujo, sus operaciones —las
 * cinco de la reserva, la lectura de las franjas libres y «mis reservas»— y la lectura de su respuesta.
 *
 * <p>Habla SÓLO con el coordinador (`<synergos-flujo>`) que la vista coloca alrededor del elemento:
 * ninguna ruta propia, ningún `fetch`, y el transporte sale del envoltorio GENERADO del flujo
 * (`generados/reservas.servicio.ts`, núcleo N3). Un renombre en el orquestador se regenera en
 * `bff-reservas.contract.ts` y en ese envoltorio, y rompe la compilación de este fichero (regla 24).</p>
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
  /** La clave de la ficha del servicio, para saber si es el de esta página. */
  readonly servicio: string | null;
  readonly ventana: Ventana | null;
  /** Hasta cuándo está apartada, como lo dice la agenda (NB-5). `null`: no se muestra ningún vencimiento. */
  readonly vence: string | null;
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
    servicio: r.datos.servicio?.id ?? null,
    ventana: r.datos.ventana,
    vence: r.datos.vence,
    total: r.datos.total,
    deshaciendo: r.deshaciendo || r.compensacionesPendientes > 0,
  };
}

function leida(r: ResultadoDelFlujo<BffReservas.ReservasServicioRespuesta>): ResultadoDelFlujo<ReservaLeida> {
  return r.ok ? { ...r, valor: leerReserva(r.valor) } : r;
}

/**
 * Lo que viaja al abrir y al cotizar. El servicio va como REFERENCIA con la clase que declara la
 * definición del flujo (NR-1): el contrato generado la tipa como literal, así que otra clase —o un
 * renombre en el orquestador— no compila. El navegador sólo aporta la clave de la ficha.
 */
export function entradaDeLaReserva(servicio: string, ventana: Ventana): BffReservas.ReservasServicioEntrada {
  return { servicio: { kind: 'reservas.servicio', id: servicio }, ventana };
}

/**
 * El total de la franja SIN apartar nada: el orquestador corre la fase que abre hasta antes de la
 * agenda y no guarda nada. Sin llave. `null` si el servidor no da total: no se inventa uno.
 */
export async function cotizarReserva(desde: Element, servicio: string, ventana: Ventana): Promise<ResultadoDelFlujo<Importe | null>> {
  const r = await cotizarReservasServicio(desde, { cuerpo: entradaDeLaReserva(servicio, ventana) });
  return r.ok ? { ...r, valor: r.valor.datos.total } : r;
}

/** Aparta la franja y autoriza el cobro. La llave es la de la intención (`llaveDeLaIntencion`). */
export async function abrirReserva(
  desde: Element,
  servicio: string,
  ventana: Ventana,
  llave: string,
): Promise<ResultadoDelFlujo<ReservaLeida>> {
  return leida(await abrirReservasServicio(desde, { cuerpo: entradaDeLaReserva(servicio, ventana), llave }));
}

/** Una franja como la lista la agenda, con cuántos cupos le quedan. */
export interface FranjaLeida {
  readonly ventana: Ventana;
  readonly libres: number;
}

/**
 * Las franjas del servicio en `rango`, también las llenas, de la lectura `disponibilidad` (NB-3): la pide
 * quien todavía no inició sesión, no aparta nada y no escribe nada. Lo libre lo cuenta la agenda con la
 * MISMA ocupación con que aparta; que siga libre al reservar lo dice abrir.
 */
export async function franjasDelServicio(desde: Element, servicio: string, rango: Ventana): Promise<ResultadoDelFlujo<readonly FranjaLeida[]>> {
  const r = await disponibilidadReservasServicio(desde, {
    cuerpo: { servicio: { kind: 'reservas.servicio', id: servicio }, desde: rango.start, hasta: rango.end },
  });
  return r.ok
    ? { ...r, valor: (r.valor.datos.franjas ?? []).map((f) => ({ ventana: { start: f.inicio, end: f.fin }, libres: f.libres })) }
    : r;
}

/** Una página de «mis reservas», de la más nueva a la más vieja. */
export interface PaginaDeReservas {
  readonly reservas: readonly ReservaLeida[];
  readonly total: number;
  readonly hayMas: boolean;
}

/** «Mis reservas» (NB-6): las del miembro de la sesión, que pone la puerta. Nunca se pide por dueño. */
export async function misReservas(desde: Element, limite = 20): Promise<ResultadoDelFlujo<PaginaDeReservas>> {
  const r = await listarReservasServicio(desde, { consulta: { limit: limite } });
  return r.ok
    ? { ...r, valor: { reservas: r.valor.items.map(leerReserva), total: r.valor.total, hayMas: r.valor.hasMore } }
    : r;
}

export async function consultarReserva(desde: Element, id: string): Promise<ResultadoDelFlujo<ReservaLeida>> {
  return leida(await consultarReservasServicio(desde, { consulta: { id } }));
}

export async function cerrarReserva(desde: Element, id: string): Promise<ResultadoDelFlujo<ReservaLeida>> {
  return leida(await cerrarReservasServicio(desde, { consulta: { id } }));
}

export async function cancelarReserva(desde: Element, id: string): Promise<ResultadoDelFlujo<ReservaLeida>> {
  return leida(await cancelarReservasServicio(desde, { consulta: { id } }));
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

/** El día y la hora que eligió quien fue a iniciar sesión: al volver, la pantalla los retoma. */
export interface EleccionGuardada {
  readonly dia: string;
  readonly hora: string;
}

export function guardarEleccion(servicio: string, eleccion: EleccionGuardada): void {
  escribirJson(`${PREFIJO}:eleccion:${servicio}`, eleccion);
}

/** La elección guardada del servicio, UNA vez: leerla la olvida. Lo que no tiene su forma se ignora. */
export function tomarEleccion(servicio: string): EleccionGuardada | null {
  const clave = `${PREFIJO}:eleccion:${servicio}`;
  const v = leerJson(clave) as Partial<EleccionGuardada> | null;
  escribirJson(clave, null);
  return v && esTexto(v.dia) && esTexto(v.hora) ? { dia: v.dia, hora: v.hora } : null;
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
