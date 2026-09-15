/**
 * Manifest & contracts builder — single implementation.
 *
 * Used by publish.mjs, manifest-gen.mjs, and contracts-export.mjs
 * so the manifest schema and contracts schema are defined in exactly one place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL MANIFIESTO NO ES UNA FUENTE: ES LA PROYECCIÓN PUBLICADA (issue #43).
 *
 * De sus siete claves, cinco salen tal cual del repo —`tag`, `alias`, `tier` y
 * `framework` del registry; `inputs` de `element-inputs.json`—, `version` la
 * resuelve el publicador por contenido y `entryScript` es una constante. **No
 * lleva un solo dato que no esté ya acá.** Por eso NO se convierte en la
 * fuente de la forma de un elemento: sería un quinto sitio con una copia, y
 * una copia que además vive en el CDN, o sea que un clon limpio no podría
 * construir sin red.
 *
 * Lo que sí pasa a ser es **el embudo comprobado**: nada llega al registry ni
 * al CDN sin producir un manifiesto que valide contra la interfaz
 * `ElementManifest` declarada en `vitals/contracts/src/element-manifest.schema.ts`.
 * Antes esa interfaz no la importaba nadie: se generaba, se publicaba y se
 * tiraba, y si este fichero renombraba una clave, compilaba y nadie se
 * enteraba. Ahora las claves emitidas se cruzan contra las declaradas, leídas
 * del `.ts` (ver `contract-schema.mjs`).
 *
 * Y NO ES TEÓRICO: el manifiesto SÍ tiene lector, del otro lado de la red. El
 * CMS lo deserializa en `FileSystemBundleRegistryClient` y en
 * `HttpBundleRegistryClient` —con una clase privada `ElementManifest` en CADA
 * uno, o sea dos copias a mano de estas siete claves— y lee `EntryScript` así:
 *
 *     var entryScript = string.IsNullOrWhiteSpace(manifest.EntryScript)
 *         ? "main.js" : manifest.EntryScript;
 *
 * Es decir que una clave renombrada acá no deja un hueco: el CMS **rellena con
 * el valor por defecto** y sigue, que es exactamente
 * `feedback_an_omitted_key_can_be_an_assertion` del repo hermano. Nada se pone
 * rojo en ninguno de los dos árboles. Por eso el gate va sobre la clave
 * serializada y la mutación es renombrarla.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Manifest ─────────────────────────────────────────────────────────────────

/**
 * Build a single element manifest object.
 *
 * El `framework` ya NO llega como parámetro suelto: lo declara la entrada del
 * registry (issue #42). Cuando lo elegía quien llamaba, el manifiesto decía
 * de qué plataforma era el bundle según el bucle en el que se hubiera
 * construido, no según lo que el elemento es — y el registry, que es lo que
 * lee el CMS, no lo decía en absoluto.
 *
 * @param {{ name: string, tag: string, alias: string, tier: string, framework: string }} entry
 * @param {string} version — semver version string
 * @param {Array} inputs — input descriptors from element-inputs.json
 * @returns {object} manifest object ready to JSON.stringify
 */
export function buildManifest(entry, version, inputs) {
  return {
    tag:         entry.tag,
    alias:       entry.alias,
    framework:   entry.framework,
    version,
    tier:        entry.tier,
    entryScript: 'main.js',
    inputs,
  };
}

/**
 * ¿Es esto un manifiesto válido según el contrato declarado?
 *
 * Se le pasan las claves y las uniones LEÍDAS del `.ts` —no una lista escrita
 * acá— porque una lista escrita acá vuelve a ser la misma copia que el issue
 * #43 vino a matar: cruzaría el builder contra sí mismo.
 *
 * @param {object} manifest Lo que se va a escribir en disco.
 * @param {{ claves: {nombre: string, opcional: boolean}[], frameworks: string[], tiers: string[] }} contrato
 * @returns {string[]} Líneas de error. Vacío es válido.
 */
export function validateManifest(manifest, contrato) {
  const errores = [];
  const presentes = new Set(Object.keys(manifest));

  for (const { nombre, opcional } of contrato.claves) {
    if (!presentes.has(nombre) && !opcional) {
      errores.push(`falta la clave "${nombre}", que ElementManifest declara obligatoria`);
    }
  }

  for (const clave of presentes) {
    if (!contrato.claves.some((c) => c.nombre === clave)) {
      errores.push(`emite la clave "${clave}", que ElementManifest no declara`);
    }
  }

  if (presentes.has('framework') && !contrato.frameworks.includes(manifest.framework)) {
    errores.push(
      `framework "${manifest.framework}" no es uno de ${contrato.frameworks.join(', ')}`,
    );
  }

  if (presentes.has('tier') && !contrato.tiers.includes(manifest.tier)) {
    // Ojo: `ElementRegistryTier` admite `experience` y `ElementTier` no. Eso no
    // se tapa acá poniéndole un valor: si alguien declara ese tier, el
    // manifiesto no lo puede expresar y el presupuesto de tamaño tampoco tiene
    // techo para él. Que falle y se decida.
    errores.push(`tier "${manifest.tier}" no es uno de ${contrato.tiers.join(', ')}`);
  }

  if (presentes.has('entryScript') && manifest.entryScript !== 'main.js') {
    errores.push(`entryScript "${manifest.entryScript}" — el contrato lo fija en "main.js"`);
  }

  if (presentes.has('inputs') && !Array.isArray(manifest.inputs)) {
    errores.push('inputs no es un array');
  }

  return errores;
}

// ── Contracts ────────────────────────────────────────────────────────────────

/**
 * Build a single element contract entry (for contracts.json).
 *
 * @param {{ name: string, tag: string, alias: string, tier: string, framework: string }} entry
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
    framework:    entry.framework,
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
