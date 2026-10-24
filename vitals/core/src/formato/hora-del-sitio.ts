/**
 * La hora del SITIO — la aritmética que una franja necesita, UNA sola vez en todo el árbol (núcleo, NN-21 de 003).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE. Por la puerta una franja viaja como INSTANTE, y lo que se elige —«el martes a las 10:00»— es la
 * hora del sitio (`Synergos:Listados:ZonaHoraria`), no la del navegador: quien mira desde otro huso pediría otra
 * hora de la que eligió. La reserva (011, `reserva/reserva.horario.ts`) y la cita (003, `ehr/ehr-cita.ts`) la
 * escribieron cada una; un elemento publicado es una app y no se importa de otro (ADR 0113), así que vive aquí.
 *
 * A diferencia de `diaLocal` (el calendario de quien mira), esto lee y escribe en una zona IANA DADA, con `Intl`:
 * es agnóstica como el formato de importes. Funciones puras: ninguna lee el reloj.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

const dosCifras = (n: number): string => String(n).padStart(2, '0');

/** Si `zona` es una zona IANA que el navegador conoce. Sin ella no se arma ninguna franja. */
export function zonaValida(zona: string | null | undefined): zona is string {
  if (!zona) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

interface Partes {
  readonly y: number;
  readonly m: number;
  readonly d: number;
  readonly h: number;
  readonly mi: number;
  readonly s: number;
}

function partesEnZona(instante: number, zona: string): Partes {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instante));
  const valor = (tipo: Intl.DateTimeFormatPartTypes): number => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  // `% 24`: hay motores que escriben la medianoche como «24» aun con h23.
  return { y: valor('year'), m: valor('month'), d: valor('day'), h: valor('hour') % 24, mi: valor('minute'), s: valor('second') };
}

/** Cuánto adelanta `zona` al UTC en ese instante (negativo al oeste de Greenwich). */
function desfaseMs(instante: number, zona: string): number {
  const p = partesEnZona(instante, zona);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(instante / 1000) * 1000;
}

/**
 * El instante (ms desde la época, UTC) de una fecha (`YYYY-MM-DD`) y una hora (`HH:mm`) DE RELOJ en `zona`.
 * `NaN` si la fecha o la hora no lo son.
 */
export function instanteEnZona(fecha: string, hora: string, zona: string): number {
  const f = FECHA.exec(fecha);
  const h = HORA.exec(hora);
  if (!f || !h) return Number.NaN;
  const reloj = Date.UTC(Number(f[1]), Number(f[2]) - 1, Number(f[3]), Number(h[1]), Number(h[2]));
  const primero = reloj - desfaseMs(reloj, zona);
  // El desfase del instante de reloj puede no ser el del instante buscado si en medio hay un cambio de hora: se
  // corrige con el del resultado.
  const segundo = reloj - desfaseMs(primero, zona);
  return segundo === primero ? primero : segundo;
}

/**
 * La lectura de vuelta: el día (`YYYY-MM-DD`) y la hora (`HH:mm`) DE RELOJ que marca `zona` en ese instante —ms
 * desde la época o ISO-8601—. `null` sin una zona válida o con algo que no es un instante.
 */
export function relojEnZona(instante: number | string, zona: string | null | undefined): { readonly fecha: string; readonly hora: string } | null {
  const ms = typeof instante === 'number' ? instante : Date.parse(instante);
  if (!Number.isFinite(ms) || !zonaValida(zona)) return null;
  const p = partesEnZona(ms, zona);
  return { fecha: `${p.y}-${dosCifras(p.m)}-${dosCifras(p.d)}`, hora: `${dosCifras(p.h)}:${dosCifras(p.mi)}` };
}

/** El día de calendario (`YYYY-MM-DD`) que marca `zona` en ese instante, o `''`. */
export function fechaEnZona(instante: number | string, zona: string): string {
  return relojEnZona(instante, zona)?.fecha ?? '';
}

/** La hora de reloj (`HH:mm`) que marca `zona` en ese instante, o `''`. */
export function horaEnZona(instante: number | string, zona: string): string {
  return relojEnZona(instante, zona)?.hora ?? '';
}
