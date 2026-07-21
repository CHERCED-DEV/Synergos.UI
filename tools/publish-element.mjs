#!/usr/bin/env node

/**
 * publish-element.mjs — Publish a single element's bundle to LOCAL_CDN.
 *
 * Designed to be called by the Nx `publish` target (see nx.json targetDefaults).
 * Each project gets its own `publish` target via targetDefaults, which invokes:
 *
 *   node tools/publish-element.mjs --project=<nxProjectName>
 *
 * This script resolves the element name, framework, and dist path from the
 * Nx project's tags and synergos-config, then publishes to the 3 CDN slots
 * (semver / major / latest) with manifest + meta.
 *
 * Usage:
 *   node tools/publish-element.mjs --project=react-hero
 *   node tools/publish-element.mjs --project=svelte-avatar --version=0.2.0
 *   node tools/publish-element.mjs --project=react-hero --dry-run
 *   node tools/publish-element.mjs --project=react-hero --cdn C:\MY_CDN
 *
 * For bulk publishing (all elements), use the orchestrator:
 *   node tools/publish.mjs
 *   or: npx nx run-many -t publish
 */

import {
  writeFileSync, mkdirSync, copyFileSync, existsSync, statSync, readFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import {
  ROOT, PLATFORMS, loadRegistry, loadInputs, readPackageVersion, resolveCdnRoot,
} from './lib/synergos-config.mjs';
import { getArg, DRY_RUN, LOG_PREFIX } from './lib/cli-utils.mjs';
import { buildManifest } from './lib/manifest-builder.mjs';
import { upsertCdnRegistryEntry, resolvePublishVersion } from './lib/cdn-registry.mjs';

// ── CLI args ─────────────────────────────────────────────────────────────────

const PROJECT_NAME = getArg('project');
const CDN_ROOT     = resolveCdnRoot(getArg('cdn'));
const CDN_SYNERGOS = resolve(CDN_ROOT, 'synergos');
const VERSION      = getArg('version', readPackageVersion());

if (!PROJECT_NAME) {
  console.error('\n  Usage: node tools/publish-element.mjs --project=<nxProjectName>\n');
  process.exit(1);
}

// ── Resolve project → element + framework ────────────────────────────────────

/**
 * Parse Nx project tags to extract element name and framework.
 * Tags follow: element:<name>, framework:<fw>
 */
function resolveFromNxProject(projectName) {
  try {
    // Use inherited CWD — works from both platform workspaces and root
    const result = execSync(
      `npx nx show project ${projectName} --json`,
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const project = JSON.parse(result.toString());
    const tags = project.tags || [];

    const elementTag   = tags.find((t) => t.startsWith('element:'));
    const frameworkTag = tags.find((t) => t.startsWith('framework:'));

    if (!elementTag || !frameworkTag) {
      console.error(`\n  ❌ Project "${projectName}" is missing required tags (element:*, framework:*)\n`);
      process.exit(1);
    }

    return {
      elementName: elementTag.replace('element:', ''),
      framework:   frameworkTag.replace('framework:', ''),
    };
  } catch (err) {
    console.error(`\n  ❌ Could not resolve Nx project "${projectName}": ${err.message}\n`);
    process.exit(1);
  }
}

const { elementName, framework } = resolveFromNxProject(PROJECT_NAME);

// ── Locate bundle ────────────────────────────────────────────────────────────

const platform = PLATFORMS.find((p) => p.name === framework);
if (!platform) {
  console.error(`\n  ❌ Unknown framework "${framework}" — not in PLATFORMS config\n`);
  process.exit(1);
}

const bundlePath = platform.resolveBundlePath(elementName);

if (!existsSync(bundlePath)) {
  console.error(`\n  ❌ Bundle not found: ${bundlePath}`);
  console.error(`     Run the build first: npx nx build ${PROJECT_NAME}\n`);
  process.exit(1);
}

// ── Load registry entry ──────────────────────────────────────────────────────

const registry   = loadRegistry();
const inputsData = loadInputs();

const entry = registry.find((e) => e.name === elementName);
if (!entry) {
  // The bundle built fine — only the registry lookup failed, so this is a
  // naming mismatch, not a missing element. Say so, and point at the likely
  // culprit: an entry that already owns this element under a different `name`
  // (matched by tag, which is the CMS-facing contract and rarely wrong).
  const byTag = registry.find((e) => e.tag === `synergos-${elementName}`);

  console.error(`\n  ❌ Cannot publish "${PROJECT_NAME}": no registry entry is named "${elementName}".`);
  console.error(`     The bundle exists (${bundlePath}) — this is a naming mismatch, not a missing build.`);

  if (byTag) {
    console.error(`\n     Registry entry "${byTag.name}" already carries tag "${byTag.tag}" (alias ${byTag.alias}).`);
    console.error(`     The Nx project is tagged element:${elementName}, so the two disagree on the element's name.`);
    console.error('     Fix by aligning them — rename that entry\'s "name" to '
      + `"${elementName}" (and its key in vitals/contracts/src/element-inputs.json),`);
    console.error(`     or retag the project to element:${byTag.name} and build to dist/${byTag.name}.`);
  } else {
    console.error('\n     Add an entry to vitals/contracts/src/element-registry.json with '
      + `"name": "${elementName}",`);
    console.error('     plus a matching key in vitals/contracts/src/element-inputs.json.');
  }

  console.error('\n     Run `npm run element:audit` to see every project affected by this class of drift.\n');
  process.exit(1);
}

// ── Git commit SHA (best-effort) ─────────────────────────────────────────────

let GIT_SHA = '';
try { GIT_SHA = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { /* ignore */ }

/** Compute SHA-256 integrity string (SRI format) */
function sha256(filePath) {
  const hash = createHash('sha256').update(readFileSync(filePath)).digest('base64');
  return `sha256-${hash}`;
}

// ── Publish ──────────────────────────────────────────────────────────────────

// Key inputs by the registry `name`, same as buildContracts() in publish.mjs —
// keying by the Nx tag instead would silently publish an empty input list the
// moment the two names drift apart.
const elementInputs = inputsData[entry.name];
if (!elementInputs || elementInputs.length === 0) {
  console.warn(`\n  ⚠ No inputs declared for "${entry.name}" in element-inputs.json.`);
  console.warn('    Publishing anyway, but the manifest will advertise zero inputs —'
    + ' the CMS will not know which config fields this element accepts.\n');
}

const bundleSize = statSync(bundlePath).size;
const integrity  = sha256(bundlePath);

// La versión se decide por CONTENIDO, no por el `0.1.0` del package.json — si no, cada
// publicación reescribe el mismo slot inmutable y el bundle nuevo no llega al navegador.
// Un `--version=` explícito manda siempre: sigue siendo la vía para un salto deliberado.
const explicitVersion = getArg('version', null);
const resolved = explicitVersion
  ? { version: explicitVersion, unchanged: false, reason: 'explicit --version' }
  : resolvePublishVersion({
      cdnSynergosDir: CDN_SYNERGOS,
      elementName,
      framework,
      integrity,
      fallbackVersion: VERSION,
    });
const PUBLISH_VERSION = resolved.version;

const manifest = buildManifest(entry, framework, PUBLISH_VERSION, elementInputs ?? []);

const meta = {
  element:   elementName,
  framework,
  version:   PUBLISH_VERSION,
  commit:    GIT_SHA,
  builtAt:   new Date().toISOString(),
  bundleSize,
  integrity,
};

const majorAlias = `v${PUBLISH_VERSION.split('.')[0]}`;

/** Write bundle + manifest + meta to a CDN slot directory */
function publishSlot(dir) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(bundlePath, join(dir, 'main.js'));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
}

if (DRY_RUN) {
  console.log(`${LOG_PREFIX}   ✅ ${elementName} [${framework}] → ${entry.tag} (${PUBLISH_VERSION} / ${majorAlias} / latest)`);
} else {
  // Exact semver slot (immutable)
  publishSlot(join(CDN_SYNERGOS, elementName, framework, PUBLISH_VERSION));
  // Major-pinned slot
  publishSlot(join(CDN_SYNERGOS, elementName, framework, majorAlias));
  // Latest slot
  publishSlot(join(CDN_SYNERGOS, elementName, framework, 'latest'));

  // Register it. Without this the bundle sits on disk unreachable — the CMS
  // resolves elements through registry.json, not by scanning directories.
  const upsert = upsertCdnRegistryEntry({
    cdnSynergosDir: CDN_SYNERGOS,
    entry,
    framework,
    version: PUBLISH_VERSION,
  });

  console.log(`   ✅ ${elementName} [${framework}] → ${entry.tag} (${PUBLISH_VERSION} | ${majorAlias} | latest)${resolved.unchanged ? ' — sin cambios' : ''}`);

  if (upsert.ok) {
    console.log(`   📋 registry.json → ${upsert.created ? 'added' : 'updated'} "${entry.name}" (${framework})`);
  } else {
    console.error(`\n   ❌ Bundle published, but registry.json was NOT updated: ${upsert.reason}.`);
    console.error(`      The CMS resolves elements through registry.json, so "${entry.name}" stays invisible`);
    console.error('      until you run `npm run publish:cdn`, which rebuilds it from the on-disk manifests.\n');
    process.exit(1);
  }
}
