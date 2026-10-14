/**
 * El runtime compartido, publicado POR CONTENIDO (ADR 0140, CMS#201).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE ESTO CIERRA, MEDIDO EN VIVO.
 *
 * El import map nombraba `runtime/<framework>/<versión>/sg-shared.js`, y esa
 * carpeta lleva la versión del FRAMEWORK, no la de su contenido:
 * `publish:runtime` la reescribía cada vez que cambiaba `libs/shared`. Las dos
 * políticas de caché la servían `immutable` por tener forma de versión, así que
 * un navegador que ya tenía el `sg-shared.js` viejo se quedaba con él hasta un
 * año: `syn-promo-code` sin estilos, un export nuevo que no enlaza, y ningún
 * rojo en ningún sitio. Vaciar la caché lo «arreglaba» en la máquina de quien
 * miraba, y en la de nadie más.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SALIDA: QUE LA URL NOMBRE LOS BYTES.
 *
 *     runtime/<framework>/<versión>/<stem>.<sha256[0:16]>.js
 *
 * El nombre lleva la huella de su contenido, así que la URL no se reescribe
 * nunca y `immutable` vuelve a ser cierto (`HUELLA_EN_NOMBRE`, la MISMA regex
 * que la política del Worker y la del CMS). Un navegador con el fichero viejo
 * recibe un mapa que nombra una URL que nunca pidió: la baja, y queda rescatado
 * sin vaciar nada. Y como va POR FICHERO, un cambio de `libs/shared` sólo mueve
 * `sg-shared` y `sg-core`; el framework sigue en caché.
 *
 * Tres reglas lo sostienen, y cada una tiene su diente acá:
 *
 *   1. **Un fichero con huella se escribe UNA vez** (`planificarEscritura`). El
 *      mismo nombre con otros bytes no se sobrescribe: se para. Sobrescribirlo
 *      sería volver a mentir con `immutable`.
 *   2. **Nada se borra.** `latest/huellas.json` (`LIBRO`) declara todo lo que se
 *      publicó y sólo crece (`fusionarLibro`): una generación anterior sigue
 *      publicada mientras quede un navegador o un CMS con un mapa que la nombre.
 *      `build:cdn` la restaura antes de publicar (`conservar-runtime.mjs`).
 *   3. **El mapa se voltea el ÚLTIMO.** Primero los ficheros, después el libro,
 *      y `latest/import-map.json` al final y atómico (`escribirAtomico`): quien
 *      lea el mapa a medias publicación lee el anterior, entero.
 *
 * Los planos (`<versión>/sg-shared.js`, `latest/sg-shared.js`) se siguen
 * publicando —superset: hay quien los lee, como el presupuesto de tamaño— pero
 * ningún mapa los nombra y las dos políticas los sirven cortos.
 * `--urls=por-nombre` es la vuelta atrás: el mapa plano de antes, que con la
 * política nueva ya no envenena a nadie.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Todo es por framework, desde `FICHEROS_POR_FRAMEWORK`, y el disco se inyecta:
 * es lo que deja ver fallar cada diente sin montar un CDN de verdad.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';

import { HUELLA_EN_NOMBRE, RUNTIME } from './cdn-cache-policy.mjs';
import { ALIAS_HEREDADOS, calificar, ficherosDelRuntime, importsDelRuntime } from './mapa-del-runtime.mjs';
import { leerBandera } from './cli-utils.mjs';

/** El libro de cada framework: `runtime/<framework>/latest/huellas.json`. */
export const LIBRO = 'huellas.json';

/** Cuántos caracteres hex del sha256 lleva el nombre. Los mismos que pide `HUELLA_EN_NOMBRE`. */
export const LARGO_DE_LA_HUELLA = 16;

/** Cómo nombra el import map los ficheros del runtime. El primero es el de siempre. */
export const MODOS_DE_URL = ['por-contenido', 'por-nombre'];

