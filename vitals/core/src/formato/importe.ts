/**
 * Cómo se pinta un importe — UNA sola vez en todo el árbol (CMS#196).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ VIVE ACÁ. Cada vertical tenía su `formatPrice`/`formatMinor`/
 * `formatMoney`: diez copias casi idénticas, y la diferencia entre ellas era
 * justo el defecto. Unas pintaban el número solo cuando no había moneda; otras
 * la inventaban (`currency || 'COP'`), que es una segunda fuente para un dato
 * del precio: la moneda llega CON cada importe desde la API (ADR 0137, cambio 4)
 * y un peso compilado en el bundle es la regla del sitio escrita en el código.
 *
 * Es agnóstica (sólo `Intl`), así que vive en `vitals` y no en el `shared` de
 * un framework. Está FUERA de `inputs/` a propósito: eso es el modelo de lo que
 * emite el CMS y se reexporta en el runtime compartido; esto formatea lo que
 * llega de una API y cada elemento lo empaqueta.
 *
 * HAY GATE (`tools/lib/moneda-de-los-datos.mjs`): ningún otro fichero formatea
 * con `style: 'currency'` ni compila una moneda de respaldo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Cómo se formatea un importe. */
export interface OpcionesDeImporte {
  /**
   * Máximo de decimales. `0` por defecto: los importes del producto son pesos enteros. La
   * comisión de eventos se cobra con centavos (22.500,12) y pide `2`: pintarla redondeada sería
   * mostrar otra cifra que la que se cobra.
   */
  readonly decimales?: number;
  /** Locale del formato; `es-CO` por defecto, el del producto. */
  readonly locale?: string;
}

/** El locale del producto mientras la cultura del sitio no viaje con el importe. */
const LOCALE_DEL_PRODUCTO = 'es-CO';

/** ISO-4217: la mayoría de las monedas tiene dos decimales. */
const DECIMALES_POR_DEFECTO = 2;

/**
 * Cuántos decimales tiene la unidad menor de una moneda, según ISO-4217 (lo que trae `Intl`):
 * COP, USD y EUR 2; CLP y JPY 0; KWD 3. Sin moneda, o una que `Intl` no conoce, 2.
 *
 * Es la MISMA tabla que usa el servidor para emitir los `*Minor` (CMS#196): las unidades menores
 * de un importe son las de su moneda, no «centavos» para todas ni «pesos» para COP.
 */
export function decimalesDeMoneda(moneda?: string | null): number {
  const codigo = moneda?.trim() ?? '';
  if (!codigo) {
    return DECIMALES_POR_DEFECTO;
  }
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency: codigo }).resolvedOptions().maximumFractionDigits
      ?? DECIMALES_POR_DEFECTO
    );
  } catch {
    return DECIMALES_POR_DEFECTO;
  }
}

/** Un importe en unidades MENORES de su moneda (lo que manda la API como `*Minor`) a mayores. */
export function desdeMenores(menores: number, moneda?: string | null): number {
  return menores / 10 ** decimalesDeMoneda(moneda);
}

/**
 * Un importe en unidades MAYORES a las menores de su moneda, redondeado al par —el redondeo de
 * la casa, el mismo que usa el servidor (`UnidadesMenores` del CMS)—. `Math.round` redondea la
 * mitad hacia arriba y un medio centavo daría otro número que el que se cobra.
 */
export function aMenores(importe: number, moneda?: string | null): number {
  return redondearAlPar(importe * 10 ** decimalesDeMoneda(moneda));
}

function redondearAlPar(valor: number): number {
  const entero = Math.round(valor);
  // Sólo una mitad exacta decide; el resto redondea como siempre.
  return Math.abs(valor % 1) === 0.5 && entero % 2 !== 0 ? entero - 1 : entero;
}

/**
 * Un importe con su moneda.
 *
 * - **Sin moneda** (todavía no llegó ningún importe de la API) se pinta el número solo: no se
 *   inventa una.
 * - **Con una moneda que `Intl` no conoce** se pinta «código número», en vez de romper la
 *   pantalla.
 * - **Un importe que no es un número finito** no se pinta (`''`): un «NaN» en una tarjeta es
 *   la UI mintiendo, y el precio que falta se nota igual.
 *
 * @param importe En unidades MAYORES (pesos, no centavos). Para centavos, dividir antes.
 * @param moneda ISO-4217 tal como llegó con el importe; vacía o ausente = sin moneda.
 */
export function formatearImporte(
  importe: number,
  moneda?: string | null,
  opciones: OpcionesDeImporte = {},
): string {
  if (!Number.isFinite(importe)) {
    return '';
  }

  const locale = opciones.locale ?? LOCALE_DEL_PRODUCTO;
  const decimales = Math.max(0, opciones.decimales ?? 0);
  const numero = new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: decimales });
  const codigo = moneda?.trim() ?? '';

  if (!codigo) {
    return numero.format(importe);
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: codigo,
      minimumFractionDigits: 0,
      maximumFractionDigits: decimales,
    }).format(importe);
  } catch {
    return `${codigo} ${numero.format(importe)}`;
  }
}
