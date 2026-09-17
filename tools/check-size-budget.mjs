#!/usr/bin/env node
/**
 * El presupuesto de tamaño de lo publicado (issue #8).
 *
 *   node tools/check-size-budget.mjs                 # sobre public/
 *   node tools/check-size-budget.mjs --cdn otra/     # sobre otra salida
 *   node tools/check-size-budget.mjs --update        # reescribe la línea base
 *
 * Corre al final de `npm run build:cdn`, que es el único momento en que existe
 * lo que hay que medir: el bundle **publicado**, no las fuentes.
 *
 * La regla y su porqué viven en `tools/lib/cdn-size-budget.mjs`. Acá sólo se
 * recorre el disco, se mide y se imprime.
 *
 * QUÉ SE MIDE, Y POR QUÉ YA NO DICE `angular` (issue #44). Hasta esta HU el
 * gate pedía `<elemento>/angular/latest/main.js` y hacía
 * `if (!existsSync(bundle)) continue;`. Un bundle de React no es que se pasara
 * del techo: es que **nadie lo medía**, y el gate salía verde. Hoy se RECORRE
 * el árbol publicado —`tools/lib/frameworks.mjs`—, que es lo único capaz de
 * encontrar un framework que nadie escribió en ningún sitio.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { revisarBundle, explicar,
  revisarMigradosAlRuntime,
} from './lib/cdn-size-budget.mjs';
import { frameworksConstruibles, recorrerPublicado } from './lib/frameworks.mjs';
import { getArg } from './lib/cli-utils.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = resolve(ROOT, getArg('cdn', 'public'));
const CDN = join(SALIDA, 'synergos');
const BASELINE = join(ROOT, 'tools', 'cdn-size-baseline.json');
const ACTUALIZAR = process.argv.includes('--update');

const log = (m) => console.log(`[size-budget] ${m}`);
const err = (m) => console.error(`[size-budget] ${m}`);

// ── De dónde salen el tier y el nombre ───────────────────────────────────────
//
// Del registry FUENTE, no del publicado: el registry del CDN se reconstruye a
// veces desde los manifests y puede traer `tier: "unknown"`. Un gate que lee su
// propio subproducto no vigila nada.
const registryPath = join(ROOT, 'vitals', 'contracts', 'src', 'element-registry.json');
const registro = JSON.parse(readFileSync(registryPath, 'utf8'));
const tierPorNombre = new Map((registro.elements ?? registro).map((e) => [e.name, e.tier]));

if (!existsSync(CDN)) {
  err(`✗ no hay nada que medir en ${CDN}. Corré primero npm run build:cdn.`);
  process.exit(1);
}

// ── Qué frameworks hay ───────────────────────────────────────────────────────
//
// La lista se DERIVA del disco y no se escribe acá. La construible dice qué
// puede compilar este repo; lo publicado se RECORRE. Por qué son dos preguntas
// distintas está en la cabecera de `tools/lib/frameworks.mjs`.
const listarDirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

const construibles = frameworksConstruibles({ raiz: ROOT, listarDirs, existe: existsSync, unir: join });
if (construibles.length === 0) {
  err(`✗ no hay ninguna plataforma bajo ${join(ROOT, 'platforms')}: no hay con qué cruzar lo publicado.`);
  process.exit(1);
}

// ── Medir ────────────────────────────────────────────────────────────────────
const { bundles, frameworks, errores } = recorrerPublicado({
  raizCdn: CDN,
  construibles,
  listarDirs,
  existe: existsSync,
  unir: join,
});

// Estos NO son avisos. Un elemento sin ningún bundle es un publish a medias, y
// un framework publicado que nadie construye es un bundle que se sigue
// sirviendo y no se puede reconstruir. Los dos salían verdes antes de #44 — el
// primero porque un `continue` lo saltaba, el segundo porque nadie miraba ahí.
if (errores.length > 0) {
  err('');
  err(`✗ ${errores.length} problema(s) en el árbol publicado:`);
  err('');
  for (const e of errores) err(`  ${e}`);
  err('');
  process.exit(1);
}

const medidos = bundles.map(({ elemento, framework, ruta }) => {
  const codigo = readFileSync(ruta, 'utf8');
  return {
    nombre: elemento,
    framework,
    // La llave del registro lleva el framework: dos bundles del mismo elemento
    // son dos artefactos distintos y su historia de tamaño también.
    llave: `${elemento}/${framework}`,
    tier: tierPorNombre.get(elemento) ?? 'desconocido',
    bytes: statSync(ruta).size,
    // Se registra el gzip aunque el gate NO lo mire: es lo que paga el
    // visitante, y tenerlo escrito permite discutir con datos el día que
    // alguien proponga juzgar por ahí.
    gzip: gzipSync(codigo).length,
    codigo,
  };
});

if (medidos.length === 0) {
  err(`✗ ${CDN} existe pero no tiene ningún bundle publicado.`);
  process.exit(1);
}

// ── La memoria: cuánto pesaba esto la última vez ─────────────────────────────
const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const previo = new Map(Object.entries(base?.elementos ?? {}));

// ── Juzgar ───────────────────────────────────────────────────────────────────
//
// Con `--update` no se juzga contra la línea base: se está reescribiendo. El
// techo por tier sí sigue mandando — regenerar el registro nunca puede ser la
// forma de bendecir un elemento que se pasó del tope absoluto.
const veredictos = medidos.map((m) =>
  revisarBundle({ ...m, base: ACTUALIZAR ? null : (previo.get(m.llave)?.bytes ?? null) }),
);
const rotos = veredictos.filter((v) => !v.ok);

// ── Y el otro lado del mismo contrato: lo que se mudó al runtime ────────────
//
// `EXTERNALS_UNIVERSALES_POR_FRAMEWORK` dejó de exigirle `@angular/elements` a
// cada elemento porque #62 lo movió al runtime compartido. Si eso fuera todo,
// el gate habría quedado sin vigilar que nadie lo empaquete — más débil y con
// mejor cara. Acá se comprueba sobre el fichero que lo tiene ahora.
const frameworksPublicados = [...new Set(medidos.map((m) => m.framework))].filter(Boolean);
const erroresDeRuntime = frameworksPublicados.flatMap((framework) =>
  revisarMigradosAlRuntime(framework, (fichero) => {
    // `CDN` ya es `<salida>/synergos` (ver arriba). Poner el namespace otra vez
    // —lo que escribí primero— daba `…/synergos/synergos/runtime/…` y el gate
    // se puso rojo diciendo «no se encuentra sg-core.js». Falló A GRITOS en vez
    // de saltárselo, que es exactamente para lo que se escribió así (regla 25c):
    // con un `continue` habría informado «✓» sobre una comprobación que nunca
    // llegó a hacerse.
    const ruta = join(CDN, 'runtime', framework, 'latest', fichero);
    return existsSync(ruta) ? readFileSync(ruta, 'utf8') : null;
  }),
);

if (ACTUALIZAR) {
  const elementos = {};
  for (const m of [...medidos].sort((a, b) => a.llave.localeCompare(b.llave))) {
    elementos[m.llave] = { tier: m.tier, framework: m.framework, bytes: m.bytes, gzip: m.gzip };
  }
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ medido: new Date().toISOString().slice(0, 10), nota: 'Registro, NO gate. El gate son los techos por tier de tools/lib/cdn-size-budget.mjs.', elementos }, null, 2)}\n`,
  );
  log(`línea base reescrita: ${medidos.length} bundle(s) → ${BASELINE}`);
}

// Sólo se reporta lo que se movió de verdad. Un ±0,5% en 139 elementos es un
// muro de ruido que nadie lee, y el gate deja de mirarse entero.
const UMBRAL_RUIDO = 0.05;
const movidos = medidos
  .map((m) => {
    const antes = previo.get(m.llave);
    if (!antes) return { ...m, delta: null, nuevo: true };
    const delta = (m.bytes - antes.bytes) / antes.bytes;
    return { ...m, antes: antes.bytes, delta, nuevo: false };
  })
  .filter((m) => m.nuevo || Math.abs(m.delta) >= UMBRAL_RUIDO)
  .sort((a, b) => (b.delta ?? 1) - (a.delta ?? 1));

// ── Decir ────────────────────────────────────────────────────────────────────
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const totalRaw = medidos.reduce((s, m) => s + m.bytes, 0);
const totalGz = medidos.reduce((s, m) => s + m.gzip, 0);

log(
  `${medidos.length} bundle(s) · ${frameworks.length} framework(s) publicado(s) ` +
    `(${frameworks.join(', ')}) · ${kb(totalRaw)} sin comprimir · ${kb(totalGz)} gzip`,
);

if (base && movidos.length > 0) {
  log(`movimientos desde la línea base del ${base.medido} (±${UMBRAL_RUIDO * 100}%):`);
  for (const m of movidos.slice(0, 20)) {
    const signo = m.nuevo
      ? 'NUEVO'
      : `${m.delta > 0 ? '+' : ''}${(m.delta * 100).toFixed(1)}%  ${kb(m.antes)} → ${kb(m.bytes)}`;
    log(`    ${m.llave.padEnd(32)} ${signo}`);
  }
  if (movidos.length > 20) log(`    …y ${movidos.length - 20} más`);
} else if (base) {
  log(`sin movimientos sobre la línea base del ${base.medido}`);
}

if (erroresDeRuntime.length > 0) {
  err('');
  for (const linea of erroresDeRuntime) err(linea);
  err('');
}

if (rotos.length === 0 && erroresDeRuntime.length > 0) {
  process.exit(1);
}

if (rotos.length === 0) {
  log(`✓ todos dentro de presupuesto`);
  process.exit(0);
}

err('');
err(`✗ ${rotos.length} bundle(s) fuera de presupuesto:`);
err('');
for (const v of rotos) {
  for (const linea of explicar(v)) err(`  ${linea}`);
  err('');
}
err('Si el crecimiento es legítimo, la excepción se escribe —con su razón— en');
err('EXCEPCIONES de tools/lib/cdn-size-budget.mjs. Subir un techo por tier');
err('afecta a los 139 elementos y necesita mejor argumento que uno solo.');
process.exit(1);
