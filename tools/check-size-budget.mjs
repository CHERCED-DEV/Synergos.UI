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
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { revisarBundle, explicar } from './lib/cdn-size-budget.mjs';
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

// ── Medir ────────────────────────────────────────────────────────────────────
const medidos = [];
for (const d of readdirSync(CDN, { withFileTypes: true })) {
  // `runtime/` es el paquete compartido, no un elemento: no tiene tier, no
  // tiene techo y pesa lo que pesa Angular a propósito.
  if (!d.isDirectory() || d.name === 'runtime') continue;

  const bundle = join(CDN, d.name, 'angular', 'latest', 'main.js');
  if (!existsSync(bundle)) continue;

  const codigo = readFileSync(bundle, 'utf8');
  medidos.push({
    nombre: d.name,
    tier: tierPorNombre.get(d.name) ?? 'desconocido',
    bytes: statSync(bundle).size,
    // Se registra el gzip aunque el gate NO lo mire: es lo que paga el
    // visitante, y tenerlo escrito permite discutir con datos el día que
    // alguien proponga juzgar por ahí.
    gzip: gzipSync(codigo).length,
    codigo,
  });
}

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
  revisarBundle({ ...m, base: ACTUALIZAR ? null : (previo.get(m.nombre)?.bytes ?? null) }),
);
const rotos = veredictos.filter((v) => !v.ok);

if (ACTUALIZAR) {
  const elementos = {};
  for (const m of [...medidos].sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    elementos[m.nombre] = { tier: m.tier, bytes: m.bytes, gzip: m.gzip };
  }
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ medido: new Date().toISOString().slice(0, 10), nota: 'Registro, NO gate. El gate son los techos por tier de tools/lib/cdn-size-budget.mjs.', elementos }, null, 2)}\n`,
  );
  log(`línea base reescrita: ${medidos.length} elementos → ${BASELINE}`);
}

// Sólo se reporta lo que se movió de verdad. Un ±0,5% en 139 elementos es un
// muro de ruido que nadie lee, y el gate deja de mirarse entero.
const UMBRAL_RUIDO = 0.05;
const movidos = medidos
  .map((m) => {
    const antes = previo.get(m.nombre);
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

log(`${medidos.length} elementos · ${kb(totalRaw)} sin comprimir · ${kb(totalGz)} gzip`);

if (base && movidos.length > 0) {
  log(`movimientos desde la línea base del ${base.medido} (±${UMBRAL_RUIDO * 100}%):`);
  for (const m of movidos.slice(0, 20)) {
    const signo = m.nuevo
      ? 'NUEVO'
      : `${m.delta > 0 ? '+' : ''}${(m.delta * 100).toFixed(1)}%  ${kb(m.antes)} → ${kb(m.bytes)}`;
    log(`    ${m.nombre.padEnd(24)} ${signo}`);
  }
  if (movidos.length > 20) log(`    …y ${movidos.length - 20} más`);
} else if (base) {
  log(`sin movimientos sobre la línea base del ${base.medido}`);
}

if (rotos.length === 0) {
  log(`✓ todos dentro de presupuesto`);
  process.exit(0);
}

err('');
err(`✗ ${rotos.length} elemento(s) fuera de presupuesto:`);
err('');
for (const v of rotos) {
  for (const linea of explicar(v)) err(`  ${linea}`);
  err('');
}
err('Si el crecimiento es legítimo, la excepción se escribe —con su razón— en');
err('EXCEPCIONES de tools/lib/cdn-size-budget.mjs. Subir un techo por tier');
err('afecta a los 139 elementos y necesita mejor argumento que uno solo.');
process.exit(1);
