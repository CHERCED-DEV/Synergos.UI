/**
 * El cruce de los vectores de oro de la comisión de servicio de Eventos (ADR 0137 · CMS#194).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ CIERRA. La comisión vivía sólo en el bundle (`DEFAULT_FEE_PERCENT = 12`) y ningún
 * camino del servidor la cobraba: el carrito sumaba un 12 % que el checkout no cobraba. Al
 * cobrarla en el servidor la fórmula queda escrita tres veces —el carrito de este árbol, el
 * motor en proceso del CMS y el orquestador— y la regla de redondeo es donde se separan sin
 * que nadie lo note. Los tres corren los mismos vectores.
 *
 * La parte pura vive acá, como en `vectores-hipoteca.mjs`: el script necesita el repo del CMS
 * y por eso no entra a `npm test`; su lógica sí, en `test:tools`.
 */

/**
 * Los vectores que `comision` no reproduce, uno por línea. Vacío si cruzan todos.
 *
 * Los vectores van en unidades MAYORES y la regla del carrito trabaja en menores: se convierte
 * acá, una vez, con la misma regla que usa el carrito (`Math.round(x × 100)`).
 *
 * @param {ReadonlyArray<{nombre: string, subtotal: number, feePercent: number, fee: number}>} vectores
 * @param {(subtotalMinor: number, porcentaje: number) => number} comision
 * @returns {string[]}
 */
export function cruzarComision(vectores, comision) {
  if (!Array.isArray(vectores) || vectores.length === 0) {
    return ['el fichero no trae vectores: un cruce sin vectores sale en verde sin mirar nada'];
  }

  const fallos = [];
  for (const v of vectores) {
    const esperada = Math.round(v.fee * 100);
    const obtenida = comision(Math.round(v.subtotal * 100), v.feePercent);
    if (obtenida !== esperada) {
      fallos.push(`«${v.nombre}»: ${v.feePercent} % de ${v.subtotal} → ${obtenida} menores, y el vector dice ${esperada}`);
    }
  }
  return fallos;
}
