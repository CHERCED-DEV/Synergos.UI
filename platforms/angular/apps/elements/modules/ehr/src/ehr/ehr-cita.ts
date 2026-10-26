import type { BffSalud } from '@synergos/contracts';
import {
  abrirSaludCita,
  cancelarSaludCita,
  cerrarSaludCita,
  consultarSaludCita,
  cotizarSaludCita,
  listarSaludCita,
  instanteEnZona,
  zonaValida,
  type RechazoDelFlujo,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';

/**
 * La cita por la puerta (003-salud-cita, ADR 0140), tipada con el contrato GENERADO de `Synergos.Bff.Salud`.
 *
 * <p>Habla SÓLO con el coordinador (`<synergos-flujo flujo="salud.cita">`) que la vista coloca alrededor del
 * elemento: ninguna ruta propia, ningún `fetch`. El transporte sale del envoltorio GENERADO del flujo
 * (`generados/salud.cita.ts`, núcleo N3), así que un renombre en el orquestador rompe la compilación de este
 * fichero.</p>
 *
 * <p>El profesional viaja como REFERENCIA con la clase que declara la definición (NR-1): el contrato la tipa
 * como literal, y el host rechaza otra con `salud.entrada_invalida`. El navegador sólo aporta su id.</p>
 */

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

export function leerCita(r: BffSalud.SaludCitaRespuesta): CitaLeida {
  return {
    id: r.id,
    numero: r.numero,
    estado: r.estado,
    profesionalId: r.datos.profesional?.id ?? '',
    ventana: r.datos.ventana,
    total: r.datos.total,
    deshaciendo: r.deshaciendo || r.compensacionesPendientes > 0,
  };
}

function leida(r: ResultadoDelFlujo<BffSalud.SaludCitaRespuesta>): ResultadoDelFlujo<CitaLeida> {
  return r.ok ? { ...r, valor: leerCita(r.valor) } : r;
}

/** Lo que viaja al cotizar y al abrir: el profesional con su clase y la franja. */
export function entradaDeLaCita(profesionalId: string, ventana: Ventana): BffSalud.SaludCitaEntrada {
  return { profesional: { kind: 'salud.profesional', id: profesionalId }, ventana };
}

/**
 * El copago SIN apartar nada: el orquestador corre la fase que abre hasta antes de la agenda (el permiso, el
 * copago y la agenda del profesional) y no guarda nada. Sin llave. `null` si el servidor no da total.
 */
export async function cotizarCita(desde: Element, profesionalId: string, ventana: Ventana): Promise<ResultadoDelFlujo<Importe | null>> {
  const r = await cotizarSaludCita(desde, { cuerpo: entradaDeLaCita(profesionalId, ventana) });
  return r.ok ? { ...r, valor: r.valor.datos.total } : r;
}

/** Aparta la franja y autoriza el copago, sin mover plata. La llave es la de la intención. */
export async function abrirCita(desde: Element, profesionalId: string, ventana: Ventana, llave: string): Promise<ResultadoDelFlujo<CitaLeida>> {
  return leida(await abrirSaludCita(desde, { cuerpo: entradaDeLaCita(profesionalId, ventana), llave }));
}

/** Captura el copago y confirma la franja. Idempotente sobre una cita ya completada. */
export async function cerrarCita(desde: Element, id: string): Promise<ResultadoDelFlujo<CitaLeida>> {
  return leida(await cerrarSaludCita(desde, { consulta: { id } }));
}

/** Suelta la franja y anula la autorización de una cita que no se confirmó. */
export async function cancelarCita(desde: Element, id: string): Promise<ResultadoDelFlujo<CitaLeida>> {
  return leida(await cancelarSaludCita(desde, { consulta: { id } }));
}

export async function consultarCita(desde: Element, id: string): Promise<ResultadoDelFlujo<CitaLeida>> {
  return leida(await consultarSaludCita(desde, { consulta: { id } }));
}

/** Las citas del paciente de la sesión, tal como las da `listar` (T034): «Mis citas» por la puerta. */
export async function listarCitas(desde: Element): Promise<ResultadoDelFlujo<readonly CitaLeida[]>> {
  const r = await listarSaludCita(desde, { consulta: { limit: 50 } });
  return r.ok ? { ...r, valor: r.valor.items.map(leerCita) } : r;
}

const esDeSesion = (r: RechazoDelFlujo): boolean => r.code === 'puerta.sesion_requerida' || r.code === 'cliente.redirigido';

/** Lo que quedó tras una escritura sobre una cita que ya existe. */
export type CitaAsentada =
  | { readonly tipo: 'leida'; readonly cita: CitaLeida; readonly rechazo: RechazoDelFlujo | null }
  | { readonly tipo: 'sesion'; readonly rechazo: RechazoDelFlujo }
  | { readonly tipo: 'desconocida'; readonly rechazo: RechazoDelFlujo };

/**
 * Una escritura sobre una cita y, si no contestó con la cita, la CONSULTA: después de un rechazo —el pago, la
 * agenda, un 503, una respuesta ilegible— lo que dice qué quedó es su estado, no el rechazo. Así la pantalla
 * nunca dice «no se te cobró nada» sin saberlo.
 */
export async function escribirYAsentar(
  desde: Element,
  id: string,
  escribir: (desde: Element, id: string) => Promise<ResultadoDelFlujo<CitaLeida>>,
): Promise<CitaAsentada> {
  const r = await escribir(desde, id);
  if (r.ok) return { tipo: 'leida', cita: r.valor, rechazo: null };
  if (esDeSesion(r.rechazo)) return { tipo: 'sesion', rechazo: r.rechazo };
  const consulta = await consultarCita(desde, id);
  if (consulta.ok) return { tipo: 'leida', cita: consulta.valor, rechazo: r.rechazo };
  if (esDeSesion(consulta.rechazo)) return { tipo: 'sesion', rechazo: consulta.rechazo };
  return { tipo: 'desconocida', rechazo: r.rechazo };
}

// ── La hora del sitio ───────────────────────────────────────────────────────────────────────────────
//
// La aritmética es la de `vitals/core` (`formato/hora-del-sitio.ts`, NN-21). Aquí sólo queda lo de la cita: la
// franja con su duración.

export { relojEnZona, zonaValida } from '@synergos/vitals-core';

const iso = (instante: number): string => new Date(instante).toISOString().replace('.000Z', 'Z');

/**
 * La franja que eligió el paciente —el día y la hora del SITIO— como la lee el host, con su duración. `null`
 * sin una zona válida o con una fecha u hora que no lo son: no se manda una franja adivinada.
 */
export function ventanaDeLaCita(fecha: string, hora: string, minutos: number, zona: string | null | undefined): Ventana | null {
  if (!zonaValida(zona)) return null;
  const inicio = instanteEnZona(fecha, hora, zona);
  if (!Number.isFinite(inicio) || !(minutos > 0)) return null;
  return { start: iso(inicio), end: iso(inicio + minutos * 60_000) };
}