/** El sha256 entero de unos bytes, en hex. */
export function sha256De(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** La huella: los primeros `LARGO_DE_LA_HUELLA` hex del sha256. */
export function huellaDe(bytes) {
  return sha256De(bytes).slice(0, LARGO_DE_LA_HUELLA);
}

/**
 * `sg-shared.js` + huella → `sg-shared.<huella>.js`.
 *
 * Lanza si el resultado no casa con `HUELLA_EN_NOMBRE`: un nombre que la
 * política no reconoce como huella se serviría corto y el mapa lo nombraría
 * igual — la promesa a medias que esto existe para no hacer.
 */
export function nombreConHuella(fichero, huella) {
  const partes = /^(.+?)(\.m?js)$/.exec(String(fichero));
  const nombre = partes ? `${partes[1]}.${huella}${partes[2]}` : null;
  if (!nombre || !HUELLA_EN_NOMBRE.test(nombre)) {
    throw new Error(
      `«${fichero}» con la huella «${huella}» no da un nombre con huella (${nombre ?? 'no es un .js'}). ` +
        `La política sólo sirve inmutable lo que casa con ${HUELLA_EN_NOMBRE}.`,
    );
  }
  return nombre;
}

/** La huella que lleva un nombre, o `null` si es un plano. */
export function huellaDelNombre(nombre) {
  if (!HUELLA_EN_NOMBRE.test(String(nombre))) return null;
  return /\.([0-9a-f]+)\.m?js$/.exec(nombre)[1];
}

/** El plano de un nombre con huella (`sg-shared.<h>.js` → `sg-shared.js`); un plano se queda igual. */
export function planoDelNombre(nombre) {
  return huellaDelNombre(nombre) === null ? nombre : nombre.replace(/\.[0-9a-f]+(\.m?js)$/, '$1');
}

/**
 * Dónde está, DENTRO de `runtime/<framework>/`, lo que nombra una URL del mapa
 * o del libro: `…/runtime/<framework>/21.1.6/sg-shared.<h>.js` →
 * `{ version: '21.1.6', nombre: 'sg-shared.<h>.js', relativa: '21.1.6/sg-shared.<h>.js' }`.
 *
 * Se lee de la URL y no se guarda aparte porque la URL es lo que el navegador
 * pide: si no se puede traducir a un fichero del árbol, el mapa nombra algo
 * que este CDN no tiene.
 *
 * @returns {{ version: string, nombre: string, relativa: string } | null}
 */
export function rutaEnElRuntime(url, framework) {
  const m = new RegExp(`/${RUNTIME}/${framework}/([^/?#]+)/([^/?#]+)$`).exec(String(url));
  return m ? { version: m[1], nombre: m[2], relativa: `${m[1]}/${m[2]}` } : null;
}

// ── El libro ────────────────────────────────────────────────────────────────

/** Un libro sin entradas. Es lo que hay antes de la primera publicación por contenido. */
export function libroVacio(framework) {
  return { framework, entradas: [] };
}

/**
 * Lee el texto de un libro. Lo ilegible LANZA: un libro que no se entiende y
 * se reemplaza por uno vacío pierde las generaciones que declaraba, y eso es
 * borrar sin decirlo.
 */
export function leerLibro(texto, framework) {
  let libro;
  try {
    libro = JSON.parse(texto);
  } catch (err) {
    throw new Error(`el libro ${LIBRO} de «${framework}» no es JSON legible: ${err.message}`);
  }
  if (!libro || typeof libro !== 'object' || !Array.isArray(libro.entradas)) {
    throw new Error(`el libro ${LIBRO} de «${framework}» no tiene la forma { framework, entradas: [] }.`);
  }
  if (libro.framework !== framework) {
    throw new Error(`el libro ${LIBRO} de «${framework}» dice ser de «${libro.framework}».`);
  }
  for (const entrada of libro.entradas) revisarEntrada(entrada, framework);
  return { framework, entradas: libro.entradas.map(normalizarEntrada) };
}

/** Una entrada en el orden de campos que documenta el contrato del CMS (cdn-bundle-structure.md). */
function normalizarEntrada({ fichero, url, sha256, bytes, desde }) {
  return { fichero, url, sha256, bytes, desde };
}

function revisarEntrada(entrada, framework) {
  const { fichero, url, sha256, bytes, desde } = entrada ?? {};
  const ruta = rutaEnElRuntime(url, framework);
  const problemas = [];
  if (typeof fichero !== 'string' || huellaDelNombre(fichero) !== null) problemas.push('«fichero» no es un nombre plano');
  if (!ruta) problemas.push(`«url» no apunta a /${RUNTIME}/${framework}/<versión>/<nombre>`);
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) problemas.push('«sha256» no son 64 hex');
  if (!Number.isInteger(bytes) || bytes < 0) problemas.push('«bytes» no es un entero');
  if (typeof desde !== 'string' || Number.isNaN(Date.parse(desde))) problemas.push('«desde» no es una fecha');
  if (ruta && typeof sha256 === 'string') {
    const huella = huellaDelNombre(ruta.nombre);
    if (huella !== sha256.slice(0, LARGO_DE_LA_HUELLA)) problemas.push(`el nombre ${ruta.nombre} no lleva la huella de su sha256`);
    if (planoDelNombre(ruta.nombre) !== fichero) problemas.push(`el nombre ${ruta.nombre} no es de ${fichero}`);
  }
  if (problemas.length > 0) {
    throw new Error(`entrada del libro de «${framework}» inválida (${url ?? 'sin url'}): ${problemas.join('; ')}.`);
  }
}

