/**
 * El día de calendario LOCAL — UNA sola vez en todo el árbol.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE. «Hoy» se calculaba con `new Date().toISOString().slice(0, 10)`, que es el día
 * en UTC: desde las 19:00 de Bogotá (UTC−5) ya es MAÑANA. La agenda clínica de `ehr` pedía
 * `GET /schedule?date=` del día siguiente cada noche, y las franjas de `ehr` y de `realty` salían
 * corridas un día —el backend lee `{ date, time }` como hora LOCAL del sitio—: quien elegía
 * «mañana a las 10» reservaba pasado mañana.
 *
 * El día se arma con los componentes LOCALES de la fecha (`getFullYear`/`getMonth`/`getDate`),
 * que son los del navegador de quien mira: lo que ve en su calendario. Es agnóstica (sólo
 * `Date`), así que vive en `vitals` como el formato de importes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const dosCifras = (n: number): string => String(n).padStart(2, '0');

/** El día LOCAL de `fecha` como `AAAA-MM-DD` (el de su calendario, no el de UTC). */
export function diaLocal(fecha: Date = new Date()): string {
  return `${fecha.getFullYear()}-${dosCifras(fecha.getMonth() + 1)}-${dosCifras(fecha.getDate())}`;
}

/**
 * El día LOCAL que cae `dias` días después de `desde` (antes, si es negativo). Suma días de
 * CALENDARIO: un cambio de hora en medio no corre el resultado.
 */
export function diaLocalMas(dias: number, desde: Date = new Date()): string {
  const fecha = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + dias);
  return diaLocal(fecha);
}
