/**
 * publish-runtime.mjs
 *
 * Publica el runtime compartido ya construido —`dist/runtime/<framework>/<versión>/`,
 * de cada framework— en el CDN, POR CONTENIDO (ADR 0140, CMS#201): cada fichero
 * con la huella de sus bytes en el nombre (`sg-shared.<huella>.js`), escrito una
 * sola vez; el libro `latest/huellas.json`, que sólo crece; y el import map, que
 * nombra esos ficheros y se voltea el último. Los planos de `<versión>/` y
 * `latest/` se siguen publicando, pero ningún mapa los nombra.
 *
 * Usage (las dos formas de cada bandera valen: `--cdn RUTA` y `--cdn=RUTA`):
 *   node tools/publish-runtime.mjs
 *   node tools/publish-runtime.mjs --cdn D:\MyCDN
 *   node tools/publish-runtime.mjs --base https://cdn.example.com/synergos
 *   node tools/publish-runtime.mjs --urls por-nombre     (la vuelta atrás: el mapa plano de antes)
 *   node tools/publish-runtime.mjs --dry-run
 *
 * `--urls` también se lee de `SYNERGOS_RUNTIME_URLS`. Un valor que no se entiende
 * sale con 2 antes de tocar nada.
 */

import { readdir } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { leerBandera, revisarBanderas } from './lib/cli-utils.mjs';
import { HUELLA_EN_NOMBRE } from './lib/cdn-cache-policy.mjs';
import { ficherosDelRuntime } from './lib/mapa-del-runtime.mjs';
import { leerModoDeUrls, publicarRuntime } from './lib/runtime-por-contenido.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// ── Banderas (UI#69) ─────────────────────────────────────────────────────────
//
// Esto leía sólo `--cdn=` y `--base=`, y la cabecera documentaba `--cdn D:\MyCDN`: con la
// forma documentada la bandera se ignoraba EN SILENCIO y se publicaba al destino por
// defecto, imprimiendo «✓» y «Done». Hoy valen las dos formas, y lo que no se entiende —una
// errata como `--cnd`, una bandera sin su valor, un argumento suelto— sale con 2 ANTES de
// tocar nada, en vez de convertirse en «publicá donde siempre».
const argv = process.argv.slice(2);
const USO = '  Uso: node tools/publish-runtime.mjs [--cdn RUTA] [--base URL] [--urls por-contenido|por-nombre] [--dry-run]';
const erroresDeUso = revisarBanderas(argv, { conValor: ['cdn', 'base', 'urls'], sinValor: ['dry-run'] });
if (erroresDeUso.length > 0) {
  console.error(`[publish-runtime] ${erroresDeUso.join('\n  ')}\n${USO}`);
  process.exit(2);
}

// El modo de URLs, con la misma regla: un valor desconocido NO cae a «el de siempre».
const modoDeUrls = leerModoDeUrls(argv, process.env);
if (modoDeUrls.error) {
  console.error(`[publish-runtime] ${modoDeUrls.error}\n${USO}`);
  process.exit(2);
}

const isDryRun = argv.includes('--dry-run');
const cdnArg   = leerBandera(argv, 'cdn');
const baseArg  = leerBandera(argv, 'base');

// De DÓNDE salió el destino va en la salida: el defecto de UI#69 sólo se veía mirando la línea
// `CDN :` de cada runtime, y una publicación al sitio equivocado se leía igual que una buena.
const [CDN_ROOT, ORIGEN_DEL_DESTINO] = cdnArg
  ? [cdnArg, '--cdn']
  : process.env.SYNERGOS_CDN
    ? [process.env.SYNERGOS_CDN, 'SYNERGOS_CDN']
    : [String.raw`C:\LOCAL_CDN`, 'por defecto'];

const CDN_ORIGIN = process.env.SYNERGOS_CDN_ORIGIN || 'https://synergos-static-local';

// ── Locate built runtime version ────────────────────────────────────────────

