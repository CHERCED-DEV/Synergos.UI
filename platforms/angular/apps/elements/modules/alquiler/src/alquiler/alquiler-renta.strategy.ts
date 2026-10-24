import type { BffAlquiler } from '@synergos/contracts';
import {
  abrirAlquilerRenta,
  cancelarAlquilerRenta,
  cerrarAlquilerRenta,
  consultarAlquilerRenta,
  cotizarAlquilerRenta,
  idAleatorio,
  type Flujo,
  type RechazoDelFlujo,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';
import type { CaminoDeLaRenta } from './alquiler.model';

/**
 * La renta de un equipo por la puerta, tipada con el contrato GENERADO de `Synergos.Bff.Alquiler`
 * (005-alquiler-renta, ADR 0140): la clave del flujo, sus operaciones y la lectura de su respuesta.
 *
 * <p>Habla SÓLO con el coordinador (`<synergos-flujo flujo="alquiler.renta">`) que la vista coloca
 * alrededor del elemento, con las funciones GENERADAS del flujo (`generados/alquiler.renta.ts`, «gana el
 * generado»): ningún `fetch`, ninguna ruta propia. Un renombre en el orquestador se regenera en
 * `bff-alquiler.contract.ts` y rompe la compilación de este fichero.</p>
 *
 * <p><b>Lo que decide esta capa y no la pantalla</b>: que una escritura que no contestó con la renta se
 * CONSULTA antes de afirmar nada; que la llave de abrir es la de la INTENCIÓN —el mismo equipo, las mismas
 * unidades y las mismas fechas dan la misma llave, así que reintentar no aparta dos veces—; y que la
 * intención se guarda, CON SU CAMINO, antes de salir a la red: lo que se abrió por la puerta se confirma por
 * la puerta aunque la página diga hoy otra cosa.</p>
 */
export const FLUJO_RENTA = 'alquiler.renta' as const satisfies Flujo;

/** El dinero como lo publica el contrato: unidades MAYORES de su moneda. */
export interface Importe {
  readonly amount: number;
  readonly currency: string;
}

/** Una ventana del flujo: instantes ISO, el retiro a medianoche UTC del día que se pidió. */
export interface Ventana {
  readonly start: string;
  readonly end: string;
}

/** Lo que la pantalla necesita de una renta: lo que contestó el servidor, sin adornos. */
export interface RentaLeida {
  readonly id: string;
  readonly numero: string;
  /** Running, Completed, Compensating, Compensated o CompensationFailed. */
  readonly estado: string;
  /** `null` si el servidor no lo dio: la pantalla no pone precio. */
  readonly total: Importe | null;
  readonly garantia: Importe | null;
  readonly ventana: Ventana | null;
  readonly equipo: string | null;
  readonly cantidad: number | null;
  /** Si queda algo por deshacer: mientras tanto no se afirma que no se cobró. */
  readonly deshaciendo: boolean;
}

export function leerRenta(r: BffAlquiler.AlquilerRentaRespuesta): RentaLeida {
  return {
    id: r.id,
    numero: r.numero,
    estado: r.estado,
    total: r.datos.total,
    garantia: r.datos.garantia,
    ventana: r.datos.ventana,
    equipo: r.datos.equipo,
    cantidad: r.datos.cantidad,
    deshaciendo: r.deshaciendo || r.compensacionesPendientes > 0,
  };
}

function leida(r: ResultadoDelFlujo<BffAlquiler.AlquilerRentaRespuesta>): ResultadoDelFlujo<RentaLeida> {
  return r.ok ? { ...r, valor: leerRenta(r.valor) } : r;
}

/** Las fechas del formulario (`YYYY-MM-DD`) como la ventana del flujo: medianoche UTC de cada día. */
export function ventanaDeLasFechas(desde: string, hasta: string): Ventana {
  return { start: `${desde}T00:00:00Z`, end: `${hasta}T00:00:00Z` };
}

/**
 * Lo que viaja al abrir y al cotizar: el equipo, cuántas unidades y las fechas. NADA más: ni el total ni la
 * garantía —los cotiza el orquestador con la oferta publicada— ni quién alquila, que lo pone la puerta.
 */
export function entradaDeLaRenta(equipo: string, unidades: number, ventana: Ventana): BffAlquiler.AlquilerRentaEntrada {
  return {
    equipo,
    unidades: Array.from({ length: Math.max(0, unidades) }, (_, i) => ({ unidad: i + 1 })),
    ventana,
  };
}

/** El total y la garantía de esas fechas, cotizados por el servidor SIN apartar nada. Sin llave. */
export interface CotizacionDeLaPuerta {
  readonly total: Importe | null;
  readonly garantia: Importe | null;
}

export async function cotizarRenta(
  desde: Element, equipo: string, unidades: number, ventana: Ventana,
): Promise<ResultadoDelFlujo<CotizacionDeLaPuerta>> {
  const r = await cotizarAlquilerRenta(desde, { cuerpo: entradaDeLaRenta(equipo, unidades, ventana) });
  return r.ok ? { ...r, valor: { total: r.valor.datos.total, garantia: r.valor.datos.garantia } } : r;
}

/** Aparta las unidades y autoriza el cobro y la garantía. La llave es la de la intención. */
export async function abrirRenta(
  desde: Element, equipo: string, unidades: number, ventana: Ventana, llave: string,
): Promise<ResultadoDelFlujo<RentaLeida>> {
  return leida(await abrirAlquilerRenta(desde, { cuerpo: entradaDeLaRenta(equipo, unidades, ventana), llave }));
}

export async function consultarRenta(desde: Element, id: string): Promise<ResultadoDelFlujo<RentaLeida>> {
  return leida(await consultarAlquilerRenta(desde, { consulta: { id } }));
}

/** Cobra el alquiler, confirma las unidades y deja la garantía retenida. */
export async function cerrarRenta(desde: Element, id: string): Promise<ResultadoDelFlujo<RentaLeida>> {
  return leida(await cerrarAlquilerRenta(desde, { consulta: { id } }));
}

/** Suelta lo apartado y anula lo autorizado de una renta que todavía no se confirmó. */
export async function cancelarRenta(desde: Element, id: string): Promise<ResultadoDelFlujo<RentaLeida>> {
  return leida(await cancelarAlquilerRenta(desde, { consulta: { id } }));
}

/**
 * Lo que quedó después de cerrar o cancelar: la renta LEÍDA del servidor (con el rechazo de la operación, si
 * lo hubo, para decir por qué), la sesión que falta, o que no se pudo saber.
 */
export type RentaAsentada =
  | { readonly tipo: 'leida'; readonly renta: RentaLeida; readonly rechazo: RechazoDelFlujo | null }
  | { readonly tipo: 'sesion'; readonly rechazo: RechazoDelFlujo }
  | { readonly tipo: 'desconocida'; readonly rechazo: RechazoDelFlujo };

const esDeSesion = (r: RechazoDelFlujo): boolean =>
  r.code === 'puerta.sesion_requerida' || r.code === 'cliente.redirigido';

/**
 * Una escritura sobre una renta que ya existe y, si no contestó con la renta, la CONSULTA: después de un
 * rechazo —el pago, la agenda, un 503, una respuesta ilegible— lo que dice qué quedó es su estado, no el
 * rechazo. Así la pantalla nunca dice «no se cobró» sin saberlo.
 */
export async function escribirYAsentar(
  desde: Element,
  id: string,
  escribir: (desde: Element, id: string) => Promise<ResultadoDelFlujo<RentaLeida>>,
): Promise<RentaAsentada> {
  const r = await escribir(desde, id);
  if (r.ok) return { tipo: 'leida', renta: r.valor, rechazo: null };
  if (esDeSesion(r.rechazo)) return { tipo: 'sesion', rechazo: r.rechazo };
  const consulta = await consultarRenta(desde, id);
  if (consulta.ok) return { tipo: 'leida', renta: consulta.valor, rechazo: r.rechazo };
  if (esDeSesion(consulta.rechazo)) return { tipo: 'sesion', rechazo: consulta.rechazo };
  return { tipo: 'desconocida', rechazo: r.rechazo };
}

// ── La intención, en la sesión del navegador ──────────────────────────────────────────────────────

/**
 * Lo que se pidió desde esta pestaña y todavía no se resolvió: el equipo, las unidades, las fechas, la llave
 * y —antes de salir a la red— por qué CAMINO se pidió. Sobrevive a la recarga y a la vuelta del login. `id` es
 * `null` mientras abrir no contestó (reintentar con la misma llave lo devuelve).
 */
export interface IntencionGuardada {
  readonly camino: CaminoDeLaRenta;
  readonly equipo: string;
  readonly unidades: number;
  readonly desde: string;
  readonly hasta: string;
  readonly llave: string;
  readonly id: string | null;
}

const PREFIJO = 'synergos:alquiler';

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
    // Sin almacenamiento la renta sigue: sólo no sobrevive a la recarga.
  }
}

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** La intención del equipo, o `null`. Lo que no tiene su forma —o un camino que no es de los dos— se ignora. */
export function leerIntencion(equipo: string): IntencionGuardada | null {
  const v = leerJson(`${PREFIJO}:intencion:${equipo}`) as Partial<IntencionGuardada> | null;
  if (!v || v.equipo !== equipo || !esTexto(v.llave) || !esTexto(v.desde) || !esTexto(v.hasta)) return null;
  if (v.camino !== 'puerta' && v.camino !== 'directa') return null;
  if (typeof v.unidades !== 'number' || !Number.isInteger(v.unidades) || v.unidades < 1) return null;
  return {
    camino: v.camino, equipo, unidades: v.unidades, desde: v.desde, hasta: v.hasta, llave: v.llave,
    id: esTexto(v.id) ? v.id : null,
  };
}

