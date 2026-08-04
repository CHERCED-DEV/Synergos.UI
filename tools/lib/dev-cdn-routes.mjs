/**
 * Qué fichero de `dist/` le toca a cada ruta del CDN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO SE COPIA NADA. SE MAPEA.
 *
 * El `dev-cdn` anterior sincronizaba `dist/` → la carpeta del CDN en cada
 * recompilación, y esa copia era la fuente de todos los «lo cambié y no se ve»:
 * un sync que falla a medias deja un CDN con la mitad vieja y no avisa.
 *
 * Acá el servidor **traduce la ruta y lee el fichero**. No hay copia que pueda
 * quedarse atrás: si `dist/` tiene el bundle nuevo, la siguiente petición lo
 * sirve; si no lo tiene, da 404 en vez de servir el de antes.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * EL LAYOUT QUE SE IMITA es el que produce `publish.mjs`, porque el CMS resuelve
 * contra él y no puede notar la diferencia:
 *
 *     /synergos/registry.json
 *     /synergos/<elemento>/angular/{latest|v0|0.1.0}/main.js
 *     /synergos/runtime/angular/{latest|21.1.6}/ng-core.js
 *
 * Los tres slots de versión apuntan al MISMO fichero de `dist/`, que es lo
 * correcto en desarrollo: no hay versionado, hay lo último que compilaste.
 */

/** Las carpetas de versión que el CDN publica por elemento. Todas apuntan igual. */
const SLOT = /^(latest|v\d+|\d+\.\d+\.\d+(?:[-+][\w.]+)?)$/;

/**
 * Traduce una ruta HTTP a lo que el servidor tiene que hacer.
 *
 * Devuelve un objeto con `tipo`, y el resto de campos según el tipo:
 *
 *   `catalogo`  → la vitrina, servida desde `catalog.html`
 *   `registry`  → el índice, generado al vuelo
 *   `contratos` → contracts.json, generado al vuelo
 *   `senal`     → el latido del livereload
 *   `elemento`  → { elemento, fichero } dentro de `dist/<elemento>/browser/`
 *   `runtime`   → { fichero } dentro de `dist/runtime/angular/<version>/`
 *   `nada`      → 404
 *
 * @param {string} pathname Ruta pedida, con barra inicial.
 * @returns {{tipo: string, elemento?: string, fichero?: string}}
 */
export function resolverRuta(pathname) {
  if (pathname === '/' || pathname === '/index.html') return { tipo: 'catalogo' };
  if (pathname === '/synergos/registry.json') return { tipo: 'registry' };
  if (pathname === '/synergos/contracts.json') return { tipo: 'contratos' };
  if (pathname === '/synergos/__dev.json') return { tipo: 'senal' };

  const partes = pathname.split('/').filter(Boolean);
  if (partes[0] !== 'synergos') return { tipo: 'nada' };

  // /synergos/runtime/angular/<slot>/<fichero>
  if (partes[1] === 'runtime') {
    const [, , framework, slot, ...resto] = partes;
    if (framework !== 'angular' || !slot || !SLOT.test(slot) || resto.length === 0) {
      return { tipo: 'nada' };
    }
    return { tipo: 'runtime', fichero: resto.join('/') };
  }

  // /synergos/<elemento>/angular/<slot>/<fichero>
  const [, elemento, framework, slot, ...resto] = partes;
  if (!elemento || framework !== 'angular' || !slot || !SLOT.test(slot)) {
    return { tipo: 'nada' };
  }
  if (resto.length === 0) return { tipo: 'nada' };

  // Un `..` en la ruta pedida no puede sacar al servidor de `dist/`. Es un
  // servidor de desarrollo, pero escucha en un puerto y lo escrito acá se lee
  // como permiso: mejor que no lo sea.
  if (resto.some((s) => s === '..' || s === '.')) return { tipo: 'nada' };
  if (elemento.includes('..')) return { tipo: 'nada' };

  return { tipo: 'elemento', elemento, fichero: resto.join('/') };
}

