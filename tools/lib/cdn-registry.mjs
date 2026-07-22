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
 * Decide bajo QUÉ versión publicar, mirando el contenido en vez de un número fijo.
 *
 * El problema que resuelve: todos los `package.json` dicen `0.1.0`, así que cada
 * publicación reescribía el MISMO slot `<name>/<fw>/0.1.0/main.js` — y ese slot lo
 * sirve el CMS con `Cache-Control: immutable, max-age=31536000`. Contenido nuevo bajo
 * una URL que el navegador tiene PROHIBIDO revalidar: en local se tapa con
 * Ctrl+Shift+R, pero con usuarios reales el bundle nuevo sencillamente no llega.
 * `immutable` no era mentira del CMS; lo era del publisher, que reusaba la URL.
 *
 * Regla: misma integridad ⇒ misma versión (republicar es idempotente, no ensucia el
 * histórico). Integridad distinta ⇒ sube el patch, que es una URL nueva y hace honesto
 * al `immutable`. Las versiones viejas se quedan en disco a propósito: eso es lo que
 * permite que una página ya servida siga cargando el bundle con el que se pintó.
 *
 * @param {object} options
 * @param {string} options.cdnSynergosDir — ruta absoluta a `<cdn>/synergos`
 * @param {string} options.elementName
 * @param {string} options.framework
 * @param {string} options.integrity     — SRI del bundle que se va a publicar
 * @param {string} options.fallbackVersion — versión de partida si no hay nada publicado
 * @returns {{ version: string, unchanged: boolean, reason: string }}
 */
export function resolvePublishVersion({
  cdnSynergosDir, elementName, framework, integrity, fallbackVersion,
}) {
  const bump = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v ?? '');
    if (!m) return fallbackVersion;
    return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
  };

  let current = null;
  const registryPath = join(cdnSynergosDir, 'registry.json');
  if (existsSync(registryPath)) {
    try {
      const doc = JSON.parse(readFileSync(registryPath, 'utf8'));
      const el = Array.isArray(doc?.elements)
        ? doc.elements.find((e) => e && e.name === elementName)
        : null;
      const impl = el?.implementations?.[framework];
      if (impl?.latest) current = String(impl.latest);
    } catch {
      // Registry ilegible: no es motivo para pisar una versión. Se publica una nueva.
    }
  }

  if (!current) {
    return { version: fallbackVersion, unchanged: false, reason: 'first-publish' };
  }

  // ¿El contenido es el mismo que ya está publicado bajo esa versión?
  const metaPath = join(cdnSynergosDir, elementName, framework, current, 'meta.json');
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      if (meta?.integrity && meta.integrity === integrity) {
        return { version: current, unchanged: true, reason: 'same-content' };
      }
    } catch {
      // meta.json ilegible ⇒ no se puede afirmar que sea el mismo contenido ⇒ subir.
    }
  }

  return { version: bump(current), unchanged: false, reason: `content-changed (desde ${current})` };
}

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
      ...(Array.isArray(entry.dependencies) && entry.dependencies.length > 0
        ? { dependencies: [...entry.dependencies] }
        : {}),
      implementations: {},
    };
    doc.elements.push(element);
  } else {
    // Source registry wins for identity fields — it is the source of truth.
    element.alias = entry.alias;
    element.tag = entry.tag;
    element.tier = entry.tier;
    // `dependencies` viaja igual que los campos de identidad: manda el registro fuente.
    // Se BORRA cuando el fuente ya no la declara — si no, una dependencia retirada
    // sobreviviría para siempre en el registry de la CDN, que se actualiza in-place.
    if (Array.isArray(entry.dependencies) && entry.dependencies.length > 0) {
      element.dependencies = [...entry.dependencies];
    } else {
      delete element.dependencies;
    }
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
