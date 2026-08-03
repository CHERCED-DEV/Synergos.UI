#!/usr/bin/env node
/**
 * Arma el directorio que Cloudflare va a servir como CDN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO NO PUBLICA NADA NUEVO — LE CAMBIA EL DESTINO A LO QUE YA HABÍA.
 *
 * `publish.mjs` lleva tiempo publicando la estructura completa del CDN
 * —elementos por framework, tres slots de versión, `registry.json` global— a
 * una carpeta LOCAL de la máquina del arquitecto (`SYNERGOS_CDN`, típicamente
 * `C:\LOCAL_CDN`). Funcionaba, y por eso nadie notó que faltaba el último
 * tramo: que esa carpeta fuera alcanzable desde internet.
 *
 * Del otro lado, el CMS seguía con `StubBundleRegistryClient` —devuelve null
 * siempre— y los 71 `elementSyn*` emitiendo un comentario HTML de relleno,
 * anotado como «bloqueado externamente, esperando al equipo del CDN».
 *
 *   > El equipo del CDN somos nosotros. Este fichero es el último tramo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   node tools/build-cdn.mjs
 *   node tools/build-cdn.mjs --salida public
 */
import { rm, mkdir, copyFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argSalida = process.argv.indexOf('--salida');
const SALIDA = resolve(ROOT, argSalida > -1 ? process.argv[argSalida + 1] : 'public');

const log = (m) => console.log(`[build-cdn] ${m}`);

async function existe(p) {
  try { await access(p); return true; } catch { return false; }
}

// ── 1. Empezar de cero ───────────────────────────────────────────────────────
//
// Sin esto, un elemento que se borra del registry se queda publicado para
// siempre: nadie lo referencia, nadie lo actualiza, y sigue ahí sirviendo una
// versión que ya no existe en el repo. Un CDN que acumula huérfanos es un CDN
// del que nadie puede decir qué contiene.
log(`limpiando ${SALIDA}`);
await rm(SALIDA, { recursive: true, force: true });
await mkdir(SALIDA, { recursive: true });

// ── 2. Publicar con la herramienta de siempre ────────────────────────────────
//
// `--cdn` es el parámetro que `publish.mjs` ya aceptaba. Todo lo que hace este
// script es dárselo apuntando adentro del repo en vez de a una carpeta de
// Windows.
log('publicando elementos y registry…');
execFileSync('node', [join(ROOT, 'tools', 'publish.mjs'), '--cdn', SALIDA], {
  cwd: ROOT,
  stdio: 'inherit',
});

// ── 3. El runtime compartido, con URLs RELATIVAS ─────────────────────────────
//
// Los elementos Angular lo necesitan; sin él cargan y se rompen al arrancar,
// con un error que habla de módulos y no dice "falta el runtime".
//
// `--base=/synergos` es lo que hace portátil el despliegue. Sin él, el
// import-map sale con el origen cableado —`https://synergos-static-local/…`,
// el CDN local de la máquina del arquitecto— y publicado en internet apunta a
// un host que no existe: los bundles cargan y el navegador no encuentra sus
// dependencias.
//
// Con base relativa, el mismo artefacto sirve en `workers.dev`, en el dominio
// propio y en local. Y desaparece el problema del huevo y la gallina del
// primer despliegue: no hay que saber la URL final para poder construir.
//
// El `registry.json` que produce `publish.mjs` ya era relativo (`baseUrl:
// "/synergos"`). Esto pone al runtime en la misma política.
if (await existe(join(ROOT, 'tools', 'publish-runtime.mjs'))) {
  log('publicando runtime (base relativa)…');
  execFileSync(
    'node',
    // OJO: `--cdn=` con signo igual. `publish-runtime.mjs` lo lee con
    // `slice('--cdn='.length)`, así que la forma de dos argumentos —que sí
    // acepta `publish.mjs`— cae al default de Windows (`C:\LOCAL_CDN`) y en
    // Linux crea una carpeta con ese nombre literal. No falla: publica en el
    // sitio equivocado, y el runtime simplemente no aparece.
    [join(ROOT, 'tools', 'publish-runtime.mjs'), `--cdn=${SALIDA}`, '--base=/synergos'],
    { cwd: ROOT, stdio: 'inherit' },
  );
}

// ── 4. La vitrina ────────────────────────────────────────────────────────────
//
// `catalog.html` es lo ÚNICO visitable de este despliegue: el resto son
// ficheros que consume otro programa. Va como index para que la URL desnuda
// muestre algo en vez de un 404 — que es lo que uno abre primero para
// comprobar que el despliegue salió.
if (await existe(join(ROOT, 'catalog.html'))) {
  log('copiando el catálogo como index.html');
  await copyFile(join(ROOT, 'catalog.html'), join(SALIDA, 'index.html'));
}

// ── 5. Verificar que hay algo ────────────────────────────────────────────────
//
// Un despliegue vacío es peor que uno fallido: Cloudflare lo publica contento,
// la URL responde 404 a todo, y el CMS empieza a no encontrar sus elementos
// sin que nada se haya puesto rojo.
const registry = join(SALIDA, 'synergos', 'registry.json');
if (!(await existe(registry))) {
  console.error(`[build-cdn] ✗ no se generó ${registry}. El despliegue estaría vacío.`);
  process.exit(1);
}

log(`✓ listo en ${SALIDA}`);
