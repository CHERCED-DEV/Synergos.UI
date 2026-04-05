/**
 * Manifest & contracts builder — single implementation.
 *
 * Used by publish.mjs, manifest-gen.mjs, and contracts-export.mjs
 * so the manifest schema and contracts schema are defined in exactly one place.
 */

// ── Manifest ─────────────────────────────────────────────────────────────────

/**
 * Build a single element manifest object.
 *
 * @param {{ name: string, tag: string, alias: string, tier: string }} entry — registry entry
 * @param {string} framework — angular | react | svelte | vanilla
 * @param {string} version — semver version string
 * @param {Array} inputs — input descriptors from element-inputs.json
 * @returns {object} manifest object ready to JSON.stringify
 */
export function buildManifest(entry, framework, version, inputs) {
  return {
    tag:         entry.tag,
    alias:       entry.alias,
    framework,
    version,
    tier:        entry.tier,
    entryScript: 'main.js',
    inputs,
  };
}

// ── Contracts ────────────────────────────────────────────────────────────────

/**
 * Build a single element contract entry (for contracts.json).
 *
 * @param {{ name: string, tag: string, alias: string, tier: string }} entry — registry entry
 * @param {Array} rawInputs — input descriptors from element-inputs.json
 * @returns {object} contract entry
 */
export function buildContractEntry(entry, rawInputs) {
  const inputs = rawInputs.filter((i) => !String(i.name).startsWith('_'));
  return {
    name:         entry.name,
    alias:        entry.alias,
    tag:          entry.tag,
    tier:         entry.tier,
    configFields: inputs.map(({ name, type, required = false, default: def, description }) => ({
      name,
      type,
      required,
      ...(def === undefined ? {} : { default: def }),
      ...(description       ? { description }  : {}),
    })),
    jsonFields: inputs.filter((i) => i.type === 'json').map((i) => i.name),
  };
}

/**
 * Build the full contracts.json payload.
 *
 * @param {Array} registry — full element registry
 * @param {object} inputsData — element-inputs.json keyed by element name
 * @param {string} version — semver version string
 * @returns {object} contracts payload ready to JSON.stringify
 */
export function buildContracts(registry, inputsData, version) {
  return {
    generated: new Date().toISOString(),
    version,
    $schema: 'synergos-contracts/v1',
    elements: registry.map((entry) =>
      buildContractEntry(entry, inputsData[entry.name] ?? []),
    ),
  };
}
