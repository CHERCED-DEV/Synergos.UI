#!/usr/bin/env node
/**
 * El build de los elementos Synergos — compilador UNA vez, esbuild para todos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE: el build anterior tardaba minutos en compilar envoltorios
 * de 2 KB.
 *
 * Con Nx, cada uno de los 136 elementos era una "application" independiente:
 * 136 arranques del compilador de Angular, 136 type-checks del MISMO grafo de
 * libs, con el caché de Nx además deshabilitado (`cache: false` +
 * `--skip-nx-cache`, o sea que Nx solo aportaba `--parallel=6`). El trabajo
 * real —compilar ~625 ficheros TS— es de segundos; lo que se pagaba era el
 * arranque multiplicado.
 *
 * Este script invierte la ecuación:
 *
 *   1. UNA pasada de sass sobre los estilos (bajo demanda, vía el host)
 *   2. UN NgtscProgram con los 136 main.ts + las libs → un solo type-check,
 *      una sola compilación de templates, AOT COMPLETO (adiós declaraciones
 *      parciales de ng-packagr y su compilación JIT en el navegador)
 *   3. UN esbuild con 136 entradas → dist/<nombre>/browser/main.js, los
 *      externals del cdn.config como bare imports para el import-map
 *
 * El layout de salida es IDÉNTICO al del build viejo a propósito:
 * `tools/publish.mjs` y todo lo que viene después no se enteran del cambio.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   node tools/build.mjs              build completo
 *   node tools/build.mjs --watch      recompila incremental al guardar
 *   node tools/build.mjs --solo=badge,hero    solo esos elementos (dev)
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, watch } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { EXTERNALS, ANGULAR_EXTERNALS, BUNDLED_SYNERGOS } from '../cdn.config.mjs';
// El compilador y su configuración viven en tools/ngtsc.mjs desde que
// `build-specs.mjs` pasó a necesitar EXACTAMENTE los mismos: si los tests
// compilaran con reglas distintas de las de producción, un test verde no diría
// nada del artefacto que se publica. Ver la cabecera de ese fichero.
import {
  NG_DIR, REPO, requireLocal, ts,
  opcionesTs as opcionesTsBase, crearHost, hostDiag, analizar,
} from './ngtsc.mjs';

const OUT_TSC = path.join(NG_DIR, '.cdn-out');           // TS compilado (intermedio)
const DIST = path.join(NG_DIR, 'dist');

const esbuild = requireLocal('esbuild');

const WATCH = process.argv.includes('--watch');
const soloArg = process.argv.find((a) => a.startsWith('--solo='));
const SOLO = soloArg ? soloArg.slice('--solo='.length).split(',') : null;

const t0 = Date.now();
const log = (m) => console.log(`[build] ${(Date.now() - t0) / 1000 | 0}s  ${m}`);

// ── 1. Descubrir los elementos ───────────────────────────────────────────────
//
// La fuente de verdad es el FILESYSTEM: cada carpeta bajo apps/ con un
// src/main.ts es un elemento, y su nombre de carpeta es su nombre en dist/.
// Se verificó contra los 136 project.json antes de borrarlos: outputPath era
// `dist/<nombre-de-carpeta>` en el 100% de los casos. Una lista escrita a
// mano se desincroniza; el disco no.
function descubrir() {
  const apps = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      const main = path.join(full, 'src/main.ts');
      if (existsSync(main)) {
        apps.push({ nombre: e.name, main });
      } else {
        walk(full);
      }
    }
  };
  walk(path.join(NG_DIR, 'apps'));

  const nombres = new Map();
  for (const a of apps) {
    if (nombres.has(a.nombre)) {
      // Dos carpetas con el mismo nombre pisarían el mismo dist/<nombre> y el
      // CDN publicaría una u otra según el orden del disco. Mejor no construir.
      throw new Error(`Dos elementos se llaman '${a.nombre}':\n  ${nombres.get(a.nombre)}\n  ${a.main}`);
    }
    nombres.set(a.nombre, a.main);
  }
  return apps.sort((x, y) => x.nombre.localeCompare(y.nombre));
}

// ── 2. El compilador de Angular, una vez ─────────────────────────────────────

const LIB_ENTRIES = {
  core: path.join(NG_DIR, 'libs/core/src/index.ts'),
  shared: path.join(NG_DIR, 'libs/shared/src/index.ts'),
};

const opcionesTs = () => opcionesTsBase(OUT_TSC);

/** Dónde queda el JS emitido de un fuente TS. */
const emitido = (src) =>
  path.join(OUT_TSC, path.relative(REPO, src)).replace(/\.ts$/, '.js');

async function compilar(apps, oldProgram) {
  const rootNames = [...apps.map((a) => a.main), ...Object.values(LIB_ENTRIES)];
  const options = opcionesTs();
  const host = crearHost(options);

  const { program, emitir } = await analizar(rootNames, options, host, oldProgram);
  emitir((fileName, text) => {
    mkdirSync(path.dirname(fileName), { recursive: true });
    writeFileSync(fileName, text);
  });

  return program;
}

