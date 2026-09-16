/**
 * publish-runtime.mjs
 *
 * Copies the pre-built Synergos shared runtime from dist/runtime/angular/{version}/
 * to the CDN directory and writes an import-map.json with the real CDN base URL.
 *
 * Usage:
 *   node tools/publish-runtime.mjs
 *   node tools/publish-runtime.mjs --cdn D:\MyCDN
 *   node tools/publish-runtime.mjs --base https://cdn.example.com/synergos
 *   node tools/publish-runtime.mjs --dry-run
 */

import { readdir, readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { ficherosDelRuntime, importsDelRuntime } from './lib/mapa-del-runtime.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

const isDryRun = process.argv.includes('--dry-run');
const cdnArg   = process.argv.find((a) => a.startsWith('--cdn='));
const baseArg  = process.argv.find((a) => a.startsWith('--base='));

const CDN_ROOT  = cdnArg
  ? cdnArg.slice('--cdn='.length)
  : (process.env.SYNERGOS_CDN || String.raw`C:\LOCAL_CDN`);

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
  const RUNTIME_FILES = ficherosDelRuntime(framework);

  const cdnVersionedDir = path.join(CDN_ROOT, 'synergos', 'runtime', framework, version);
  const cdnLatestDir    = path.join(CDN_ROOT, 'synergos', 'runtime', framework, 'latest');

  const base = baseArg
    ? `${baseArg.slice('--base='.length).replace(/\/$/, '')}/runtime/${framework}/${version}`
    : `${CDN_ORIGIN}/synergos/runtime/${framework}/${version}`;

  console.log(`\nSynergos Runtime Publish — ${framework}${isDryRun ? ' (dry-run)' : ''}`);
  console.log(`  Source  : dist/runtime/${framework}/${version}/`);
  console.log(`  CDN     : ${cdnVersionedDir}`);
  console.log(`  Latest  : ${cdnLatestDir}`);
  console.log('─'.repeat(72));

  for (const file of RUNTIME_FILES) {
    const src = path.join(dir, file);
    try {
      await stat(src);
    } catch {
      // ⚠ Esto era `console.warn` + `continue`, o sea publicar un runtime
      // INCOMPLETO informando «Done». Un fichero que la tabla declara y el
      // build no produjo deja un bare import sin resolver, que es 200 y nada
      // hidrata. Lo que no se puede copiar se rechaza, no se salta (regla 25c).
      throw new Error(
        `[publish-runtime] ${framework}: la tabla declara ${file} y no está en ` +
        `dist/runtime/${framework}/${version}/.\n` +
        `  → O lo produce el build de esa plataforma, o sobra en FICHEROS_POR_FRAMEWORK.`,
      );
    }

    if (isDryRun) {
      console.log(`  [dry-run] ${file} → ${cdnVersionedDir}/${file}`);
    } else {
      await mkdir(cdnVersionedDir, { recursive: true });
      await mkdir(cdnLatestDir,    { recursive: true });
      await copyFile(src, path.join(cdnVersionedDir, file));
      await copyFile(src, path.join(cdnLatestDir,    file));
      console.log(`  ✓ ${file}`);
    }
  }

  // Write import-map.json with real CDN URLs + SRI integrity hashes
  const integrityMap = {};
  for (const file of RUNTIME_FILES) {
    const filePath = path.join(dir, file);
    try {
      const content = await readFile(filePath);
      const hash = createHash('sha256').update(content).digest('base64');
      integrityMap[file] = `sha256-${hash}`;
    } catch { /* file may not exist — skip */ }
  }

  // La tabla la da `tools/lib/mapa-del-runtime.mjs`: acá estaba escrita por
  // segunda vez, y con dos copias el alias heredado de #58 se publica en una
  // y no en la otra — el mapa de `dist/` y el del CDN discrepando sobre el
  // MISMO runtime, sin que nada falle.
  const importMap = {
    imports: importsDelRuntime(framework, base),
    integrity: integrityMap,
  };
  const importMapJson = JSON.stringify(importMap, null, 2);

  if (isDryRun) {
    console.log(`  [dry-run] import-map.json → ${cdnVersionedDir}/import-map.json`);
  } else {
    await writeFile(path.join(cdnVersionedDir, 'import-map.json'), importMapJson);
    await writeFile(path.join(cdnLatestDir,    'import-map.json'), importMapJson);
    console.log(`  ✓ import-map.json`);
  }

  console.log(`  ✓ ${framework} ${version} — ${RUNTIME_FILES.length} ficheros + import-map.json`);
}

async function main() {
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
