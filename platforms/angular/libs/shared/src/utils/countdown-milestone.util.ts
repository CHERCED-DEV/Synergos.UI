/** Un hito de una cuenta atrás: al quedar `atSeconds` o menos, se dice `message`. */
export interface CountdownMilestone {
  readonly atSeconds: number;
  readonly message: string;
}

/**
 * El hito que una cuenta atrás YA cruzó: el mensaje del umbral más chico que el tiempo restante
 * alcanzó, o `''` si todavía no cruzó ninguno (#82).
 *
 * Existe para que un reloj NO hable cada segundo. El valor que devuelve es el mismo durante toda
 * una franja —de 3.600 a 601 s dice lo mismo—, así que una señal `computed` sobre él sólo cambia
 * al cruzar un umbral, y quien lo anuncia (`syn-live-region`) sólo habla entonces. Lo usan los dos
 * relojes de evento y el apartado de `syn-cart-shell`: tres cuentas atrás que anunciaban el tic.
 *
 * `remainingSeconds` `null` = no hay cuenta que llevar.
 */
export function countdownMilestone(
  remainingSeconds: number | null,
  milestones: readonly CountdownMilestone[],
): string {
  if (remainingSeconds === null || !Number.isFinite(remainingSeconds)) {
    return '';
  }
  let umbral = Number.POSITIVE_INFINITY;
  let mensaje = '';
  for (const hito of milestones) {
    if (remainingSeconds <= hito.atSeconds && hito.atSeconds < umbral) {
      umbral = hito.atSeconds;
      mensaje = hito.message;
    }
  }
  return mensaje;
}
