/**
 * Las rutas por hash de las verticales: `#/<scope>/<segmento>/…` — UNA pieza para las
 * ocho (UI#91).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO. Las ocho verticales con enlaces profundos (academy, blogs, ehr, eventos,
 * gov, realty, storefront, travel-shell) armaban la base con `#/${scope}` CRUDO y la
 * comparaban con `location.hash`, que el navegador devuelve CODIFICADO: un espacio sale
 * `%20`, una `ñ` sale `%C3%B1`. Con un `scope` así —`Mi tienda`, `Educación`— el
 * `startsWith` no casaba nunca y la vertical dejaba de reconocer sus propias rutas:
 * recargar, volver atrás o entrar por enlace no abría el curso ni «Mis tickets». Medido
 * en el banco con `scope="muestra: scope"` (#88), y escrito ocho veces, una por vertical.
 *
 * Y había un segundo hueco escondido en la misma copia: los parámetros se escribían con
 * `encodeURIComponent` y cada vertical decidía si los decodificaba al leer. Gov no lo
 * hacía: un trámite cuyo id lleva un espacio llegaba a `loadService` como `a%20b`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA. Se ESCRIBE cada segmento con `encodeURIComponent` (el scope incluido), y se
 * LEE decodificando segmento a segmento antes de comparar. Así casa el hash que escribió
 * la propia vertical, el que el navegador re-codificó y el que alguien tecleó a mano con
 * `:` o con tildes —el navegador deja `:` tal cual y `encodeURIComponent` lo escribe
 * `%3A`: los dos decodifican a lo mismo—. Quien llama recibe los segmentos YA
 * decodificados y no vuelve a decodificar: decodificar dos veces convierte un `%25`
 * legítimo en otra cosa.
 *
 * Lo que NO cubre, dicho en vez de insinuado: un `scope` con `/` se escribe `%2F` y casa;
 * tecleado con la barra cruda, son dos segmentos y no.
 */

/** Decodifica un segmento; uno mal formado (`%E0%A4%A`) se queda como vino, sin lanzar. */
function decodificar(segmento: string): string {
  try {
    return decodeURIComponent(segmento);
  } catch {
    return segmento;
  }
}

/** Los segmentos de un hash `#/a/b`, decodificados — sin el `#` ni la barra inicial. */
function partes(hash: string): string[] {
  const sinAlmohadilla = hash.startsWith('#') ? hash.slice(1) : hash;
  const sinBarra = sinAlmohadilla.startsWith('/') ? sinAlmohadilla.slice(1) : sinAlmohadilla;
  return sinBarra.split('/').map(decodificar);
}

/** La base de las rutas de una vertical: `#/<scope codificado>`. */
export function baseDeRuta(scope: string): string {
  return `#/${encodeURIComponent(scope)}`;
}

/**
 * Los segmentos que siguen al `scope` en `hash`, ya decodificados y sin vacíos — o `null`
 * si el hash no es de esta vertical (otro scope, otra cosa, o vacío).
 *
 *   segmentosDeRuta('#/Mi%20tienda/p/A%20B', 'Mi tienda')  → ['p', 'A B']
 *   segmentosDeRuta('#/Mi%20tienda', 'Mi tienda')          → []
 *   segmentosDeRuta('#/otra/p/1', 'Mi tienda')             → null
 */
export function segmentosDeRuta(hash: string, scope: string): string[] | null {
  if (!hash.startsWith('#/')) return null;
  const [primero, ...resto] = partes(hash);
  if (primero !== scope) return null;
  return resto.filter((s) => s !== '');
}

/**
 * ¿Nombran `a` y `b` la misma ruta? Compara segmento a segmento ya decodificados: el hash
 * que escribió la vertical y el que devuelve el navegador pueden diferir en la forma
 * (`%3A` contra `:`) y ser la misma ruta.
 */
export function mismaRuta(a: string, b: string): boolean {
  return partes(a).join('/') === partes(b).join('/');
}