/**
 * Los runtimes que hay de verdad en `dist/`, uno por framework.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE RECORRE, NO SE PREGUNTA POR `dist/runtime/angular` (#64).
 *
 * Esto preguntaba por esa ruta exacta y publicaba lo que hubiera dentro. Con una
 * segunda plataforma construida, `npm run publish:runtime` habría subido el
 * runtime de Angular y **nada más**, informando «Done» — y los elementos de la
 * otra plataforma habrían quedado publicados sin de dónde resolver sus bare
 * imports. No falla: el sitio contesta 200, el SSR entero, y lo de esa
 * plataforma no hidrata (el defecto CMS #126).
 *
 * Es la regla 25 en el publicador en vez de en un gate, y con el agravante de
 * que `cdn-runtime-check` —que exige runtime por framework PUBLICADO (#61)— se
 * habría puesto rojo DESPUÉS de subir, culpando al publish de otra cosa.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function resolverRuntimes() {
  const runtimeBase = path.join(ROOT, 'dist/runtime');
  let frameworks;
  try {
    frameworks = await readdir(runtimeBase, { withFileTypes: true });
  } catch {
    throw new Error(
      `[publish-runtime] dist/runtime/ not found.\n` +
      `  → Run: npm run build:runtime`,
    );
  }

  const encontrados = [];
  for (const entrada of frameworks) {
    if (!entrada.isDirectory()) continue;
    const framework = entrada.name;
    const versions = (await readdir(path.join(runtimeBase, framework)))
      .filter((e) => /^\d+\.\d+\.\d+$/.test(e))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (versions.length === 0) {
      // NO se salta en silencio: una carpeta de framework sin versión es un
      // build a medias, y saltarla informa «✓» sobre nada (regla 25c).
      throw new Error(
        `[publish-runtime] dist/runtime/${framework}/ no tiene ninguna versión.\n` +
        `  → Es un build a medias. Corré el build de runtime de esa plataforma.`,
      );
    }
    const version = versions.at(-1);
    encontrados.push({
      framework,
      version,
      dir: path.join(runtimeBase, framework, version),
    });
  }

  if (encontrados.length === 0) {
    throw new Error(
      `[publish-runtime] dist/runtime/ está vacío.\n` +
      `  → Run: npm run build:runtime`,
    );
  }

  return encontrados;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function publicarUno({ framework, version, dir }) {
  const ficheros = ficherosDelRuntime(framework);
  const raiz = path.join(CDN_ROOT, 'synergos', 'runtime', framework);

  const base = baseArg
    ? `${baseArg.replace(/\/$/, '')}/runtime/${framework}/${version}`
    : `${CDN_ORIGIN}/synergos/runtime/${framework}/${version}`;

  console.log(`\nSynergos Runtime Publish — ${framework}${isDryRun ? ' (dry-run)' : ''}`);
  console.log(`  Source  : dist/runtime/${framework}/${version}/`);
  console.log(`  CDN     : ${path.join(raiz, version)}`);
  console.log(`  Latest  : ${path.join(raiz, 'latest')}`);
  console.log(`  URLs    : ${modoDeUrls.modo} (${modoDeUrls.origen})`);
  console.log('─'.repeat(72));

  // Todo lo que importa del orden —ficheros con huella una vez, planos sólo si
  // cambian, libro, y el mapa EL ÚLTIMO— vive en `publicarRuntime`, que es lo que
  // tiene tests. Acá sólo se dice qué pasó.
  const { escritos, errores } = await publicarRuntime({
    framework,
    version,
    dist: dir,
    cdn: CDN_ROOT,
    base,
    modo: modoDeUrls.modo,
    fs,
    dryRun: isDryRun,
    log: (linea) => console.log(linea),
  });

  // Los ficheros con huella ya salieron arriba (+ nuevo, = ya estaba); acá va el resto.
  const verbo = isDryRun ? 'escribiría' : 'escritos';
  console.log(`  ${escritos.length === 0 ? '= sin cambios: no se escribió nada' : `✓ ${escritos.length} ${verbo}`}`);
  for (const ruta of escritos.filter((r) => !HUELLA_EN_NOMBRE.test(path.basename(r)))) {
    console.log(`    ${isDryRun ? '[dry-run] ' : ''}${path.relative(raiz, ruta)}`);
  }

  if (errores.length > 0) {
    throw new Error(
      `${framework}: lo publicado no cuadra por contenido:\n` +
        errores.map((e) => `  ✗ ${e}`).join('\n'),
    );
  }

  console.log(`  ✓ ${framework} ${version} — ${ficheros.length} ficheros por contenido + latest/huellas.json + import-map.json`);
}

async function main() {
  // ANTES de buscar el runtime: el destino se dice aunque después no haya nada que publicar.
  console.log(`Destino: ${CDN_ROOT} (${ORIGEN_DEL_DESTINO})`);
  const runtimes = await resolverRuntimes();

  for (const runtime of runtimes) {
    await publicarUno(runtime);
  }

  console.log(
    `\n  Done — ${runtimes.length} runtime(s): ` +
      `${runtimes.map((r) => `${r.framework}@${r.version}`).join(', ')}.`,
  );
  console.log(
    `  El CMS COMPONE los import maps de todos (ADR del compositor, #127): no se elige uno.\n`,
  );
}

try {
  await main();
} catch (err) {
  console.error('\n[publish-runtime]', err.message);
  process.exit(1);
}