/**
 * Junta entradas a un libro. SÓLO AÑADE: lo que estaba sigue, con su «desde».
 *
 * Cada entrada es UN FICHERO del CDN, y se identifica por su sitio dentro de
 * `runtime/<framework>/` (`21.1.6/sg-shared.<h>.js`), no por la URL entera: la
 * misma publicación con otra base (`--base`, `SYNERGOS_CDN_ORIGIN`) es el mismo
 * fichero, y contarlo dos veces daría un libro que no dice cuántas generaciones
 * hay. De dos entradas del mismo fichero queda la primera publicada (la de
 * «desde» menor; a igualdad, la URL menor), así que es idempotente byte a byte
 * y no depende del orden: el libro de `public/` y el del CDN vivo dan lo mismo
 * fusionados en cualquier orden. El mismo fichero con otro sha256 LANZA: un
 * nombre con huella que trae otros bytes es exactamente lo que no puede pasar.
 */
export function fusionarLibro(libro, nuevas = []) {
  const { framework } = libro;
  const porFichero = new Map();
  const antes = (a, b) => a.desde < b.desde || (a.desde === b.desde && a.url < b.url);

  for (const entrada of [...libro.entradas, ...nuevas]) {
    revisarEntrada(entrada, framework);
    const { relativa } = rutaEnElRuntime(entrada.url, framework);
    const previa = porFichero.get(relativa);
    if (previa && (previa.sha256 !== entrada.sha256 || previa.bytes !== entrada.bytes)) {
      throw new Error(
        `el libro de «${framework}» tendría ${relativa} con dos contenidos ` +
          `(${previa.sha256} y ${entrada.sha256}). Un fichero con huella no cambia nunca.`,
      );
    }
    // La primera publicación manda: «desde» es cuándo existió por primera vez.
    if (!previa || antes(entrada, previa)) porFichero.set(relativa, normalizarEntrada(entrada));
  }

  const entradas = [...porFichero.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, entrada]) => entrada);
  return { framework, entradas };
}

/** El texto del libro, siempre igual para el mismo contenido. */
export function serializarLibro(libro) {
  return `${JSON.stringify({ framework: libro.framework, entradas: libro.entradas.map(normalizarEntrada) }, null, 2)}\n`;
}

// ── Escribir una sola vez ───────────────────────────────────────────────────

/**
 * Qué hacer con un fichero con huella que se va a publicar.
 *
 * @returns {'nada' | 'escribir'} Lanza si ya existe con OTROS bytes.
 */
export function planificarEscritura({ existe, sha256Existente, sha256Nuevo }) {
  if (!existe) return 'escribir';
  if (sha256Existente === sha256Nuevo) return 'nada';
  throw new Error(
    `ya hay un fichero con ese nombre y OTROS bytes (${sha256Existente} ≠ ${sha256Nuevo}). ` +
      `Un fichero con huella se escribe una sola vez: no se sobrescribe, se averigua por qué.`,
  );
}