// Los JSON que los contratos importan (element-registry.json vía
// resolveJsonModule) no los emite tsc: el JS emitido los importa por ruta
// relativa, así que se copian espejados al intermedio o esbuild no los halla.
//
// Y el package.json del intermedio declara `sideEffects: false` para TODO el
// árbol compilado. No es un ajuste de tamaño menor: ng-packagr lo declaraba en
// las libs publicadas y al compilar desde fuente se perdía — sin él, esbuild
// no poda los barrels y storefront pasaba de 287 KB a 712 KB. Es seguro por la
// misma razón por la que lo era con ng-packagr: un componente AOT no hace nada
// al importarse, solo al usarse.
function copiarJson() {
  mkdirSync(OUT_TSC, { recursive: true });
  writeFileSync(path.join(OUT_TSC, 'package.json'),
    JSON.stringify({ type: 'module', sideEffects: false }, null, 2));
  for (const rel of ['vitals/contracts/src', 'vitals/core/src']) {
    const dir = path.join(REPO, rel);
    if (!existsSync(dir)) continue;
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.json')) {
          const destino = path.join(OUT_TSC, path.relative(REPO, full));
          mkdirSync(path.dirname(destino), { recursive: true });
          cpSync(full, destino);
        }
      }
    };
    walk(dir);
  }
}

// ── 3. esbuild: 136 bundles + las dos libs del runtime ───────────────────────

// Los @synergos que SÍ se empaquetan resuelven al intermedio compilado. Los
// externos (core/shared) NO se alias-ean a propósito: esbuild aplica alias
// ANTES que external, y un alias los sacaría de la lista y los empaquetaría —
// exactamente lo que no puede pasar.
function aliasComunes() {
  const alias = {
    '@synergos/contracts': emitido(path.join(REPO, 'vitals/contracts/src/index.ts')),
    '@synergos/vitals-core': emitido(path.join(REPO, 'vitals/core/src/index.ts')),
  };
  for (const lib of BUNDLED_SYNERGOS) {
    alias[`@synergos/${lib}`] = emitido(path.join(NG_DIR, `libs/${lib}/src/index.ts`));
  }
  return alias;
}

async function empaquetar(apps) {
  const entryPoints = {};
  for (const a of apps) {
    entryPoints[`${a.nombre}/browser/main`] = emitido(a.main);
  }

  await esbuild.build({
    entryPoints,
    outdir: DIST,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    splitting: false,        // cada elemento autocontenido — es el contrato del CDN
    // Angular de producción DE VERDAD. Sin esto, cada bundle carga los
    // contadores y chequeos de dev — el builder oficial lo define igual.
    define: { ngDevMode: 'false' },
    external: EXTERNALS,
    alias: aliasComunes(),
    logLevel: 'warning',
  });

  // Las dos libs compartidas del import-map. Salen de la MISMA compilación
  // AOT completa que los elementos: se acabaron las declaraciones parciales
  // de ng-packagr que el navegador tenía que terminar de compilar en runtime.
  // sg-shared deja @synergos/core como bare import (lo resuelve el import-map).
  await esbuild.build({
    entryPoints: { 'libs/sg-core': emitido(LIB_ENTRIES.core) },
    outdir: DIST,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    define: { ngDevMode: 'false' },
    external: ANGULAR_EXTERNALS,
    alias: aliasComunes(),
    logLevel: 'warning',
  });
  await esbuild.build({
    entryPoints: { 'libs/sg-shared': emitido(LIB_ENTRIES.shared) },
    outdir: DIST,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    define: { ngDevMode: 'false' },
    external: [...ANGULAR_EXTERNALS, '@synergos/core'],
    alias: aliasComunes(),
    logLevel: 'warning',
  });
}

// ── 4. El lazo ───────────────────────────────────────────────────────────────

async function construir(oldProgram) {
  let apps = descubrir();
  if (SOLO) {
    apps = apps.filter((a) => SOLO.includes(a.nombre));
    if (apps.length === 0) throw new Error(`--solo no encontró: ${SOLO.join(', ')}`);
  }
  log(`${apps.length} elementos + libs {${Object.keys(LIB_ENTRIES).join(', ')}}`);

  const program = await compilar(apps, oldProgram);
  log('compilado (AOT completo, un solo programa)');

  copiarJson();
  await empaquetar(apps);
  log(`dist listo → ${path.relative(REPO, DIST)}/<nombre>/browser/main.js`);
  return program;
}

let programa = await construir();

if (WATCH) {
  // Recompilación incremental: el programa viejo se reusa, así que el segundo
  // build paga solo lo que cambió. El debounce agrupa el guardado en ráfaga
  // de los editores.
  let timer = null;
  let corriendo = false;
  const recompilar = () => {
    if (corriendo) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      corriendo = true;
      try {
        programa = await construir(programa);
        console.log('[build] ✓ al día\n');
      } catch (e) {
        console.error(`[build] ✗ ${e.message}\n`);
      } finally {
        corriendo = false;
      }
    }, 150);
  };

  for (const dir of ['apps', 'libs']) {
    watch(path.join(NG_DIR, dir), { recursive: true }, recompilar);
  }
  watch(path.join(REPO, 'vitals'), { recursive: true }, recompilar);
  console.log('[build] mirando apps/, libs/ y vitals/ — Ctrl-C para salir');
} else {
  log('hecho');
}