/**
 * Las cabeceras de una respuesta del dev server.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO SE IMITA LA POLÍTICA DE CACHÉ DE PRODUCCIÓN, Y ES DELIBERADO.
 *
 * En producción, `/synergos/<el>/angular/0.1.0/main.js` va con `immutable` y un
 * año. Servir eso acá significaría que recompilás, recargás, y el navegador te
 * enseña el bundle de hace media hora — que es exactamente el ciclo que este
 * servidor existe para eliminar.
 *
 * Que dev y producción difieran en caché no deja un hueco sin vigilar: las
 * cabeceras de verdad las comprueba `tools/humo-cdn.mjs` contra la URL pública,
 * que es el único sitio donde esa pregunta se puede contestar (issue #9).
 *
 * EL CORS SÍ SE IMITA, y no es opcional: el CMS corre en otro origen
 * (`synergos.local:5000`), así que sin `access-control-allow-origin` el
 * navegador descarga el bundle y luego se niega a ejecutarlo — con un error que
 * no menciona al CDN. Es el mismo fallo que ya mordió en producción.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function cabecerasDev(contentType) {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*',
  };
}

/** El `Content-Type` que le toca a un fichero por su extensión. */
export function tipoDe(fichero) {
  if (fichero.endsWith('.js') || fichero.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (fichero.endsWith('.json')) return 'application/json; charset=utf-8';
  if (fichero.endsWith('.css')) return 'text/css; charset=utf-8';
  if (fichero.endsWith('.html')) return 'text/html; charset=utf-8';
  if (fichero.endsWith('.map')) return 'application/json; charset=utf-8';
  if (fichero.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

/**
 * El `registry.json` de desarrollo: lo que se está sirviendo, y nada más.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANUNCIAR DE MÁS ES PEOR QUE ANUNCIAR DE MENOS, Y NO ES OBVIO.
 *
 * `dist/` conserva lo de builds anteriores. Con `--solo=badge,hero` se compilan
 * dos elementos, pero los otros 137 SIGUEN EN EL DISCO de la última vez que se
 * construyó todo. Filtrar sólo por «existe el fichero» los anunciaría a los
 * 139, y el CMS los hidrataría con bundles de antigüedad desconocida.
 *
 *   > Eso es exactamente el «lo cambié y no se ve» que este servidor existe
 *   > para eliminar, sólo que peor: no falla, sirve código viejo con cara de
 *   > nuevo. Un 404 se investiga; una sobra servida en silencio, no.
 *
 * Así que `--solo` manda sobre lo que hay en el disco.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SE DEDUPLICA POR NOMBRE, como hace `publish.mjs`. El registry fuente tiene
 * varias entradas con el mismo `name` y distinto `alias` —varios tipos del CMS
 * que comparten una implementación— y el publicado las colapsa en un Map. Si
 * acá no se colapsaran, el registry de desarrollo tendría más entradas que el
 * de producción y el CMS resolvería distinto en cada uno. Gana la primera, que
 * es lo que hace el Map de `publish.mjs`.
 *
 * @param {Array} registro `element-registry.json` completo.
 * @param {(nombre: string) => boolean} seSirve Si ese elemento se está sirviendo.
 * @param {string} version Versión que se anuncia para todos.
 */
export function registryDeDesarrollo(registro, seSirve, version) {
  const porNombre = new Map();

  for (const e of registro) {
    if (!seSirve(e.name) || porNombre.has(e.name)) continue;
    porNombre.set(e.name, {
      name: e.name,
      alias: e.alias,
      tag: e.tag,
      tier: e.tier,
      implementations: {
        angular: { latest: version, [`v${version.split('.')[0]}`]: version },
      },
    });
  }

  return {
    generated: new Date().toISOString(),
    version,
    baseUrl: '/synergos',
    elements: [...porNombre.values()],
  };
}
