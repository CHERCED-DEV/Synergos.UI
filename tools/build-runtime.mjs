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

import { mkdir, stat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

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

// ── Angular externals (read from Angular nx.json — single source of truth) ──

const NG_NX_JSON = JSON.parse(await readFile(path.join(NG_DIR, 'nx.json'), 'utf8'));
const ALL_SG_EXTERNALS = NG_NX_JSON
  .targetDefaults['@angular/build:application']
  .configurations.production.externalDependencies;
const ALL_ANGULAR_EXTERNALS = ALL_SG_EXTERNALS.filter(e => !e.startsWith('@synergos/'));

// ── esbuild shared options ──────────────────────────────────────────────────

function esbuildOptions(outFile, dir, { needsCompiler = false } = {}) {
  return {
    bundle: true,
    format: 'esm',
    minify: true,
    outfile: path.join(dir, outFile),
    absWorkingDir: NG_DIR,
    conditions: ['production', 'browser', 'module'],
    mainFields: ['browser', 'module', 'main'],
    // Inject compiler as static dependency so the browser loads it BEFORE
    // the bundle evaluates. This lets Angular's JIT fallback work for
    // partial declarations that the Linker hasn't processed.
    ...(needsCompiler ? { banner: { js: `import "@angular/compiler";` } } : {}),
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

async function buildModule(label, entryPoints, external, outFile, dir, opts = {}) {
  if (isDryRun) {
    const ext = external.length
      ? `\n    external: [${external.join(', ')}]`
      : '\n    self-contained';
    console.log(`  [dry-run] ${label.padEnd(28)} → ${outFile}${ext}`);
    return;
  }
  await build({ entryPoints, external, ...esbuildOptions(outFile, dir, opts) });
  const kb = Math.round((await stat(path.join(dir, outFile))).size / 1024);
  const kbGz = await gzipSize(path.join(dir, outFile));
  console.log(
    `  ✓ ${label.padEnd(28)} → ${outFile.padEnd(28)} ${String(kb).padStart(4)} KB raw  ${String(kbGz).padStart(4)} KB gz`,
  );
}

async function gzipSize(filePath) {
  const { createGzip } = await import('node:zlib');
  const { createReadStream } = await import('node:fs');
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

function buildImportMap(base, integrity = {}) {
  const b = base.replace(/\/$/, '');
  return {
    imports: {
      '@angular/core':             `${b}/ng-core.js`,
      '@angular/core/rxjs-interop': `${b}/ng-rxjs-interop.js`,
      '@angular/core/primitives/di': `${b}/ng-primitives-di.js`,
      '@angular/core/primitives/signals': `${b}/ng-primitives-signals.js`,
      '@angular/core/primitives/event-dispatch': `${b}/ng-primitives-event-dispatch.js`,
      '@angular/compiler':         `${b}/ng-compiler.js`,
      '@angular/common':           `${b}/ng-common.js`,
      '@angular/common/http':      `${b}/ng-common-http.js`,
      '@angular/elements':         `${b}/ng-elements.js`,
      '@angular/forms':            `${b}/ng-forms.js`,
      '@angular/platform-browser': `${b}/ng-platform-browser.js`,
      '@angular/router':           `${b}/ng-router.js`,
      'rxjs':                      `${b}/rxjs.js`,
      'rxjs/operators':            `${b}/rxjs.js`,
      '@synergos/core':            `${b}/sg-core.js`,
      '@synergos/shared':          `${b}/sg-shared.js`,
    },
    integrity,
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
  // needsCompiler: true → injects `import "@angular/compiler"` as banner
  // so the browser loads the JIT compiler before partial declarations run.

  await buildModule('@angular/core',             ['@angular/core'],             ['@angular/compiler'],                                                      'ng-core.js',             dir);
  await buildModule('@angular/core/rxjs-interop', ['@angular/core/rxjs-interop'], ['@angular/core', 'rxjs', 'rxjs/operators'],                                'ng-rxjs-interop.js',     dir);
  await buildModule('@angular/core/primitives/di', ['@angular/core/primitives/di'], ['@angular/core'],                                                        'ng-primitives-di.js',    dir);
  await buildModule('@angular/core/primitives/signals', ['@angular/core/primitives/signals'], ['@angular/core'],                                              'ng-primitives-signals.js', dir);
  await buildModule('@angular/core/primitives/event-dispatch', ['@angular/core/primitives/event-dispatch'], ['@angular/core'],                                'ng-primitives-event-dispatch.js', dir);
  await buildModule('@angular/compiler',          ['@angular/compiler'],          ['@angular/core'],                                                          'ng-compiler.js',         dir);
  await buildModule('@angular/common',           ['@angular/common'],           ['@angular/core', '@angular/compiler'],                                      'ng-common.js',           dir, { needsCompiler: true });
  await buildModule('@angular/common/http',      ['@angular/common/http'],      ['@angular/core', '@angular/compiler', '@angular/common'],                    'ng-common-http.js',      dir, { needsCompiler: true });
  await buildModule('@angular/elements',         ['@angular/elements'],         ['@angular/core', '@angular/compiler'],                                      'ng-elements.js',         dir, { needsCompiler: true });
  await buildModule('@angular/forms',            ['@angular/forms'],            ['@angular/core', '@angular/compiler', '@angular/common'],                    'ng-forms.js',            dir, { needsCompiler: true });
  await buildModule('@angular/platform-browser', ['@angular/platform-browser'], ['@angular/core', '@angular/compiler', '@angular/common', '@angular/common/http'], 'ng-platform-browser.js', dir, { needsCompiler: true });
  await buildModule('@angular/router',           ['@angular/router'],           ['@angular/core', '@angular/compiler', '@angular/common', '@angular/platform-browser'], 'ng-router.js', dir, { needsCompiler: true });
  await buildModule('rxjs',                      ['rxjs'],                      [],                                                                        'rxjs.js',                dir);

  // ── Synergos shared packages ───────────────────────────────────────────

  await buildModule('@synergos/core',   [sgCoreEntry],   ALL_ANGULAR_EXTERNALS, 'sg-core.js',   dir);
  await buildModule('@synergos/shared', [sgSharedEntry], ALL_SG_EXTERNALS,      'sg-shared.js', dir);

  // ── Import map ─────────────────────────────────────────────────────────

  if (!isDryRun) {
    // Compute SRI integrity hashes for all built runtime files
    const runtimeFiles = [
      'ng-core.js', 'ng-rxjs-interop.js', 'ng-primitives-di.js', 'ng-primitives-signals.js',
      'ng-primitives-event-dispatch.js', 'ng-compiler.js', 'ng-common.js', 'ng-common-http.js',
      'ng-elements.js', 'ng-forms.js', 'ng-platform-browser.js', 'ng-router.js',
      'rxjs.js', 'sg-core.js', 'sg-shared.js',
    ];
    const integrity = {};
    for (const file of runtimeFiles) {
      try {
        const content = await readFile(path.join(dir, file));
        integrity[file] = `sha256-${createHash('sha256').update(content).digest('base64')}`;
      } catch { /* file may not exist */ }
    }

    const importMap = buildImportMap(base, integrity);
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

try {
  await main();
} catch (err) {
  console.error('\n[build-runtime]', err.message);
  process.exit(1);
}
