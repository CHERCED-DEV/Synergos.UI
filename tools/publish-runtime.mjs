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

import { FICHEROS_DEL_RUNTIME, importsDelRuntimeAngular } from './lib/mapa-del-runtime.mjs';

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

async function resolveRuntimeDir() {
  const runtimeBase = path.join(ROOT, 'dist/runtime/angular');
  let entries;
  try {
    entries = await readdir(runtimeBase);
  } catch {
    throw new Error(
      `[publish-runtime] dist/runtime/angular/ not found.\n` +
      `  → Run: npm run build:runtime`,
    );
  }
  const versions = entries.filter((e) => /^\d+\.\d+\.\d+$/.test(e));
  if (versions.length === 0) {
    throw new Error(
      `[publish-runtime] No versioned runtime found in dist/runtime/angular/.\n` +
      `  → Run: npm run build:runtime`,
    );
  }
  // Use the highest semver folder
  versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { version: versions.at(-1), dir: path.join(runtimeBase, versions.at(-1)) };
}

/** La misma lista que produce el build — una sola copia desde #58. */
const RUNTIME_FILES = FICHEROS_DEL_RUNTIME;

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { version, dir } = await resolveRuntimeDir();

  const cdnVersionedDir = path.join(CDN_ROOT, 'synergos', 'runtime', 'angular', version);
  const cdnLatestDir    = path.join(CDN_ROOT, 'synergos', 'runtime', 'angular', 'latest');

  const base = baseArg
    ? `${baseArg.slice('--base='.length).replace(/\/$/, '')}/runtime/angular/${version}`
    : `${CDN_ORIGIN}/synergos/runtime/angular/${version}`;

  console.log(`\nSynergos Runtime Publish${isDryRun ? ' (dry-run)' : ''}`);
  console.log(`  Source  : dist/runtime/angular/${version}/`);
  console.log(`  CDN     : ${cdnVersionedDir}`);
  console.log(`  Latest  : ${cdnLatestDir}`);
  console.log('─'.repeat(72));

  for (const file of RUNTIME_FILES) {
    const src = path.join(dir, file);
    try {
      await stat(src);
    } catch {
      console.warn(`  ⚠ skipped (not found): ${file}`);
      continue;
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
    imports: importsDelRuntimeAngular(base),
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

  console.log(`\n  Done. Inject this into <head> before any element <script>:\n`);
  console.log(`  <script type="importmap">`);
  console.log(`  ${importMapJson.split('\n').join('\n  ')}`);
  console.log(`  </script>\n`);
}

try {
  await main();
} catch (err) {
  console.error('\n[publish-runtime]', err.message);
  process.exit(1);
}
