/**
 * Monograma de fallback para el plato que ocupa el hueco de la foto cuando una
 * tarjeta no trae imagen. Lo comparten `storefront` y `product-card`: dos platos
 * con la misma regla, un solo sitio donde vive.
 */

/** Palabras que no aportan inicial: si el nombre empieza por una, la inicial
 *  sale de la siguiente con carga (`Café de Colombia` → `CC`, no `CD`). */
const MONOGRAM_STOP_WORDS: ReadonlySet<string> = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'con', 'para',
]);

/** Caracteres de una palabra que pueden ser inicial: letras y dígitos de
 *  CUALQUIER alfabeto. Se recorre por puntos de código (`Array.from`) y no por
 *  unidades UTF-16: `'🎁'.charAt(0)` devuelve media pareja subrogada y pinta un
 *  rombo de reemplazo en el plato. Filtrar por `\p{L}|\p{N}` deja fuera de una
 *  sola pasada emojis, comillas («»"'), guiones y demás puntuación de apertura. */
function monogramGlyphs(word: string): readonly string[] {
  return Array.from(word).filter((character) => /[\p{L}\p{N}]/u.test(character));
}

/**
 * Iniciales (hasta 2) de un título, para el plato-fallback sin foto.
 *
 * La regla: inicial de las dos primeras palabras con carga; las dos primeras
 * letras si solo hay una palabra; `·` si no queda ningún carácter utilizable.
 *
 * El recorte final a 2 **puntos de código** acota los casos en que mayusculizar
 * ALARGA la cadena (`'ß'.toUpperCase() === 'SS'`), que si no desbordan el plato.
 */
export function monogram(title: string | null | undefined): string {
  const words = (title ?? '')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !MONOGRAM_STOP_WORDS.has(word.toLowerCase()));

  const parts = words.map(monogramGlyphs).filter((glyphs) => glyphs.length > 0);
  if (parts.length === 0) {
    return '·';
  }

  const first = parts[0][0];
  const second = parts.length > 1 ? parts[1][0] : parts[0].at(1) ?? '';
  return Array.from((first + second).toUpperCase()).slice(0, 2).join('');
}
