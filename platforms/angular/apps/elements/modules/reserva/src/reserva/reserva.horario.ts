import type { ServicioReservable } from '@synergos/contracts';
import { fechaEnZona, instanteEnZona } from '@synergos/vitals-core';

/**
 * El horario de un servicio reservable, en la ZONA DEL SITIO (011-booking-reserva).
 *
 * <p>La agenda valida el horario en la zona del recurso, que es la del sitio (la oferta se publica
 * con ella). Si la franja se armara con la hora del navegador, quien mira desde otro huso pediría
 * otra hora de la que eligió: por eso cada fecha y cada hora de la pantalla se leen y se escriben
 * en `zona`, y lo que viaja es el instante en UTC. La aritmética de la zona es la de `vitals/core`
 * (`formato/hora-del-sitio.ts`, núcleo T087): aquí sólo vive lo del horario de un servicio.</p>
 *
 * <p><b>Lo libre lo dice la agenda</b>, con la lectura de disponibilidad (NB-2/NB-3): estas funciones
 * sólo leen sus franjas en la zona del sitio. Sin esa lectura —la puerta no la tiene, o no contesta—
 * ninguna hora se marca como libre: las que se ofrecen son las que CABEN en el horario publicado
 * —desde que abre, de una duración en una duración, hasta la última que termina antes de cerrar— y
 * no las que ya pasaron. Si una está tomada, lo dice la agenda al apartar.</p>
 *
 * Funciones puras: el instante «ahora» lo pasa quien llama, así que los specs no dependen del reloj.
 */

/** Un intervalo de la franja, en ISO-8601 UTC, como lo lee el flujo (`ventana`). */
export interface Ventana {
  readonly start: string;
  readonly end: string;
}

/** Un día que se puede elegir: la fecha de calendario del sitio y cómo se lee. */
export interface DiaAbierto {
  readonly fecha: string;
  readonly etiqueta: string;
}

/**
 * `DayOfWeek` de .NET —como lo escribe el CMS— por su índice de `Date.getUTCDay()`. Son los nombres
 * en inglés de `Intl`, que son exactamente ésos: el 7 de enero de 2024 fue domingo.
 */
const DIAS_DE_LA_SEMANA: readonly string[] = Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(2024, 0, 7 + i)),
);

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `HH:mm` → minutos desde la medianoche, o `null` si no es una hora. */
export function minutosDe(hora: string): number | null {
  const m = HORA.exec(hora);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function horaDe(minutos: number): string {
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
}

function sumarDias(fecha: string, dias: number): string {
  const f = FECHA.exec(fecha);
  if (!f) return fecha;
  return new Date(Date.UTC(Number(f[1]), Number(f[2]) - 1, Number(f[3]) + dias)).toISOString().slice(0, 10);
}

function diaDeLaSemana(fecha: string): string {
  return DIAS_DE_LA_SEMANA[new Date(`${fecha}T12:00:00Z`).getUTCDay()] ?? '';
}

/**
 * Las horas de inicio de `fecha` que caben en el horario del servicio y todavía no pasaron
 * (`ahora`). Vacío si ese día no abre.
 */
export function horasDelDia(servicio: ServicioReservable, fecha: string, zona: string, ahora: number): string[] {
  const abre = minutosDe(servicio.abre);
  const cierra = minutosDe(servicio.cierra);
  const duracion = servicio.duracionMinutos;
  if (abre === null || cierra === null || !(duracion > 0) || !servicio.dias.includes(diaDeLaSemana(fecha))) {
    return [];
  }
  const horas: string[] = [];
  for (let m = abre; m + duracion <= cierra; m += duracion) {
    const hora = horaDe(m);
    if (instanteEnZona(fecha, hora, zona) > ahora) horas.push(hora);
  }
  return horas;
}

/**
 * Los próximos `cuantos` días de calendario del sitio, desde hoy, en los que el servicio abre y
 * queda al menos una hora por delante.
 */
export function diasAbiertos(
  servicio: ServicioReservable,
  zona: string,
  ahora: number,
  locale: string,
  cuantos = 14,
): DiaAbierto[] {
  const hoy = fechaEnZona(ahora, zona);
  const etiqueta = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  const dias: DiaAbierto[] = [];
  for (let i = 0; i < cuantos; i++) {
    const fecha = sumarDias(hoy, i);
    if (horasDelDia(servicio, fecha, zona, ahora).length > 0) {
      dias.push({ fecha, etiqueta: etiqueta.format(new Date(`${fecha}T12:00:00Z`)) });
    }
  }
  return dias;
}

const sinMilisegundos = (instante: number): string => new Date(instante).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** El día de calendario `fecha` en `zona`, de su medianoche a la siguiente: el rango de la lectura de franjas. */
export function rangoDelDia(fecha: string, zona: string): Ventana | null {
  const desde = instanteEnZona(fecha, '00:00', zona);
  const hasta = instanteEnZona(sumarDias(fecha, 1), '00:00', zona);
  return Number.isFinite(desde) && Number.isFinite(hasta) ? { start: sinMilisegundos(desde), end: sinMilisegundos(hasta) } : null;
}

/** La franja de `fecha` a `hora` en `zona`, del largo del servicio: lo que viaja como `ventana`. */
export function ventanaDe(servicio: ServicioReservable, fecha: string, hora: string, zona: string): Ventana | null {
  const inicio = instanteEnZona(fecha, hora, zona);
  if (!Number.isFinite(inicio) || !(servicio.duracionMinutos > 0)) return null;
  return { start: sinMilisegundos(inicio), end: sinMilisegundos(inicio + servicio.duracionMinutos * 60_000) };
}

/** Cómo se lee una franja que contestó el servidor: el día y las dos horas, en la zona del sitio. */
export function franjaLegible(ventana: Ventana, zona: string, locale: string): string {
  const inicio = Date.parse(ventana.start);
  const fin = Date.parse(ventana.end);
  if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return '';
  const dia = new Intl.DateTimeFormat(locale, { timeZone: zona, weekday: 'long', day: 'numeric', month: 'long' });
  const hora = new Intl.DateTimeFormat(locale, { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${dia.format(inicio)} · ${hora.format(inicio)}–${hora.format(fin)}`;
}

/** Si `valor` es un día de la semana como lo escribe el CMS (`DayOfWeek`). */
export function esDiaDeLaSemana(valor: unknown): valor is string {
  return typeof valor === 'string' && DIAS_DE_LA_SEMANA.includes(valor);
}
