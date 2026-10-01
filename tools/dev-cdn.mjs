#!/usr/bin/env node
/**
 * dev-cdn — un CDN de verdad, servido desde el watch incremental (issue #2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA IDEA: EL SERVIDOR *ES* UN CDN, NO UN MODO ESPECIAL.
 *
 * El dev-cdn anterior (era de Nx) levantaba un proceso POR ELEMENTO y copiaba
 * `dist/` a la carpeta del CDN en cada recompilación. Dos problemas de fondo:
 * la copia se quedaba a medias sin avisar, y el CMS necesitaba saber qué puerto
 * servía qué elemento — para eso existía `__dev-servers.json`.
 *
 * Este sirve el layout COMPLETO del CDN en un solo origen, y eso hace
 * desaparecer el problema en vez de resolverlo: el CMS no necesita saber que
 * está en desarrollo. Se le apunta el cliente HTTP que YA TIENE y consume esto
 * exactamente igual que producción:
 *
 *     SYNERGOS_CDN_MODE=Http
 *     SYNERGOS_CDN_URL=http://localhost:4321
 *
 * Cero código de desarrollo en el CMS. Es lo que el ADR 0132 dejó preparado sin
 * que nadie lo notara.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   npm run dev:cdn                        # los 139 elementos
 *   npm run dev:cdn -- --solo=badge,hero   # sólo esos (arranca en segundos)
 *   npm run dev:cdn -- --puerto 5000
 *   npm run dev:cdn -- --sin-livereload
 *
 * Se para con Ctrl-C. Es UN proceso: no hay registro de servidores que limpiar
 * ni señal de parada que dejar en el disco.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getArg } from './lib/cli-utils.mjs';
import { PLATFORMS, loadRegistry, loadInputs, readPackageVersion } from './lib/synergos-config.mjs';
import { buildContracts } from './lib/manifest-builder.mjs';
import { LIVERELOAD_CLIENT_JS } from './lib/livereload.mjs';
import { paginaDelBanco } from './lib/banco-de-pruebas.mjs';
import { lanzarNpm } from './lib/npm.mjs';
import { ficherosDelRuntime } from './lib/mapa-del-runtime.mjs';
import {
  arrancarRuntimeDeDesarrollo, huellaDeEntradas, runtimeCompleto,
} from './lib/runtime-en-desarrollo.mjs';
import {
  resolverRuta, cabecerasDev, tipoDe, registryDeDesarrollo,
} from './lib/dev-cdn-routes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Qué plataforma sirve este servidor (issue #44) ───────────────────────────
//
// Este servidor sirve UNA: traduce la ruta y lee de SU `dist/`. Con una sola
// plataforma declarada, ésa es; con dos habría que elegir, y elegir en silencio
// sería servir el bundle de una bajo el segmento de la otra — peor que un 404,
// porque el CMS lo hidrataría creyendo que es de la que pidió.
const FRAMEWORK = getArg('framework', null) ?? (PLATFORMS.length === 1 ? PLATFORMS[0].name : null);
if (!FRAMEWORK || !PLATFORMS.some((p) => p.name === FRAMEWORK)) {
  console.error(
    `[dev-cdn] hay ${PLATFORMS.length} plataformas (${PLATFORMS.map((p) => p.name).join(', ')}): ` +
      `decí cuál servir con --framework=<nombre>.`,
  );
  process.exit(2);
}

const PLATAFORMA = PLATFORMS.find((p) => p.name === FRAMEWORK);
const NG = join(ROOT, 'platforms', FRAMEWORK);

// Los elementos y el runtime salen a sitios DISTINTOS, y hace falta saberlo:
// `build.mjs` escribe en `platforms/<framework>/dist/<elemento>/browser/`, y
// `build-runtime.mjs` en `<raíz>/dist/runtime/<framework>/<versión>/`. Darlo por
// hecho al revés produce un 404 del runtime y elementos que cargan y se rompen
// al arrancar, con un error que habla de módulos.
const DIST = join(NG, 'dist');
const DIST_RUNTIME = join(ROOT, 'dist', 'runtime', FRAMEWORK);

const PUERTO = Number(getArg('puerto', 4321));
const SOLO = getArg('solo', null);
const LIVERELOAD = !process.argv.includes('--sin-livereload');
const VERSION = readPackageVersion();

const log = (m) => console.log(`[dev-cdn] ${m}`);

// El latido del livereload vive en MEMORIA, no en un fichero. El mecanismo
// viejo escribía `__dev.json` en la carpeta del CDN; con un servidor de verdad
// eso sobra, y un fichero menos es un fichero que no se queda huérfano cuando
// el proceso muere mal.
let latido = Date.now();

const FICHEROS_DEL_RUNTIME = ficherosDelRuntime(FRAMEWORK);
const estaEntero = (dir) =>
  runtimeCompleto({ dir, ficheros: FICHEROS_DEL_RUNTIME, existe: existsSync, unir: join });

/**
 * La carpeta del runtime compilado, leída del disco y no cableada a una versión — y
 * ENTERA: una carpeta de versión vacía no es un runtime (#88). `build-runtime` la crea
 * antes de mirar sus entradas, así que un intento fallido la dejaba vacía y la corrida
 * siguiente la servía: el banco montaba y `sg-core.js` contestaba 404.
 */
