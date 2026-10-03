/**
 * El cruce de los vectores de oro de las UNIDADES MENORES de un importe (CMS#196 · G-13).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ CIERRA. Cada borde decidía la unidad de sus `*Minor` por su cuenta: el copago de salud
 * mandaba centavos, y la tasa de un trámite y la facturación de salud mandaban PESOS con el
 * nombre `feeMinor`/`balanceMinor`. La UI divide por 100 y un saldo de 123.500 se pintaba
 * $ 1.235 (medido en el sitio real). El CMS emite con `UnidadesMenores`, la UI pinta con
 * `aMenores` / `desdeMenores` de `vitals/core/src/formato`, y los dos corren los mismos vectores.
 *
 * La parte pura vive acá, como en `vectores-comision.mjs`: el script necesita el repo del CMS
 * y por eso no entra a `npm test`; su lógica sí, en `test:tools`.
 */

/**
 * Los vectores que `aMenores`/`desdeMenores` no reproducen, uno por línea. Vacío si cruzan todos.
 *
 * @param {ReadonlyArray<{nombre: string, moneda: string, importe: number, menores: number}>} vectores
 * @param {(importe: number, moneda: string) => number} aMenores
 * @param {(menores: number, moneda: string) => number} desdeMenores
 * @returns {string[]}
 */
export function cruzarUnidadesMenores(vectores, aMenores, desdeMenores) {
  if (!Array.isArray(vectores) || vectores.length === 0) {
    return ['el fichero no trae vectores: un cruce sin vectores sale en verde sin mirar nada'];
  }

  const fallos = [];
  for (const v of vectores) {
    const menores = aMenores(v.importe, v.moneda);
    if (menores !== v.menores) {
      fallos.push(`«${v.nombre}»: ${v.importe} ${v.moneda || '(sin moneda)'} → ${menores} menores, y el vector dice ${v.menores}`);
    }
    // De vuelta sólo cuando el importe cabe en la moneda: un medio centavo no vuelve igual.
    const vuelta = desdeMenores(v.menores, v.moneda);
    if (Number.isInteger(v.importe * 1000) && aMenores(vuelta, v.moneda) !== v.menores) {
      fallos.push(`«${v.nombre}»: ${v.menores} menores vuelven como ${vuelta}`);
    }
  }
  return fallos;
}
