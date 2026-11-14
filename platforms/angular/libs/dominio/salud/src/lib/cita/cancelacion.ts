import { Injectable, inject, signal } from '@angular/core';
import type { BffSalud } from '@synergos/contracts';
import { abrirSaludCancelacion, listarSaludCancelacion, type ResultadoDelFlujo } from '@synergos/vitals-core';
import { TEXTOS_DE_SALUD } from '../comun/textos';
import type { Importe } from './cita.model';

/**
 * Cancelar una cita YA confirmada (003-salud-cita, I6, la ficha F4) por la puerta: el flujo posterior `salud.cancelacion`,
 * con el coordinador que la vista coloca alrededor del elemento. El orquestador lee de la cita su reserva y su cobro —sólo si
 * es del paciente de la sesión y está confirmada—, la cancela en la agenda y devuelve el copago según la política del sitio.
 */

/** La política de devolución del sitio, como la declara el CMS: la misma que la puerta manda al orquestador. */
export interface PoliticaDeDevolucion {
  /** Desde cuántas horas antes del inicio se devuelve el copago entero. */
  readonly totalHoras: number;
  /** Desde cuántas horas antes se devuelve una parte; con menos, nada. */
  readonly parcialHoras: number;
  /** Qué porcentaje del copago es esa parte. */
  readonly porcentaje: number;
}

/** En qué tramo de la política cae cancelar ahora. */
export type TramoDeDevolucion = 'total' | 'parcial' | 'nada' | 'empezo';

/** Lo que se devolvería si se cancela ahora: el tramo y cuánto (`null` si nada). */
export interface DevolucionPrevista {
  readonly tramo: TramoDeDevolucion;
  readonly monto: Importe | null;
}

/** Una cancelación como la contestó el servidor. */
export interface CancelacionLeida {
  readonly id: string;
  readonly citaId: string;
  readonly estado: string;
  /** Lo que se devolvió; `null` si nada. */
  readonly devuelto: Importe | null;
}

const HORA = 3_600_000;

/**
 * Lo que se devolvería de `copago` si se cancela en `ahora` una cita que empieza en `inicio`: la MISMA regla que el
 * orquestador (`PoliticaDeDevolucion.Devolucion`), para decirlo antes de cancelar. Redondea hacia abajo, al centavo. Lo que
 * se devuelve de verdad lo dice el servidor al cancelar.
 */
export function devolucionPrevista(
  copago: Importe | null,
  inicio: string,
  ahora: number,
  politica: PoliticaDeDevolucion,
): DevolucionPrevista {
  const antelacion = Date.parse(inicio) - ahora;
  if (!(antelacion > 0)) return { tramo: 'empezo', monto: null };
  const base = copago?.amount ?? 0;
  const [tramo, parte]: [TramoDeDevolucion, number] =
    antelacion >= politica.totalHoras * HORA
      ? ['total', base]
      : antelacion >= politica.parcialHoras * HORA
        ? ['parcial', Math.floor(base * politica.porcentaje) / 100]
        : ['nada', 0];
  if (!copago || base <= 0) return { tramo, monto: null };
  return parte > 0 ? { tramo, monto: { amount: parte, currency: copago.currency } } : { tramo: 'nada', monto: null };
}

export function leerCancelacion(r: BffSalud.SaludCancelacionRespuesta): CancelacionLeida {
  return { id: r.id, citaId: r.datos.cita ?? '', estado: r.estado, devuelto: r.datos.aDevolver };
}

/**
 * La llave de la intención: una por cita. La puerta la ata al paciente, así que dos personas no chocan; repetirla devuelve
 * la MISMA cancelación (una devolución caída se reintenta sin devolver dos veces) y otra cancelación de la misma cita la
 * rechaza la agenda.
 */
export const llaveDeLaCancelacion = (citaId: string): string => `cancelacion:${citaId}`;

/** Cancela la cita confirmada `citaId`, en una llamada. */
export async function cancelarCitaConfirmada(desde: Element, citaId: string): Promise<ResultadoDelFlujo<CancelacionLeida>> {
  const r = await abrirSaludCancelacion(desde, { cuerpo: { cita: citaId }, llave: llaveDeLaCancelacion(citaId) });
  return r.ok ? { ...r, valor: leerCancelacion(r.valor) } : r;
}

/**
 * Las cancelaciones completadas del paciente de la sesión, por la cita que cancela cada una. Sin el coordinador de la
 * cancelación la vista no la ofrece, así que desde este sitio no se canceló ninguna: la lista vacía es la verdad.
 */
export async function misCancelaciones(desde: Element): Promise<ResultadoDelFlujo<ReadonlyMap<string, CancelacionLeida>>> {
  const r = await listarSaludCancelacion(desde, { consulta: { limit: 50 } });
  if (!r.ok) {
    return r.rechazo.code === 'cliente.sin_coordinador' ? { ok: true, valor: new Map(), estado: 200, correlacion: r.correlacion } : r;
  }
  const porCita = new Map<string, CancelacionLeida>();
  for (const c of r.valor.items.map(leerCancelacion)) {
    if (c.estado === 'Completed' && c.citaId) porCita.set(c.citaId, c);
  }
  return { ...r, valor: porCita };
}

/** Lo que quedó de cancelar una cita: de cuál y qué se le dice al paciente. */
export interface AvisoDeLaCancelacion {
  readonly citaId: string;
  readonly texto: string;
}

/**
 * «Cancelar cita» sobre una cita confirmada, en «Mis citas» (I6). Guarda las cancelaciones del paciente por cita, cuál se
 * está cancelando y lo que se dice; el texto lo da la app (`TEXTOS_DE_SALUD.cancelacion`).
 */
@Injectable()
export class CancelacionesDeCitas {
  readonly #textos = inject(TEXTOS_DE_SALUD);

  readonly #canceladas = signal<ReadonlyMap<string, CancelacionLeida>>(new Map());
  readonly canceladas = this.#canceladas.asReadonly();
  /** La cita que se está cancelando, o `null`. */
  readonly moviendo = signal<string | null>(null);
  readonly aviso = signal<AvisoDeLaCancelacion | null>(null);

  cancelacionDe(citaId: string): CancelacionLeida | null {
    return this.#canceladas().get(citaId) ?? null;
  }

  /** Lee las cancelaciones; `false` si no se pudieron leer (no es lo mismo que no tener ninguna). */
  async cargar(desde: Element): Promise<boolean> {
    const r = await misCancelaciones(desde);
    if (!r.ok) return false;
    this.#canceladas.set(r.valor);
    return true;
  }

  /** Cancela la cita confirmada; `true` si quedó cancelada. */
  async cancelar(desde: Element, citaId: string): Promise<boolean> {
    if (this.moviendo()) return false;
    this.moviendo.set(citaId);
    this.aviso.set(null);
    try {
      const r = await cancelarCitaConfirmada(desde, citaId);
      if (!r.ok) {
        this.aviso.set({ citaId, texto: this.#textos.cancelacion.mensaje(r.rechazo.code) });
        return false;
      }
      const cancelada = r.valor;
      this.#canceladas.update((antes) => new Map(antes).set(citaId, cancelada));
      this.aviso.set({ citaId, texto: this.#textos.cancelacion.cancelada(cancelada.devuelto) });
      return true;
    } finally {
      this.moviendo.set(null);
    }
  }
}