function runtimeDir() {
  if (!existsSync(DIST_RUNTIME)) return null;
  const ver = readdirSync(DIST_RUNTIME)
    .filter((d) => /^\d+\.\d+\.\d+/.test(d))
    .find((d) => estaEntero(join(DIST_RUNTIME, d)));
  return ver ? join(DIST_RUNTIME, ver) : null;
}

// ── El build, y el runtime DESPUÉS ───────────────────────────────────────────
//
// El build no se reimplementa: se lanza `tools/build.mjs --watch`, que ya
// recompila incremental reusando el programa de ngtsc. Su salida va tal cual a la
// terminal — quien mira quiere ver los errores de compilación, no un resumen que
// se los coma.
//
// El runtime NO lo compila el build: es otro script. Y se arma con lo que el build
// deja en `dist/libs/` —por eso va DESPUÉS, nunca antes—. Este fichero lo construía
// antes de lanzar el build, así que en un árbol sin `dist/` moría con «sg-core.js
// not found» (#88). Hoy el build avisa por IPC cada vez que termina y
// `runtime-en-desarrollo.mjs` decide: construirlo si falta, rehacerlo si cambió el
// CONTENIDO de sus entradas, y no perder un build que llega mientras se construye.
//
// Y la otra mitad del mismo eslabón: tocar `libs/` NO cambia ningún bundle.
// `@synergos/core` y `@synergos/shared` son EXTERNALS (cdn.config.mjs): viven en el
// runtime y los resuelve el import map. Sin rehacer el runtime, editar el design
// system recompila, el navegador recarga y todo sigue igual — con el build diciendo
// «✓ al día». Cuesta ~3,4 s y sólo se paga cuando una lib cambia de verdad.
const ENTRADAS_DEL_RUNTIME = [join(DIST, 'libs', 'sg-core.js'), join(DIST, 'libs', 'sg-shared.js')];

/** `build-runtime`, por el lanzador (#79). Resuelve `true` si salió 0. */
function construirRuntime() {
  return new Promise((resolver) => {
    // Sin el oyente de `error`, un npm que no arranca tumbaba el servidor (#79).
    const p = lanzarNpm(['run', 'build:runtime'], { cwd: ROOT });
    p.on('error', (error) => {
      console.error(`[dev-cdn] ✗ no se pudo lanzar npm para construir el runtime: ${error.message}`);
      resolver(false);
    });
    p.on('exit', (code) => resolver(code === 0));
  });
}

const recargar = () => {
  latido = Date.now();
  log('recargando el navegador');
};