/** Los errores de Windows de un fichero abierto por otro proceso (el CMS lee el mapa en cada render). */
const REINTENTABLES = new Set(['EPERM', 'EBUSY', 'EACCES']);

let secuencia = 0;

/**
 * Escribe por temporal + rename: quien lee el fichero a la vez lee el anterior
 * entero o el nuevo entero, nunca medio.
 *
 * En Windows el rename choca con un lector que tenga el fichero abierto —el CMS
 * hace `File.ReadAllText` del `latest/import-map.json` en cada render—, así que
 * se reintenta un poco. Agotados los intentos LANZA y el fichero anterior sigue
 * entero: es preferible una publicación que falla en voz alta a un mapa a medias.
 *
 * @param {{ writeFile: Function, rename: Function, rm: Function, mkdir: Function }} fs
 */
export async function escribirAtomico(fs, ruta, bytes, { intentos = 8, espera = 50, esperar } = {}) {
  const dormir = esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  await fs.mkdir(path.dirname(ruta), { recursive: true });
  secuencia += 1;
  const temporal = `${ruta}.${process.pid}-${secuencia}.tmp`;
  await fs.writeFile(temporal, bytes);

  for (let intento = 1; ; intento += 1) {
    try {
      await fs.rename(temporal, ruta);
      return;
    } catch (err) {
      if (!REINTENTABLES.has(err?.code) || intento >= intentos) {
        await fs.rm(temporal, { force: true }).catch(() => {});
        throw err;
      }
      await dormir(espera * intento);
    }
  }
}

/**
 * Publica un fichero con huella si hace falta: lo lee si ya está, decide con
 * `planificarEscritura` y sólo escribe si no estaba. Una republicación igual
 * no toca nada —ni el mtime, que es el ETag del montaje local del CMS—.
 *
 * @returns {Promise<'nada' | 'escrito'>}
 */
