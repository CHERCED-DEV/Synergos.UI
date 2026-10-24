import { relojEnZona, zonaValida } from '@synergos/vitals-core';

/**
 * Las fechas de «Mis compras» en es-CO y en la hora del SITIO (004-tienda-compra, etapa 3).
 *
 * El pedido (`date`) y cada etapa del seguimiento llegan como instantes ISO-8601 y se pintaban tal cual:
 * `2026-10-22T19:03:11.123+00:00`. El día y la hora de reloj los pone el núcleo (`relojEnZona`, la hora del
 * sitio de `vitals/core`) en la zona que declara el CMS (`zonaHoraria`, la de los listados); aquí sólo se nombra
 * el mes. Sin una zona válida, la de quien mira: nunca el ISO crudo.
 */
const DIA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** La zona en que se lee: la del sitio, o la del navegador si el CMS no la dio. */
function zonaDeLectura(zona: string): string {
  return zonaValida(zona) ? zona : Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** «22 de octubre de 2026», el día que marca el sitio en ese instante. Lo que no es un instante se deja como llegó. */
export function diaDeLaTienda(instante: string, zona: string): string {
  const reloj = relojEnZona(instante, zonaDeLectura(zona));
  if (!reloj) {
    return instante;
  }
  const [y, m, d] = reloj.fecha.split('-').map(Number);
  return DIA.format(Date.UTC(y, m - 1, d));
}

/** «22 de octubre de 2026, 14:05»: el día y la hora de reloj del sitio. */
export function momentoDeLaTienda(instante: string, zona: string): string {
  const reloj = relojEnZona(instante, zonaDeLectura(zona));
  return reloj ? `${diaDeLaTienda(instante, zona)}, ${reloj.hora}` : instante;
}
