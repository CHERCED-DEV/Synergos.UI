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
  console.error(`\n  ❌ Element "${elementName}" not found in element-registry.json\n`);
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

const manifest = buildManifest(entry, framework, VERSION, inputsData[elementName] ?? []);

const bundleSize = statSync(bundlePath).size;
const integrity  = sha256(bundlePath);
const meta = {
  element:   elementName,
  framework,
  version:   VERSION,
  commit:    GIT_SHA,
  builtAt:   new Date().toISOString(),
  bundleSize,
  integrity,
};

const majorAlias = `v${VERSION.split('.')[0]}`;

/** Write bundle + manifest + meta to a CDN slot directory */
function publishSlot(dir) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(bundlePath, join(dir, 'main.js'));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
}

if (DRY_RUN) {
  console.log(`${LOG_PREFIX}   ✅ ${elementName} [${framework}] → ${entry.tag} (${VERSION} / ${majorAlias} / latest)`);
} else {
  // Exact semver slot (immutable)
  publishSlot(join(CDN_SYNERGOS, elementName, framework, VERSION));
  // Major-pinned slot
  publishSlot(join(CDN_SYNERGOS, elementName, framework, majorAlias));
  // Latest slot
  publishSlot(join(CDN_SYNERGOS, elementName, framework, 'latest'));

  console.log(`   ✅ ${elementName} [${framework}] → ${entry.tag} (${VERSION} | ${majorAlias} | latest)`);
}