export async function escribirUnaVez(fs, ruta, bytes, opciones) {
  let existente = null;
  try {
    existente = await fs.readFile(ruta);
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
  const plan = planificarEscritura({
    existe: existente !== null,
    sha256Existente: existente === null ? null : sha256De(existente),
    sha256Nuevo: sha256De(bytes),
  });
  if (plan === 'nada') return 'nada';
  await escribirAtomico(fs, ruta, bytes, opciones);
  return 'escrito';
}

// ── El gate ─────────────────────────────────────────────────────────────────

/**
 * Lo que tiene que ser cierto en un CDN publicado por contenido, por framework.
 *
 * `existe` y `leerBytes` reciben rutas RELATIVAS a `runtime/<framework>/`
 * (`21.1.6/sg-shared.<h>.js`, `latest/sg-shared.js`). Devuelve una línea por
 * problema; vacío es que cuadra.
 *
 * @param {{ framework: string, mapa: { imports?: Record<string,string> },
 *           libro: { entradas: object[] } | null, existe: (r: string) => boolean,
 *           leerBytes: (r: string) => Uint8Array, modo?: string }} entrada
 * @returns {string[]}
 */
export function revisarPorContenido({ framework, mapa, libro, existe, leerBytes, modo = 'por-contenido' }) {
  const errores = [];
  const imports = mapa?.imports ?? {};
  const pre = `runtime/${framework}/`;
  const huellas = new Map();
  const huellaEn = (relativa) => {
    if (!huellas.has(relativa)) huellas.set(relativa, sha256De(leerBytes(relativa)));
    return huellas.get(relativa);
  };

  const enElLibro = new Set(
    (libro?.entradas ?? []).map((e) => rutaEnElRuntime(e.url, framework)?.relativa).filter(Boolean),
  );

  // Varios specifiers nombran el mismo fichero (el alias y su gemelo, `rxjs` y
  // `rxjs/operators`): cada fichero se juzga una vez.
  const vistos = new Set();

  for (const [specifier, url] of Object.entries(imports)) {
    const ruta = rutaEnElRuntime(url, framework);
    if (!ruta) {
      errores.push(`${pre}: "${specifier}" → ${url} no apunta a /${RUNTIME}/${framework}/<versión>/<fichero>.`);
      continue;
    }
    if (vistos.has(ruta.relativa)) continue;
    vistos.add(ruta.relativa);

    const huella = huellaDelNombre(ruta.nombre);
    if (huella === null) {
      if (modo !== 'por-nombre') {
        errores.push(
          `${pre}: "${specifier}" → ${ruta.relativa} es una URL SIN huella. Su carpeta lleva la versión ` +
            `del framework, no la del contenido: el navegador que ya la tiene no ve el cambio. ` +
            `Sólo --urls=por-nombre la declara a propósito.`,
        );
      } else if (!existe(ruta.relativa)) {
        errores.push(`${pre}: "${specifier}" → ${ruta.relativa} no existe en el CDN.`);
      }
      continue;
    }

    if (!existe(ruta.relativa)) {
      errores.push(`${pre}: "${specifier}" → ${ruta.relativa}: el fichero con huella NO existe — 404 en el navegador.`);
      continue;
    }

    const sha = huellaEn(ruta.relativa);
    if (sha.slice(0, LARGO_DE_LA_HUELLA) !== huella) {
      errores.push(
        `${pre}${ruta.relativa}: sus bytes no casan con su nombre (sha256 ${sha.slice(0, LARGO_DE_LA_HUELLA)}…). ` +
          `Se sobrescribió un fichero con huella, que se sirve inmutable un año.`,
      );
      continue;
    }

    if (!enElLibro.has(ruta.relativa)) {
      errores.push(
        `${pre}${ruta.relativa}: el mapa lo nombra y el libro latest/${LIBRO} no lo declara. ` +
          `El próximo build:cdn no lo conservaría.`,
      );
    }

    const plano = `latest/${planoDelNombre(ruta.nombre)}`;
    if (!existe(plano)) {
      errores.push(`${pre}${plano} no existe: el plano se sigue publicando (superset) y alguien lo lee.`);
    } else if (huellaEn(plano) !== sha) {
      errores.push(
        `${pre}${plano} no es el fichero que nombra el mapa (${ruta.relativa}): latest/ quedó en otra generación.`,
      );
    }
  }

  for (const entrada of libro?.entradas ?? []) {
    const ruta = rutaEnElRuntime(entrada.url, framework);
    if (!ruta) {
      errores.push(`${pre}latest/${LIBRO}: ${entrada.url} no apunta a un fichero de este runtime.`);
    } else if (!existe(ruta.relativa)) {
      errores.push(
        `${pre}latest/${LIBRO} declara ${ruta.relativa} y NO está publicado. Una generación anterior ` +
          `perdida es un 404 para quien aún tenga el mapa que la nombra.`,
      );
    }
  }

  for (const [alias, { framework: dueño }] of Object.entries(ALIAS_HEREDADOS)) {
    if (dueño !== framework || !Object.hasOwn(imports, alias)) continue;
    const gemelo = calificar(alias, framework);
    if (imports[gemelo] !== imports[alias]) {
      errores.push(
        `${pre}: "${alias}" → ${imports[alias]} y su gemelo "${gemelo}" → ${imports[gemelo] ?? '(ausente)'} ` +
          `no comparten URL. Con huellas distintas el CMS ve dos ficheros y no deduplica.`,
      );
    }
  }

  return errores;
}

// ── Publicar ────────────────────────────────────────────────────────────────

/** Los bytes de un fichero, o `null` si no está. Cualquier otro error sube. */
async function leerSiExiste(fs, ruta) {
  try {
    return await fs.readFile(ruta);
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Publica el runtime de UN framework por contenido, en el orden que lo hace
 * seguro para quien lo esté leyendo a la vez:
 *
 *   1. el sha256 de cada fichero de `dist/`;
 *   2. `<versión>/<stem>.<huella>.js`, una sola vez;
 *   3. los planos a `<versión>/` y `latest/` SÓLO si cambian los bytes (se
 *      siguen publicando; copiarlos igual movería su mtime, que es el ETag del
 *      montaje local del CMS);
 *   4. `<versión>/import-map.json`, con el mismo contenido que el de `latest/`;
 *   5. `latest/huellas.json`, releído y fusionado (sólo crece);
 *   6. `latest/import-map.json` EL ÚLTIMO y atómico: es el volteo;
 *   7. `revisarPorContenido` sobre lo que quedó en el destino.
 *
 * Una republicación sin cambios no escribe NADA. El modo `por-nombre` sólo
 * cambia el mapa —vuelve a los nombres planos—: los ficheros con huella y el
 * libro se escriben igual, así que ir y volver no pierde generaciones.
 *
 * @param {{ framework: string, version: string, dist: string, cdn: string,
 *           base: string, modo?: string, fs: object, ahora?: () => string,
 *           dryRun?: boolean, log?: (linea: string) => void }} entrada
 *   `cdn` es la raíz del CDN (la que contiene `synergos/`); `base`, la URL de
 *   `runtime/<framework>/<versión>` que nombra el mapa.
 * @returns {Promise<{ escritos: string[], errores: string[], nombres: Record<string,string> }>}
 */
export async function publicarRuntime({
  framework,
  version,
  dist,
  cdn,
  base,
  modo = MODOS_DE_URL[0],
  fs,
  ahora = () => new Date().toISOString(),
  dryRun = false,
  log = () => {},
}) {
  if (!MODOS_DE_URL.includes(modo)) throw new Error(`modo de URLs desconocido: ${modo}`);

  const ficheros = ficherosDelRuntime(framework);
  const raiz = path.join(cdn, 'synergos', RUNTIME, framework);
  const dirVersion = path.join(raiz, version);
  const dirLatest = path.join(raiz, 'latest');
  const b = String(base).replace(/\/$/, '');
  const escritos = [];

  // La URL del mapa es también la llave del libro: si no se traduce a
  // `runtime/<framework>/<versión>/`, nadie puede conservar ni revisar lo publicado.
  if (rutaEnElRuntime(`${b}/x.js`, framework)?.version !== version) {
    throw new Error(
      `la base «${base}» tiene que terminar en /${RUNTIME}/${framework}/${version}: es la URL que ` +
        `nombra el mapa, y el libro la traduce a su fichero.`,
    );
  }

  // 1. El contenido manda: sin él no hay nombre.
  const contenidos = {};
  const shas = {};
  const nombres = {};
  for (const fichero of ficheros) {
    const bytes = await leerSiExiste(fs, path.join(dist, fichero));
    if (bytes === null) {
      // Un fichero que la tabla declara y el build no produjo deja un bare
      // import sin resolver: 200 y nada hidrata. Se rechaza, no se salta.
      throw new Error(
        `${framework}: la tabla declara ${fichero} y no está en ${dist}.\n` +
          `  → O lo produce el build de esa plataforma, o sobra en FICHEROS_POR_FRAMEWORK.`,
      );
    }
    contenidos[fichero] = bytes;
    shas[fichero] = sha256De(bytes);
    nombres[fichero] = nombreConHuella(fichero, shas[fichero].slice(0, LARGO_DE_LA_HUELLA));
  }

  const escribir = async (ruta, bytes) => {
    escritos.push(ruta);
    if (!dryRun) await escribirAtomico(fs, ruta, bytes);
  };
  const siCambia = async (ruta, bytes) => {
    const actual = await leerSiExiste(fs, ruta);
    if (actual === null || !Buffer.from(actual).equals(Buffer.from(bytes))) await escribir(ruta, bytes);
  };

  // 2. Cada fichero con huella, una sola vez.
  for (const fichero of ficheros) {
    const ruta = path.join(dirVersion, nombres[fichero]);
    if (dryRun) {
      const actual = await leerSiExiste(fs, ruta);
      const plan = planificarEscritura({
        existe: actual !== null,
        sha256Existente: actual === null ? null : sha256De(actual),
        sha256Nuevo: shas[fichero],
      });
      if (plan === 'escribir') escritos.push(ruta);
    } else if ((await escribirUnaVez(fs, ruta, contenidos[fichero])) === 'escrito') {
      escritos.push(ruta);
    }
    log(`  ${escritos.includes(ruta) ? '+' : '='} ${version}/${nombres[fichero]}`);
  }

  // 3. Los planos, que se siguen publicando: sólo si cambian los bytes.
  for (const fichero of ficheros) {
    await siCambia(path.join(dirVersion, fichero), contenidos[fichero]);
    await siCambia(path.join(dirLatest, fichero), contenidos[fichero]);
  }

  // 4. El mapa. «integrity» sigue por nombre de fichero, como siempre.
  const integrity = Object.fromEntries(
    ficheros.map((f) => [f, `sha256-${Buffer.from(shas[f], 'hex').toString('base64')}`]),
  );
  const nombrar = modo === 'por-contenido' ? (fichero) => nombres[fichero] : undefined;
  const mapaJson = JSON.stringify({ imports: importsDelRuntime(framework, b, nombrar), integrity }, null, 2);
  await siCambia(path.join(dirVersion, 'import-map.json'), Buffer.from(mapaJson));

  // 5. El libro: se relee y se fusiona. Uno ilegible PARA, no se reemplaza.
  const rutaLibro = path.join(dirLatest, LIBRO);
  const textoLibro = await leerSiExiste(fs, rutaLibro);
  const libroAnterior = textoLibro === null ? libroVacio(framework) : leerLibro(String(textoLibro), framework);
  const desde = ahora();
  const libro = fusionarLibro(
    libroAnterior,
    ficheros.map((fichero) => ({
      fichero,
      url: `${b}/${nombres[fichero]}`,
      sha256: shas[fichero],
      bytes: contenidos[fichero].length,
      desde,
    })),
  );
  await siCambia(rutaLibro, Buffer.from(serializarLibro(libro)));

  // 6. El volteo, el último: hasta acá, quien lea el mapa lee el anterior entero.
  await siCambia(path.join(dirLatest, 'import-map.json'), Buffer.from(mapaJson));

  if (dryRun) return { escritos, errores: [], nombres };

  // 7. El gate, sobre lo que quedó de verdad en el destino.
  const mapa = JSON.parse(mapaJson);
  const relativas = new Set();
  for (const url of Object.values(mapa.imports)) {
    const ruta = rutaEnElRuntime(url, framework);
    if (!ruta) continue;
    relativas.add(ruta.relativa);
    relativas.add(`latest/${planoDelNombre(ruta.nombre)}`);
  }
  for (const entrada of libro.entradas) {
    const ruta = rutaEnElRuntime(entrada.url, framework);
    if (ruta) relativas.add(ruta.relativa);
  }
  const disco = new Map();
  for (const relativa of relativas) disco.set(relativa, await leerSiExiste(fs, path.join(raiz, relativa)));

  const errores = revisarPorContenido({
    framework,
    mapa,
    libro: leerLibro(String(await fs.readFile(rutaLibro)), framework),
    existe: (r) => disco.get(r) != null,
    leerBytes: (r) => disco.get(r),
    modo,
  });

  return { escritos, errores, nombres };
}

// ── La línea de órdenes ─────────────────────────────────────────────────────

/**
 * El modo de URLs: `--urls X`, `--urls=X` o `SYNERGOS_RUNTIME_URLS`. Sin nada,
 * por contenido. Un valor que no se entiende es un error, no «el de siempre».
 *
 * @returns {{ modo: string, origen: string } | { error: string }}
 */
export function leerModoDeUrls(argv, env = {}) {
  const bandera = leerBandera(argv, 'urls');
  const variable = env.SYNERGOS_RUNTIME_URLS || null;
  const [valor, origen] = bandera
    ? [bandera, '--urls']
    : variable
      ? [variable, 'SYNERGOS_RUNTIME_URLS']
      : [MODOS_DE_URL[0], 'por defecto'];

  if (!MODOS_DE_URL.includes(valor)) {
    return { error: `${origen}=${valor} no es un modo de URLs: ${MODOS_DE_URL.join(' | ')}.` };
  }
  return { modo: valor, origen };
}
