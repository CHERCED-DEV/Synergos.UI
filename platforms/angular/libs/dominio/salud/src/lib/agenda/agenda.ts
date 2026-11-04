import { Injectable, computed, inject, signal } from '@angular/core';
import { relojEnZona } from '@synergos/vitals-core';
import { franjasDelProfesional, instanteIso } from '../cita/cita-api.client';
import type { FranjaDeLaAgenda } from '../cita/cita.model';
import { TEXTOS_DE_SALUD } from '../comun/textos';

/** Cuántos días de la agenda del profesional ofrece el asistente, desde ahora (T046). */
export const DIAS_DE_LA_AGENDA = 8;

/** Una hora libre de la agenda como la ofrece el asistente: el día y la hora del SITIO, y cuántos minutos dura. */
export interface FranjaDelAsistente {
  readonly date: string;
  readonly time: string;
  readonly minutos: number;
}

/**
 * Las franjas que ofrece el asistente: las que tienen cupo y no empezaron, en el día y la hora del sitio, en orden. Sin
 * una zona válida no hay ninguna: no se ofrece una hora adivinada.
 */
export function franjasDelAsistente(
  franjas: readonly FranjaDeLaAgenda[],
  zona: string,
  ahora: number,
): readonly FranjaDelAsistente[] {
  const ofrecidas: FranjaDelAsistente[] = [];
  for (const f of [...franjas].sort((a, b) => Date.parse(a.ventana.start) - Date.parse(b.ventana.start))) {
    const inicio = Date.parse(f.ventana.start);
    const minutos = Math.round((Date.parse(f.ventana.end) - inicio) / 60_000);
    const reloj = f.libres > 0 && inicio > ahora && minutos > 0 ? relojEnZona(f.ventana.start, zona) : null;
    if (reloj) {
      ofrecidas.push({ date: reloj.fecha, time: reloj.hora, minutos });
    }
  }
  return ofrecidas;
}

/**
 * Las horas libres de la agenda del profesional elegido (I1 de producción, T046), con la receta de la tienda (T051): la
 * fachada las lee por la puerta y la vista de las franjas las pinta. Una por elemento; sus textos los provee la app.
 */
@Injectable()
export class AgendaDeSalud {
  readonly #textos = inject(TEXTOS_DE_SALUD);
  /**
   * En la hora del sitio y con su duración. `null` mientras se leen; vacía si no hay ninguna libre en los próximos días
   * o si la agenda no se pudo leer (`rechazo` dice cuál).
   */
  readonly franjas = signal<readonly FranjaDelAsistente[] | null>(null);
  /** El `code` con que la agenda del profesional no se pudo leer, o `null`. */
  readonly rechazo = signal<string | null>(null);
  #ultima = '';

  /** Lo que se dice de la agenda: el rechazo por su `code`, o que no hay horas libres. `null` mientras se lee o si hay. */
  readonly aviso = computed<string | null>(() => {
    const rechazo = this.rechazo();
    if (rechazo) {
      return this.#textos.mensajeDeLaCita(rechazo);
    }
    const franjas = this.franjas();
    return franjas !== null && franjas.length === 0 ? this.#textos.sinHorasLibres : null;
  });

  /**
   * Lee las franjas libres del profesional en los próximos días. Lo que contesta la agenda de otro profesional elegido
   * antes se descarta, y un rechazo no se queda: volver a elegirlo la lee otra vez.
   */
  async leer(desde: Element, profesional: string, zona: string): Promise<void> {
    if (profesional === this.#ultima) {
      return;
    }
    this.#ultima = profesional;
    this.franjas.set(null);
    this.rechazo.set(null);
    const ahora = Math.floor(Date.now() / 60_000) * 60_000;
    const rango = { start: instanteIso(ahora), end: instanteIso(ahora + DIAS_DE_LA_AGENDA * 86_400_000) };
    const r = await franjasDelProfesional(desde, profesional, rango);
    if (profesional !== this.#ultima) {
      return;
    }
    if (!r.ok) {
      this.rechazo.set(r.rechazo.code);
      this.franjas.set([]);
      this.#ultima = '';
      return;
    }
    this.franjas.set(franjasDelAsistente(r.valor, zona, ahora));
  }

  /** Cuántos minutos dura la franja de ese día y esa hora en la agenda leída, o `null` si no está en ella. */
  minutosDe(fecha: string, hora: string): number | null {
    return this.franjas()?.find((f) => f.date === fecha && f.time === hora)?.minutos ?? null;
  }
}
