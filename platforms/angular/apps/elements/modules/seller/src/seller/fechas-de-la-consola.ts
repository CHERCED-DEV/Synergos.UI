import { relojEnZona, zonaValida } from '@synergos/vitals-core';

/**
 * Las fechas de la consola en es-CO y en la hora del SITIO (013-seller-operaciones, T012; el molde de
 * `fechas-de-la-tienda` de 004).
 *
 * El pedido llega como un instante ISO-8601. El día y la hora de reloj los pone el núcleo (`relojEnZona`, la hora del
 * sitio de `vitals/core`) en la zona que declara el CMS (`zonaHoraria`, la de los listados); aquí sólo se nombra el mes.
 * Sin una zona válida, la de quien mira: nunca el ISO crudo. Cada elemento es una app (ADR 0113): esto no se importa del
 * storefront.
 */
const DIA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** La zona en que se lee: la del sitio, o la del navegador si el CMS no la dio. */
function zonaDeLectura(zona: string): string {
  return zonaValida(zona) ? zona : Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** El día y la hora de reloj del sitio en ese instante. Lo que no es un instante se deja como llegó. */
export function momentoDeLaConsola(instante: string, zona: string): string {
  const reloj = relojEnZona(instante, zonaDeLectura(zona));
  if (!reloj) {
    return instante;
  }
  const [y, m, d] = reloj.fecha.split('-').map(Number);
  return `${DIA.format(Date.UTC(y, m - 1, d))}, ${reloj.hora}`;
}
