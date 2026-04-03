/**
 * build-runtime.mjs
 *
 * Builds the Synergos shared CDN runtime — a set of pre-bundled ESM files
 * that the page loads ONCE. Each element bundle then contains only its own
 * logic (~5–15 KB), instead of bundling Angular on every element (~150 KB).
 *
 * Output structure:
 *   dist/runtime/angular/{ng-version}/
 *     ng-core.js              — @angular/core            (self-contained)
 *     ng-common.js            — @angular/common          (external: core)
 *     ng-elements.js          — @angular/elements + rxjs (external: core)
 *     ng-platform-browser.js  — @angular/platform-browser(external: core, common)
 *     sg-core.js              — @synergos/core           (external: all @angular/*)
 *     sg-shared.js            — @synergos/shared         (external: all @angular/*, sg-core)
 *     import-map.json         — ready-to-inject import map (replace __BASE_URL__)
 *
 * Usage:
 *   node tools/build-runtime.mjs
 *   node tools/build-runtime.mjs --dry-run
 *   node tools/build-runtime.mjs --base=https://cdn.example.com/synergos/runtime/angular/21.1.6
 *   node tools/build-runtime.mjs --version=21.1.6   (override version folder name)
 */

import { mkdir, stat, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const NG_DIR    = path.join(ROOT, 'platforms/angular');
const LIBS_DIST = path.join(NG_DIR, 'dist/libs');

// esbuild lives in the Angular platform's node_modules
const requireFromAngular = createRequire(path.join(NG_DIR, 'package.json'));
const { build } = requireFromAngular('esbuild');

// ── CLI args ────────────────────────────────────────────────────────────────

const isDryRun     = process.argv.includes('--dry-run');
const baseArg      = process.argv.find((a) => a.startsWith('--base='));
const versionArg   = process.argv.find((a) => a.startsWith('--version='));

// ── Resolve Angular version ─────────────────────────────────────────────────

async function resolveNgVersion() {
  if (versionArg) return versionArg.slice('--version='.length);
  const pkgPath = path.join(NG_DIR, 'node_modules/@angular/core/package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  return pkg.version; // e.g. "21.1.6"
}

// ── Paths ───────────────────────────────────────────────────────────────────

function outDir(ngVersion) {
  return path.join(ROOT, 'dist/runtime/angular', ngVersion);
}

function defaultBase(ngVersion) {
  return `__BASE_URL__/runtime/angular/${ngVersion}`;
}

// ── Angular externals ───────────────────────────────────────────────────────

const ALL_ANGULAR_EXTERNALS = [
  '@angular/core',
  '@angular/common',
  '@angular/common/http',
  '@angular/elements',
  '@angular/platform-browser',
];

const ALL_SG_EXTERNALS = [
  ...ALL_ANGULAR_EXTERNALS,
  '@synergos/core',
  '@synergos/shared',
];

// ── esbuild shared options ──────────────────────────────────────────────────

function esbuildOptions(outFile, dir) {
  return {
    bundle: true,
    format: 'esm',
    minify: true,
    outfile: path.join(dir, outFile),
    absWorkingDir: NG_DIR,
    conditions: ['browser', 'module'],
    mainFields: ['browser', 'module', 'main'],
    logLevel: 'warning',
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function assertExists(filePath, label) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(
      `[build-runtime] ${label} not found:\n  ${filePath}\n` +
      `  → Run: npm run build:angular:elements`,
    );
  }
}

async function buildModule(label, entryPoints, external, outFile, dir) {
  if (isDryRun) {
    const ext = external.length
      ? `\n    external: [${external.join(', ')}]`
      : '\n    self-contained';
    console.log(`  [dry-run] ${label.padEnd(28)} → ${outFile}${ext}`);
    return;
  }
  await build({ entryPoints, external, ...esbuildOptions(outFile, dir) });
  const kb = Math.round((await stat(path.join(dir, outFile))).size / 1024);
  const kbGz = await gzipSize(path.join(dir, outFile));
  console.log(
    `  ✓ ${label.padEnd(28)} → ${outFile.padEnd(28)} ${String(kb).padStart(4)} KB raw  ${String(kbGz).padStart(4)} KB gz`,
  );
}

async function gzipSize(filePath) {
  const { createGzip } = await import('zlib');
  const { createReadStream } = await import('fs');
  return new Promise((resolve) => {
    let bytes = 0;
    const gz = createGzip({ level: 9 });
    createReadStream(filePath)
      .pipe(gz)
      .on('data', (chunk) => { bytes += chunk.length; })
      .on('end', () => resolve(Math.round(bytes / 1024)))
      .on('error', () => resolve('?'));
  });
}

// ── Import map builder ──────────────────────────────────────────────────────

function buildImportMap(base) {
  const b = base.replace(/\/$/, '');
  return {
    imports: {
      '@angular/core':             `${b}/ng-core.js`,
      '@angular/common':           `${b}/ng-common.js`,
      '@angular/common/http':      `${b}/ng-common.js`,
      '@angular/elements':         `${b}/ng-elements.js`,
      '@angular/platform-browser': `${b}/ng-platform-browser.js`,
      '@synergos/core':            `${b}/sg-core.js`,
      '@synergos/shared':          `${b}/sg-shared.js`,
    },
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const ngVersion  = await resolveNgVersion();
  const dir        = outDir(ngVersion);
  const base       = baseArg
    ? baseArg.slice('--base='.length).replace(/\/$/, '')
    : defaultBase(ngVersion);

  console.log(`\nSynergos Runtime Build${isDryRun ? ' (dry-run)' : ''}`);
  console.log(`  Angular version : ${ngVersion}`);
  console.log(`  Output          : dist/runtime/angular/${ngVersion}/`);
  console.log(`  Import-map base : ${base}`);
  console.log('─'.repeat(72));

  if (!isDryRun) {
    await mkdir(dir, { recursive: true });
  }

  const sgCoreEntry   = path.join(LIBS_DIST, 'core/fesm2022/synergos-core.mjs');
  const sgSharedEntry = path.join(LIBS_DIST, 'shared/fesm2022/synergos-shared.mjs');

  if (!isDryRun) {
    await assertExists(sgCoreEntry,   '@synergos/core   fesm2022 — build Angular first');
    await assertExists(sgSharedEntry, '@synergos/shared fesm2022 — build Angular first');
  }

  // ── Angular packages ───────────────────────────────────────────────────

  await buildModule('@angular/core',             ['@angular/core'],             [],                                              'ng-core.js',             dir);
  await buildModule('@angular/common',           ['@angular/common'],           ['@angular/core'],                               'ng-common.js',           dir);
  await buildModule('@angular/elements',         ['@angular/elements'],         ['@angular/core'],                               'ng-elements.js',         dir);
  await buildModule('@angular/platform-browser', ['@angular/platform-browser'], ['@angular/core', '@angular/common'],            'ng-platform-browser.js', dir);

  // ── Synergos shared packages ───────────────────────────────────────────

  await buildModule('@synergos/core',   [sgCoreEntry],   ALL_ANGULAR_EXTERNALS, 'sg-core.js',   dir);
  await buildModule('@synergos/shared', [sgSharedEntry], ALL_SG_EXTERNALS,      'sg-shared.js', dir);

  // ── Import map ─────────────────────────────────────────────────────────

  if (!isDryRun) {
    const importMap = buildImportMap(base);
    await writeFile(path.join(dir, 'import-map.json'), JSON.stringify(importMap, null, 2));
    console.log(`\n  ✓ import-map.json → dist/runtime/angular/${ngVersion}/import-map.json`);
  }

  console.log(`
  Done. CDN structure:

    dist/runtime/angular/${ngVersion}/
      ng-core.js              ← @angular/core
      ng-common.js            ← @angular/common
      ng-elements.js          ← @angular/elements
      ng-platform-browser.js  ← @angular/platform-browser
      sg-core.js              ← @synergos/core
      sg-shared.js            ← @synergos/shared
      import-map.json         ← inject into <head> before any element <script>

  Next steps:
    npm run build:angular            → build elements (lightweight, Angular externalized)
    npm run publish:runtime          → copy dist/runtime/ to CDN
    npm run publish:cdn              → copy elements to CDN
`);
}

main().catch((err) => {
  console.error('\n[build-runtime]', err.message);
  process.exit(1);
});
