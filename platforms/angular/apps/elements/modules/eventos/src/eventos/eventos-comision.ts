/**
 * La comisión de servicio de Eventos en unidades menores (ADR 0137 · CMS#194):
 * `subtotal × porcentaje / 100`, con el redondeo de la casa —al par— y en aritmética ENTERA.
 *
 * Es la MISMA regla con la que cobran el motor en proceso del CMS y el orquestador: lo que el
 * carrito muestra es lo que se cobra. Las tres implementaciones corren los vectores de oro de
 * `Synergos.CMS.Web/docs/contracts/service-fee-vectors.json` (acá, `tools/vectores-comision.mjs`).
 * `Math.round` redondea la mitad hacia arriba y se separaba justo en el medio centavo.
 *
 * El porcentaje llega con dos decimales como mucho —el CMS no arranca con más—, así que se
 * escala a centésimas y la cuenta es exacta: `subtotal × centésimas / 10000`.
 *
 * @param subtotalMinor el subtotal de las entradas, en unidades menores.
 * @param porcentaje la comisión configurada para el sitio, de 0 a 100.
 */
export function comisionEnMenores(subtotalMinor: number, porcentaje: number): number {
  if (!(subtotalMinor > 0) || !(porcentaje > 0)) {
    return 0;
  }
  const numerador = Math.round(subtotalMinor) * Math.round(porcentaje * 100);
  const cociente = Math.floor(numerador / 10000);
  const doble = (numerador - cociente * 10000) * 2;
  if (doble !== 10000) {
    return doble > 10000 ? cociente + 1 : cociente;
  }
  return cociente % 2 === 0 ? cociente : cociente + 1;
}
