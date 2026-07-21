#!/usr/bin/env node

/**
 * Synergos CDN Publish Script — Multi-framework
 *
 * Scans dist/ directories of ALL platforms and publishes to LOCAL_CDN
 * with framework-namespaced paths to avoid collisions.
 *
 * CDN structure:
 *   synergos/<element>/<framework>/latest/main.js
 *   synergos/<element>/<framework>/latest/manifest.json
 *   synergos/<element>/<framework>/latest/meta.json
 *   synergos/registry.json  ← global index
 *
 * Usage:
 *   node tools/publish.mjs                          # default CDN path
 *   node tools/publish.mjs --cdn C:\MY_CDN          # custom CDN path
 *   node tools/publish.mjs --version 0.2.0          # custom version
 *   node tools/publish.mjs --dry-run                # preview without copying
 *   node tools/publish.mjs --element hero            # publish a single element
 *   node tools/publish.mjs --clean                   # clean element dists after publish
 *   node tools/publish.mjs --verify                  # verify integrity post-publish
 */

import { writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync, statSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import {
  ROOT, PLATFORMS, loadRegistry, loadInputs, readPackageVersion, resolveCdnRoot,
} from './lib/synergos-config.mjs';
import { getArg, DRY_RUN, LOG_PREFIX } from './lib/cli-utils.mjs';
import { buildManifest, buildContracts } from './lib/manifest-builder.mjs';
import { resolvePublishVersion } from './lib/cdn-registry.mjs';

// ── CLI args ─────────────────────────────────────────────────────────────────

const CDN_ROOT = resolveCdnRoot(getArg('cdn'));
const CDN_SYNERGOS = resolve(CDN_ROOT, 'synergos');
const VERSION = getArg('version', readPackageVersion());
// Un `--version=` explícito manda para TODOS los elementos del lote (salto deliberado).
// Sin él, cada elemento resuelve la suya por contenido — ver el bucle de publicación.
const EXPLICIT_VERSION = getArg('version', null);
const CLEAN = process.argv.includes('--clean');
const VERIFY = process.argv.includes('--verify');
const ELEMENT_FILTER   = getArg('element');
const FRAMEWORK_FILTER = getArg('framework');

// ── Git commit SHA (best-effort) ─────────────────────────────────────────────

let GIT_SHA = '';
try { GIT_SHA = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { /* ignore */ }

/** Strip the `synergos-` prefix off a tag to get the conventional element name */
function stripSynergosPrefix(tag) {
  return tag.startsWith('synergos-') ? tag.slice('synergos-'.length) : tag;
}

/** Compute SHA-256 integrity string (SRI format) for a file */
function sha256(filePath) {
  const hash = createHash('sha256').update(readFileSync(filePath)).digest('base64');
  return `sha256-${hash}`;
}

// ── Load element registry ────────────────────────────────────────────────────

let registry   = loadRegistry();
const inputsData = loadInputs();

if (ELEMENT_FILTER) {
  const filtered = registry.filter((e) => e.name === ELEMENT_FILTER);
  if (filtered.length === 0) {
    console.error(`\n❌ Element "${ELEMENT_FILTER}" not found in registry.`);
    process.exit(1);
  }
  registry = filtered;
}

// ── Discover and publish ─────────────────────────────────────────────────────

console.log(`\n${LOG_PREFIX}📦 Synergos CDN Publish (multi-framework)`);
console.log(`${LOG_PREFIX}   CDN target: ${CDN_SYNERGOS}`);
// Sin `--version` la versión NO es global: cada elemento resuelve la suya por contenido,
// así que anunciar la del package.json como "Version" haría creer que se publica esa.
console.log(EXPLICIT_VERSION
  ? `${LOG_PREFIX}   Version:    ${EXPLICIT_VERSION} (forzada para todo el lote)`
  : `${LOG_PREFIX}   Version:    por contenido, por elemento (base ${VERSION})`);
if (ELEMENT_FILTER)   console.log(`${LOG_PREFIX}   Element:    ${ELEMENT_FILTER}`);
if (FRAMEWORK_FILTER) console.log(`${LOG_PREFIX}   Framework:  ${FRAMEWORK_FILTER}`);
if (CLEAN) console.log(`${LOG_PREFIX}   Clean:      enabled`);
console.log('');

// ── Runtime validation gate ──────────────────────────────────────────────────
// Angular elements require the shared runtime (import-map.json) to be published
// first. Warn early if it's missing to avoid broken CDN deployments.

if (!DRY_RUN) {
  const runtimeLatest = resolve(CDN_SYNERGOS, 'runtime', 'angular', 'latest', 'import-map.json');
  const runtimeGlob   = resolve(CDN_SYNERGOS, 'runtime', 'angular');
  const hasLatest     = existsSync(runtimeLatest);
  const hasAnyRuntime = existsSync(runtimeGlob);

  if (!hasLatest && !hasAnyRuntime) {
    console.warn(`${LOG_PREFIX}   ⚠ Angular runtime NOT found in CDN.`);
    console.warn(`${LOG_PREFIX}     Run first: node tools/build-runtime.mjs && node tools/publish-runtime.mjs`);
    console.warn(`${LOG_PREFIX}     Angular elements will NOT work without the shared runtime.\n`);
  } else if (!hasLatest) {
    console.warn(`${LOG_PREFIX}   ⚠ Runtime exists but 'latest' slot is missing. Consider re-publishing runtime.\n`);
  }
}

const published = [];
const skipped = [];
// Entradas servidas por una implementación compartida (varios tipos del CMS,
// un solo web component). Se reportan para que la compartición sea visible.
const sharedImpl = [];

for (const entry of registry) {
  let elementPublished = false;

  for (const platform of PLATFORMS) {
    if (FRAMEWORK_FILTER && platform.name !== FRAMEWORK_FILTER) continue;

    // Varios tipos de elemento del CMS comparten UNA implementación: heading,
    // paragraph, rich-text, eyebrow, quote y label los pinta el mismo
    // `synergos-text-block`. Para esos no hay `dist/<name>` sino
    // `dist/<tag sin prefijo>`, y como el CMS resuelve la carpeta del CDN por
    // `name` (ResolveFolderName en FileSystemBundleRegistryClient), publicar
    // sólo bajo el name propio los dejaba DORMIDOS: seis tipos que el editor
    // puede insertar y que nunca hidrataban. Se publica el bundle compartido
    // bajo CADA name.
    const ownPath = platform.resolveBundlePath(entry.name);
    const sharedPath = platform.resolveBundlePath(stripSynergosPrefix(entry.tag));
    const bundlePath = existsSync(ownPath) ? ownPath : sharedPath;

    if (!existsSync(bundlePath)) continue;
    if (bundlePath === sharedPath && ownPath !== sharedPath) {
      sharedImpl.push(`${entry.name} ← ${stripSynergosPrefix(entry.tag)}`);
    }

    // CDN path: synergos/<element>/<framework>/latest/
    const targetDir = join(CDN_SYNERGOS, entry.name, platform.name, 'latest');

    // Build metadata — traces every published bundle to its source
    const bundleSize = statSync(bundlePath).size;
    const integrity  = sha256(bundlePath);

    // La versión se decide POR ELEMENTO y por CONTENIDO. Con la del package.json todos
    // reescribían el mismo slot `<name>/<fw>/0.1.0/`, que el CMS sirve `immutable,
    // max-age=1y` ⇒ el bundle nuevo no llegaba al navegador. Mismo defecto que tenía
    // publish-element (7c81402); aquí además importa que sea POR ELEMENTO: en un lote
    // solo unos pocos bundles cambian, y subirles la versión a todos generaría URLs
    // nuevas —y descargas— para los que no cambiaron.
    const resolved = EXPLICIT_VERSION
      ? { version: EXPLICIT_VERSION, unchanged: false }
      : resolvePublishVersion({
          cdnSynergosDir: CDN_SYNERGOS,
          elementName: entry.name,
          framework: platform.name,
          integrity,
          fallbackVersion: VERSION,
        });
    const elementVersion = resolved.version;

    const manifest = buildManifest(entry, platform.name, elementVersion, inputsData[entry.name] ?? []);

    const meta = {
      element:   entry.name,
      framework: platform.name,
      version:   elementVersion,
      commit:    GIT_SHA,
      builtAt:   new Date().toISOString(),
      bundleSize,
      integrity,
    };

    const majorAlias   = `v${elementVersion.split('.')[0]}`;

    if (DRY_RUN) {
      console.log(`${LOG_PREFIX}   ✅ ${entry.name} [${platform.name}] → ${entry.tag} (${elementVersion} / ${majorAlias})`);
    } else {
      // Helper: write bundle + manifest + meta to a CDN slot directory
      function publishSlot(dir) {
        mkdirSync(dir, { recursive: true });
        copyFileSync(bundlePath, join(dir, 'main.js'));
        writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
        writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
      }

      // Exact semver slot (immutable — never overwrite once published)
      publishSlot(join(CDN_SYNERGOS, entry.name, platform.name, elementVersion));

      // Major-pinned slot (updated each patch within the major)
      publishSlot(join(CDN_SYNERGOS, entry.name, platform.name, majorAlias));

      // Latest slot (always the newest release — use in staging/dev)
      publishSlot(targetDir);

      console.log(`   ✅ ${entry.name} [${platform.name}] → ${entry.tag} (${elementVersion} | ${majorAlias} | latest)${resolved.unchanged ? ' — sin cambios' : ''}`);
    }

    published.push({ ...entry, framework: platform.name, version: elementVersion });
    elementPublished = true;
  }

  if (!elementPublished) {
    skipped.push(entry.name);
  }
}

// ── Generate global registry.json ────────────────────────────────────────────

if (published.length > 0) {
  // Load existing registry so single-element publishes don't clobber it
  const registryPath = join(CDN_SYNERGOS, 'registry.json');
  const byElement = new Map();

  if (existsSync(registryPath)) {
    try {
      const existing = JSON.parse(readFileSync(registryPath, 'utf8'));
      for (const entry of existing.elements ?? []) {
        byElement.set(entry.name, { ...entry });
      }
    } catch { /* corrupt file — rebuild below */ }
  }

  // Fallback: if CDN registry is empty/corrupt, rebuild from published manifests
  if (byElement.size === 0) {
    const srcRegistry = loadRegistry();
    const dirs = existsSync(CDN_SYNERGOS)
      ? readdirSync(CDN_SYNERGOS, { withFileTypes: true })
          .filter((d) => d.isDirectory() && d.name !== 'runtime')
          .map((d) => d.name)
      : [];

    for (const elName of dirs) {
      const elDir = join(CDN_SYNERGOS, elName);
      const fwDirs = readdirSync(elDir, { withFileTypes: true }).filter((d) => d.isDirectory());

      for (const fwDir of fwDirs) {
        const manifestPath = join(elDir, fwDir.name, 'latest', 'manifest.json');
        if (!existsSync(manifestPath)) continue;

        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
          // Prefer source registry for alias/tag/tier; fall back to manifest
          const src = srcRegistry.find((r) => r.name === elName);

          if (!byElement.has(elName)) {
            byElement.set(elName, {
              name:  elName,
              alias: src?.alias ?? manifest.alias ?? elName,
              tag:   src?.tag   ?? manifest.tag   ?? `synergos-${elName}`,
              tier:  src?.tier  ?? manifest.tier   ?? 'unknown',
              implementations: {},
            });
          }
          const metaPath = join(elDir, fwDir.name, 'latest', 'meta.json');
          const ver = existsSync(metaPath)
            ? JSON.parse(readFileSync(metaPath, 'utf8')).version ?? VERSION
            : VERSION;
          const major = `v${ver.split('.')[0]}`;
          byElement.get(elName).implementations[fwDir.name] = { latest: ver, [major]: ver };
        } catch { /* skip unreadable manifest */ }
      }
    }

    if (byElement.size > 0) {
      console.log(`   ♻️  Rebuilt registry from ${byElement.size} CDN manifests`);
    }
  }

  // Merge newly published elements (upsert)
  for (const item of published) {
    if (!byElement.has(item.name)) {
      byElement.set(item.name, {
        name:  item.name,
        alias: item.alias,
        tag:   item.tag,
        tier:  item.tier,
        implementations: {},
      });
    }
    // La versión que se publicó para ESTE elemento — no la global del lote, que
    // volvería a apuntar a 0.1.0 y desharía el versionado por contenido.
    const itemVersion = item.version ?? VERSION;
    const majorAlias = `v${itemVersion.split('.')[0]}`;
    byElement.get(item.name).implementations[item.framework] = {
      latest: itemVersion,
      [majorAlias]: itemVersion,
    };
  }

  const globalRegistry = {
    generated: new Date().toISOString(),
    version:   VERSION,
    baseUrl:   '/synergos',
    elements:  [...byElement.values()],
  };

  if (DRY_RUN) {
    console.log(`\n${LOG_PREFIX}   📋 registry.json → ${byElement.size} elements, ${published.length} bundles`);
  } else {
    mkdirSync(CDN_SYNERGOS, { recursive: true });
    writeFileSync(
      join(CDN_SYNERGOS, 'registry.json'),
      JSON.stringify(globalRegistry, null, 2),
    );
    console.log(`\n   📋 registry.json → ${byElement.size} elements, ${published.length} bundles`);
  }

  // ── Generate contracts.json — cross-project contract for CMS CI validation ──
  // CMS fetches this from CDN in its own CI pipeline to validate resolver outputs.
  // Neither project needs to run in the same pod or tenant.

  const fullRegistry = loadRegistry();
  const contracts = buildContracts(fullRegistry, inputsData, VERSION);

  if (DRY_RUN) {
    console.log(`${LOG_PREFIX}   📋 contracts.json → ${fullRegistry.length} element contracts (CMS CI)`);
  } else {
    writeFileSync(
      join(CDN_SYNERGOS, 'contracts.json'),
      JSON.stringify(contracts, null, 2),
    );
    console.log(`   📋 contracts.json → ${fullRegistry.length} element contracts (CMS CI)`);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${LOG_PREFIX}   Published: ${published.length} bundles`);
if (sharedImpl.length > 0) {
  console.log(`${LOG_PREFIX}   Implementación compartida: ${sharedImpl.length} — ${sharedImpl.join(', ')}`);
}
if (skipped.length > 0) {
  console.log(`${LOG_PREFIX}   Skipped (not built): ${skipped.length} — ${skipped.join(', ')}`);

  // "Not built" is the benign reading, and it hides the nastier case: the
  // bundle WAS built, just under a dist directory named after the Nx
  // `element:` tag rather than the registry `name`. Those never publish and
  // nothing else complains, so an element can stay dormant indefinitely.
  // Respeta --framework: sin esto, un elemento construido SÓLO para react
  // (stat-counter) se reportaba como "divergente" al publicar angular, aunque
  // su name y su tag coinciden. El aviso perdía credibilidad justo donde más
  // hace falta. Y un name que YA coincide con el tag nunca es divergencia.
  const mismatched = skipped.filter((name) => {
    const entry = registry.find((e) => e.name === name);
    if (!entry) return false;
    const tagDir = stripSynergosPrefix(entry.tag);
    if (tagDir === name) return false;
    return PLATFORMS.some((platform) =>
      (!FRAMEWORK_FILTER || platform.name === FRAMEWORK_FILTER) &&
      existsSync(platform.resolveBundlePath(tagDir)),
    );
  });

  if (mismatched.length > 0) {
    console.warn(`\n${LOG_PREFIX}   ⚠ ${mismatched.length} of those ARE built, under a different dist name:`);
    for (const name of mismatched) {
      const entry = registry.find((e) => e.name === name);
      console.warn(`${LOG_PREFIX}     - registry name "${name}" vs dist/"${stripSynergosPrefix(entry.tag)}" (tag ${entry.tag})`);
    }
    console.warn(`${LOG_PREFIX}     These will never reach the CDN until the names agree.`);
    console.warn(`${LOG_PREFIX}     Run \`npm run element:audit\` for the full picture.`);
  }
}
console.log('');

