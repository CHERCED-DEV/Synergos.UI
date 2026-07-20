/**
 * CDN registry upsert — keeps `synergos/registry.json` in step with a
 * single-element publish.
 *
 * `publish.mjs` regenerates this file wholesale after a bulk run. A
 * single-element publish has no such pass, so without this helper it drops the
 * bundle into the CDN slots and stops there — and the CMS never sees it: the
 * FileSystemBundleRegistryClient resolves elements *through* registry.json, so
 * an unlisted element is indistinguishable from one that was never published.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Add or update one element's entry in the CDN registry, preserving every
 * other element and any implementations already recorded for this one.
 *
 * @param {object}  options
 * @param {string}  options.cdnSynergosDir — absolute path to `<cdn>/synergos`
 * @param {{ name: string, alias: string, tag: string, tier: string }} options.entry
 * @param {string}  options.framework — angular | react | svelte | vanilla
 * @param {string}  options.version   — semver being published
 * @returns {{ ok: boolean, created: boolean, reason?: string }}
 */
export function upsertCdnRegistryEntry({ cdnSynergosDir, entry, framework, version }) {
  const registryPath = join(cdnSynergosDir, 'registry.json');

  let doc = null;
  if (existsSync(registryPath)) {
    try {
      doc = JSON.parse(readFileSync(registryPath, 'utf8'));
    } catch {
      // Refuse to overwrite a file we could not read — a bulk `publish.mjs`
      // run rebuilds it from the on-disk manifests, which is the recovery path.
      return { ok: false, created: false, reason: 'registry.json is unreadable or malformed' };
    }
  }

  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.elements)) {
    doc = { version, baseUrl: '/synergos', elements: [] };
  }

  const majorAlias = `v${version.split('.')[0]}`;
  let element = doc.elements.find((el) => el && el.name === entry.name);
  const created = !element;

  if (!element) {
    element = {
      name: entry.name,
      alias: entry.alias,
      tag: entry.tag,
      tier: entry.tier,
      implementations: {},
    };
    doc.elements.push(element);
  } else {
    // Source registry wins for identity fields — it is the source of truth.
    element.alias = entry.alias;
    element.tag = entry.tag;
    element.tier = entry.tier;
    if (!element.implementations || typeof element.implementations !== 'object') {
      element.implementations = {};
    }
  }

  element.implementations[framework] = {
    ...element.implementations[framework],
    latest: version,
    [majorAlias]: version,
  };

  doc.generated = new Date().toISOString();
  doc.baseUrl ??= '/synergos';
  doc.version ??= version;

  mkdirSync(cdnSynergosDir, { recursive: true });
  writeFileSync(registryPath, JSON.stringify(doc, null, 2));

  return { ok: true, created };
}
