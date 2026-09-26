/**
 * El cruce de los vectores de oro de la hipoteca (#76 · CMS#167).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE ESTO CIERRA.
 *
 * `IMortgageCalculator` del CMS afirmaba en su `<remarks>` que «el cálculo base es
 * el mismo en cliente y servidor». Era FALSO desde que existe el endpoint: las dos
 * implementaciones son la misma fórmula con la tasa a **100×** de distancia —acá
 * porcentaje, allá fracción— y **nada las cruzaba**. Medido ejecutando las dos
 * reales sobre 300.000.000 / 60.000.000 / 240 meses: `POST /api/realty/mortgage`
 * contestaba **240.000.000** al mes donde esta app pinta **2.642.606,72**. Factor
 * 90,82: una cuota igual al capital entero, todos los meses, durante veinte años.
 *
 * Una frase en prosa no lo iba a cambiar — la frase YA estaba escrita, en el sitio
 * más autorizado posible. Lo que hacía falta es que las dos lo EJECUTEN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ LA PARTE PURA VIVE ACÁ Y NO EN EL SCRIPT.
 *
 * El cruce necesita el repo del CMS (los vectores viven en su `docs/contracts/`,
 * que es la única superficie de acople) y `tests-ui.yml` no lo chequea. Un gate
 * cross-repo que se queda sin su fuente **rechaza**, no se salta — la regla de G-8
 * del repo hermano— así que el script no puede entrar a `npm test`. Con la
 * comparación acá, su LÓGICA sí se prueba en `test:tools` sin hermano y sin red, y
 * lo que queda afuera es sólo la lectura del disco. El reparto es el de
 * `humo-tras-desplegar` y `setup-completo`.
 */

/**
 * Qué se compara y qué no.
 *
 * `monthly` y `principal` van EXACTOS al centavo: el primero es el número que la
 * pantalla enseña y el único que movía el defecto, y el segundo es el que el borde
 * no emitía y esta app rellenaba de su lado.
 *
 * `totalInterest` y `totalPaid` **no se comparan entre las dos implementaciones**, y
 * es deliberado: usan métodos distintos, los dos correctos. El C# suma el cuadro
 * completo redondeado a centavos con la última cuota absorbiendo el redondeo —por eso
 * su saldo cierra en cero exacto— y esta multiplica la cuota sin redondear por el
 * plazo, porque construye sólo las primeras filas y no tiene qué sumar. Medido sobre
 * el primer vector: 634.225.612,89 contra 634.225.612,94, cinco centavos sobre 634
 * millones. Cada lado comprueba sus totales contra SU cuadro; el fichero de vectores
 * lo deja escrito para que nadie lo lea como deriva.
 */
export const COMPARADOS = ['monthly', 'principal'];

/** Cuántos vectores tiene que haber como mínimo — la red de seguridad. */
export const MINIMO_DE_VECTORES = 6;

/**
 * Cruza los vectores contra una calculadora.
 *
 * @param {ReadonlyArray<Record<string, unknown>>} vectores lo que declara el fichero del CMS.
 * @param {(request: {price:number,downPayment:number,termMonths:number,annualRatePercent:number}) => {monthly:number,principal:number}} calcular
 *   la implementación REAL de este árbol. Se inyecta para que esta función se pueda
 *   probar sin compilar TypeScript, y para que el script no pueda pasarle otra cosa
 *   que la de producción.
 * @returns {string[]} los fallos, vacío si cruzan todos.
 */
export function cruzarVectores(vectores, calcular) {
  // Red de seguridad ANTES de mirar nada. Sin esto, un fichero movido, una clave
  // renombrada o un lector roto dejan la lista vacía y el gate informa «✓ todos
  // cruzan» sin haber comparado un solo número. Es el modo de fallo caro: un rojo se
  // arregla, un verde sobre el vacío se hereda.
  if (!Array.isArray(vectores) || vectores.length < MINIMO_DE_VECTORES) {
    return [
      `se leyeron ${Array.isArray(vectores) ? vectores.length : 0} vectores y el fichero ` +
        `declara al menos ${MINIMO_DE_VECTORES}: el lector dejó de ver, o el fichero se movió. ` +
        'NO se pasa por alto — un cruce sobre una lista vacía es un verde que no comprobó nada.',
    ];
  }

  const fallos = [];

  for (const v of vectores) {
    const nombre = typeof v.nombre === 'string' ? v.nombre : '(sin nombre)';
    const request = {
      price: Number(v.price),
      downPayment: Number(v.downPayment),
      termMonths: Number(v.termMonths),
      annualRatePercent: Number(v.annualRatePercent),
    };

    let obtenido;
    try {
      obtenido = calcular(request);
    } catch (error) {
      fallos.push(`«${nombre}»: la calculadora lanzó — ${error?.message ?? error}`);
      continue;
    }

    for (const campo of COMPARADOS) {
      const esperado = Number(v[campo]);
      if (obtenido?.[campo] !== esperado) {
        fallos.push(
          `«${nombre}»: ${campo} esperado ${esperado} y esta implementación da ${obtenido?.[campo]}. ` +
            `Cuerpo: price=${request.price} downPayment=${request.downPayment} ` +
            `termMonths=${request.termMonths} annualRatePercent=${request.annualRatePercent}.`,
        );
      }
    }

    // Y no puede dar el número de la unidad equivocada. Es lo que impide que el vector
    // de tasa cero —donde porcentaje y fracción dan el MISMO valor— se cuente como
    // cobertura de la unidad: ahí los dos coinciden a propósito y el caso se excluye
    // DICIÉNDOLO, en vez de aflojar la comparación para todos.
    const mal = Number(v.conLaUnidadMal);
    const laUnidadNoSeNota = mal === Number(v.monthly);
    if (!laUnidadNoSeNota && obtenido?.monthly === mal) {
      fallos.push(
        `«${nombre}»: la cuota es exactamente la de la UNIDAD EQUIVOCADA (${mal}). ` +
          'Alguien volvió a confundir porcentaje con fracción (#76).',
      );
    }
    if (laUnidadNoSeNota && Number(v.annualRatePercent) !== 0) {
      fallos.push(
        `«${nombre}»: declara el mismo valor con la unidad bien y mal sin ser el vector de ` +
          'tasa cero. Con tasa distinta de cero eso no puede pasar: el vector está mal escrito ' +
          'y no cubre la unidad.',
      );
    }
  }

  return fallos;
}