// ── Post-publish integrity verification (--verify) ───────────────────────────

if (VERIFY && !DRY_RUN && published.length > 0) {
  console.log(`${LOG_PREFIX}🔒 Verifying published bundle integrity...\n`);
  let verifyOk = 0;
  let verifyFail = 0;

  for (const item of published) {
    const cdnBundle = join(CDN_SYNERGOS, item.name, item.framework, 'latest', 'main.js');
    const cdnMeta   = join(CDN_SYNERGOS, item.name, item.framework, 'latest', 'meta.json');

    if (!existsSync(cdnBundle) || !existsSync(cdnMeta)) {
      console.warn(`   ⚠ ${item.name} [${item.framework}] — files missing from CDN`);
      verifyFail++;
      continue;
    }

    const metaData = JSON.parse(readFileSync(cdnMeta, 'utf-8'));
    const actual   = sha256(cdnBundle);

    if (actual === metaData.integrity) {
      verifyOk++;
    } else {
      console.error(`   ❌ ${item.name} [${item.framework}] — integrity mismatch!`);
      console.error(`      Expected: ${metaData.integrity}`);
      console.error(`      Actual:   ${actual}`);
      verifyFail++;
    }
  }

  console.log(`\n${LOG_PREFIX}   Verified: ${verifyOk} OK, ${verifyFail} failed`);
  if (verifyFail > 0) {
    console.error(`\n${LOG_PREFIX}   ❌ Integrity verification FAILED — CDN may be corrupted.\n`);
    process.exit(1);
  }
  console.log('');
}

// ── Clean element dists (--clean) ───────────────────────────────────────────

if (CLEAN) {
  console.log(`${LOG_PREFIX}🧹 Cleaning element dist directories...\n`);

  // Reload full registry for cleaning (in case --element filtered it)
  const fullReg = loadRegistry();
  let cleanRemoved = 0;

  for (const entry of fullReg) {
    for (const platform of PLATFORMS) {
      // For Angular, only remove element dists — preserve libs dist
      const distDir = resolve(ROOT, `platforms/${platform.name}/dist`, entry.name);

      if (!existsSync(distDir)) continue;

      if (DRY_RUN) {
        console.log(`${LOG_PREFIX}   🗑️  ${entry.name} [${platform.name}] → would remove`);
      } else {
        rmSync(distDir, { recursive: true, force: true });
        console.log(`   🗑️  ${entry.name} [${platform.name}] → removed`);
      }
      cleanRemoved++;
    }
  }

  console.log(`\n${LOG_PREFIX}   Cleaned: ${cleanRemoved} dist directories`);
  console.log('');
}