export function guardarIntencion(intencion: IntencionGuardada): void {
  escribirJson(`${PREFIJO}:intencion:${intencion.equipo}`, intencion);
}

export function olvidarIntencion(equipo: string): void {
  escribirJson(`${PREFIJO}:intencion:${equipo}`, null);
}

/** Cuántas intenciones se recuerdan por equipo: las de una sesión de navegación, no un historial. */
const INTENCIONES = 20;

/**
 * La llave de abrir para ESTA intención —este equipo, estas unidades, estas fechas—: la misma al reintentar,
 * otra si cambia algo. Aleatoria y guardada, no derivada: dos personas que piden lo mismo no comparten llave.
 */
export function llaveDeLaIntencion(equipo: string, unidades: number, desde: string, hasta: string): string {
  const clave = `${PREFIJO}:intenciones:${equipo}`;
  const crudo = leerJson(clave);
  const vistas: Array<[string, string]> = Array.isArray(crudo)
    ? crudo.filter((par): par is [string, string] => Array.isArray(par) && esTexto(par[0]) && esTexto(par[1]))
    : [];
  const pedido = `${unidades}|${desde}|${hasta}`;
  const vista = vistas.find(([p]) => p === pedido);
  if (vista) return vista[1];
  const llave = idAleatorio();
  escribirJson(clave, [...vistas, [pedido, llave]].slice(-INTENCIONES));
  return llave;
}