/** Lo que hay que hacer cada vez que un build termina. */
async function alTerminarUnBuild(trasUnBuild) {
  const resultado = await trasUnBuild();
  // Con el runtime caído no se recarga: un runtime viejo sirviendo es mejor que nada
  // mientras se arregla el error que lo causó. Y 'en-curso' recarga quien construye.
  if (resultado !== 'fallo' && resultado !== 'en-curso') recargar();
}

const argsBuild = ['tools/build.mjs', '--watch', ...(SOLO ? [`--solo=${SOLO}`] : [])];
log(`compilando${SOLO ? ` (sólo ${SOLO})` : ''} — el runtime se construye cuando termine…`);

let build;
arrancarRuntimeDeDesarrollo({
  lanzarBuild: (trasUnBuild) => {
    // El cuarto canal es el IPC: `build.mjs` manda `{ evento: 'dist-listo' }` al
    // terminar cada build. Un build sin watch (la plataforma que no lo tiene) no
    // manda nada y sale 0: ese final cuenta como su único build.
    build = spawn(process.execPath, argsBuild, { cwd: NG, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
    build.on('message', (m) => {
      if (m?.evento === 'dist-listo') void alTerminarUnBuild(trasUnBuild);
    });
    build.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[dev-cdn] ✗ el build murió (código ${code}). Sin él no hay nada que servir.`);
        process.exit(code ?? 1);
      }
      void alTerminarUnBuild(trasUnBuild);
    });
  },
  estaCompleto: () => runtimeDir() !== null,
  huellaDeLasEntradas: () =>
    huellaDeEntradas(ENTRADAS_DEL_RUNTIME, { existe: existsSync, leer: (p) => readFileSync(p) }),
  construir: construirRuntime,
  avisar: log,
});

// ── Lo que se está sirviendo ─────────────────────────────────────────────────
//
// `--solo` MANDA sobre lo que hay en el disco. `dist/` conserva lo de builds
// anteriores, así que sin este filtro un `--solo=badge,hero` anunciaría los 139
// y el CMS hidrataría 137 bundles de antigüedad desconocida — código viejo con
// cara de nuevo, que es peor que un 404 porque no se investiga.
const soloEstos = SOLO ? new Set(SOLO.split(',').map((s) => s.trim())) : null;
const seSirve = (elemento) =>
  (!soloEstos || soloEstos.has(elemento)) && existsSync(join(DIST, elemento, 'browser', 'main.js'));

// ── El servidor ──────────────────────────────────────────────────────────────

function responder(res, estado, cuerpo, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(estado, cabecerasDev(contentType));
  res.end(cuerpo);
}

function servirFichero(res, ruta) {
  if (!existsSync(ruta)) {
    // Un 404 explícito y NO el bundle de antes: si algo no está compilado, hay
    // que enterarse ahora y no cuando se publique.
    return responder(res, 404, `no compilado: ${ruta.replace(ROOT, '')}\n`);
  }

  let cuerpo = readFileSync(ruta);

  // El cliente de livereload se inyecta al vuelo, sólo en el bundle. NO toca el
  // fichero del disco: lo que se publica nunca lleva esto dentro.
  if (LIVERELOAD && ruta.endsWith('main.js')) {
    cuerpo = Buffer.concat([cuerpo, Buffer.from(`\n${LIVERELOAD_CLIENT_JS}`)]);
  }

  res.writeHead(200, cabecerasDev(tipoDe(ruta)));
  res.end(cuerpo);
}

const servidor = createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PUERTO}`);
  const r = resolverRuta(pathname, FRAMEWORK);

  switch (r.tipo) {
    case 'catalogo': {
      const cat = join(ROOT, 'catalog.html');
      return existsSync(cat)
        ? servirFichero(res, cat)
        : responder(res, 200, 'dev-cdn en marcha. El catálogo no está en el repo.\n');
    }

    case 'banco': {
      // El índice: qué se puede probar. Sale de lo que este servidor SIRVE de
      // verdad —`seSirve` mira `dist/`— y no del registry entero: ofrecer un
      // enlace a un elemento que no está compilado daría una página en blanco
      // sin decir por qué, que es el modo de fallo que este banco viene a cerrar.
      if (!r.elemento) {
        const servibles = loadRegistry().filter((e) => seSirve(e.name));
        const filas = servibles
          .map((e) => `<li><a href="/probar/${e.name}"><code>${e.tag}</code></a></li>`)
          .join('\n');
        return responder(res, 200, `<!DOCTYPE html><meta charset="utf-8">
<title>banco · qué se puede probar</title>
<style>body{margin:2rem;font:14px/1.6 system-ui,sans-serif}li{margin:.15rem 0}</style>
<h1>Banco de pruebas</h1>
<p>${servibles.length} elemento(s) compilado(s) en <code>dist/</code>.
${servibles.length === 0 ? `Ninguno: corré <code>npm run build:${FRAMEWORK}</code>.` : ''}</p>
<ul>${filas}</ul>`, tipoDe('.html'));
      }

      const entrada = loadRegistry().find((e) => e.name === r.elemento);
      if (!entrada) return responder(res, 404, `«${r.elemento}» no está en el registry\n`);
      if (!seSirve(entrada.name)) {
        return responder(res, 404,
          `«${entrada.name}» está en el registry y NO está compilado en dist/. `
          + `Corré: node tools/build.mjs --solo=${entrada.name}\n`);
      }

      const dirRuntime = runtimeDir();
      const rutaMapa = dirRuntime ? join(dirRuntime, 'import-map.json') : null;
      let importMap = null;
      if (rutaMapa && existsSync(rutaMapa)) {
        try { importMap = JSON.parse(readFileSync(rutaMapa, 'utf-8')); } catch { importMap = null; }
      }

      return responder(res, 200, paginaDelBanco({
        elemento: entrada.name,
        tag: entrada.tag,
        framework: FRAMEWORK,
        importMap,
        inputs: loadInputs()[entrada.name] ?? [],
        // El nombre del atributo lo decide la plataforma, no el banco (#88).
        atributoDeInput: PLATAFORMA.atributoDeInput,
      }), tipoDe('.html'));
    }

    case 'registry': {
      const cuerpo = registryDeDesarrollo(loadRegistry(), seSirve, VERSION, FRAMEWORK);
      return responder(res, 200, JSON.stringify(cuerpo, null, 2), tipoDe('.json'));
    }

    case 'contratos': {
      const cuerpo = buildContracts(loadRegistry(), loadInputs(), VERSION);
      return responder(res, 200, JSON.stringify(cuerpo, null, 2), tipoDe('.json'));
    }

    case 'senal':
      return responder(res, 200, JSON.stringify({ ts: latido }), tipoDe('.json'));

    case 'elemento':
      return servirFichero(res, join(DIST, r.elemento, 'browser', r.fichero));

    case 'runtime': {
      const dir = runtimeDir();
      if (!dir) return responder(res, 404, 'el runtime no está compilado todavía\n');
      return servirFichero(res, join(dir, r.fichero));
    }

    default:
      return responder(res, 404, `sin ruta: ${pathname}\n`);
  }
});

servidor.listen(PUERTO, () => {
  log(`sirviendo en http://localhost:${PUERTO}`);
  log(`  registry  → http://localhost:${PUERTO}/synergos/registry.json`);
  log(`  livereload ${LIVERELOAD ? 'activo' : 'desactivado'}`);
  log('');
  log('  Para que el CMS consuma esto, en su .env:');
  log('    SYNERGOS_CDN_MODE=Http');
  log(`    SYNERGOS_CDN_URL=http://localhost:${PUERTO}`);
  log('');
  log('  Ctrl-C para parar.');
});

// El build es hijo de este proceso: si esto se va, se va con él. Sin esto queda
// un ngtsc en watch comiendo CPU que nadie sabe de dónde salió.
const parar = () => {
  build.kill('SIGTERM');
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
