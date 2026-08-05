/**
 * cms-contract-rules.mjs — las reglas puras del validador CMS↔UI.
 *
 * Se extrajeron de `tools/validate-cms-contracts.mjs` al arreglar el issue #16.
 * El validador seguía siendo el mismo, pero no tenía spec: vivía en `tools/`, y
 * `test:tools` sólo recorre `tools/lib/`. Un gate sin spec es un gate del que
 * nadie sabe si sigue mirando lo que dice mirar — y este llevaba doce aliases
 * silenciados por una lista cuya razón era falsa.
 *
 * Cero E/S. Todo entra por parámetro para que el spec pueda ejercitarlo sin el
 * CMS delante.
 */

// ── Las dos comprobaciones que bloquean ──────────────────────────────────────

/**
 * Cómo llega un elemento a una página. Sólo `docType` exige ContentType propio.
 *
 * Existe porque durante meses el validador tuvo que elegir entre gritar por
 * piezas que estaban bien o callarse por las que no. `pax-selector` lo embebe
 * `booking-wizard`, `text-block` es lo que montan otros cinco alias, y las
 * experiencias `tier=module` las coloca `elementSynModuleMount` por alias
 * (ADR 0096). Ninguna necesita DocType, y sin poder decirlo el registry las
 * convertía en deuda falsa.
 */
export const PLACEMENT_SIN_DOCTYPE = new Set(['embedded', 'shared', 'moduleMount']);

/** [E1] Alias en el registry sin ContentType en uSync. */
export function computeE1(registry, cmsAliases) {
  return registry
    .filter(e => !cmsAliases.has(e.alias))
    .filter(e => !PLACEMENT_SIN_DOCTYPE.has(e.placement))
    .map(e => ({
      alias: e.alias,
      name: e.name,
      tier: e.tier,
      tag: e.tag,
      note: 'Alias in element-registry.json but not found in any uSync ContentType .config',
    }));
}

/**
 * [E4] Dos entradas del registry con el mismo `name`.
 *
 * `publish.mjs` deduplica por nombre y gana la primera, así que cuál de los dos
 * alias acaba publicado depende del ORDEN del array — que no es una decisión
 * que nadie haya tomado. Salen de migraciones a `elementSyn*` en las que el
 * alias viejo nunca se retiró.
 */
export function computeE4(registry) {
  const porNombre = new Map();
  for (const e of registry) {
    if (!porNombre.has(e.name)) porNombre.set(e.name, []);
    porNombre.get(e.name).push(e.alias);
  }
  return [...porNombre.entries()]
    .filter(([, aliases]) => aliases.length > 1)
    .map(([name, aliases]) => ({ alias: aliases.join(' + '), name, aliases }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** [E2] ContentType con prefijo de elemento que el registry no declara. */
export function computeE2(cmsAliases, registryAliases, internalAliases) {
  const prefijos = ['element', 'experience'];
  const out = [];
  for (const alias of cmsAliases) {
    if (!prefijos.some(p => alias.startsWith(p))) continue;
    if (registryAliases.has(alias) || internalAliases.has(alias)) continue;
    out.push({
      alias,
      note: 'uSync ContentType alias matches element/experience prefix but not in element-registry.json',
    });
  }
  return out;
}

// ── La baseline: lo ÚNICO que puede silenciar un E1/E2 ───────────────────────

/**
 * Aparta de `errors` lo que la baseline ya reconoce, y delata las entradas de
 * baseline que ya no se corresponden con nada.
 *
 * Lo silenciado NO desaparece: vuelve en `baselined` para que el validador lo
 * imprima. Un desajuste que no se imprime es un desajuste que nadie revisa.
 */
export function applyBaseline(errors, baseline) {
  const kept = [];
  const baselined = [];
  for (const err of errors) {
    const known = baseline.get(err.alias);
    if (known) baselined.push({ ...err, reason: known.reason, owner: known.owner });
    else kept.push(err);
  }
  const stale = [...baseline.keys()].filter(a => !baselined.some(b => b.alias === a));
  return { kept, baselined, stale };
}

/**
 * Toda entrada de baseline exige `alias` y `reason`. Sin motivo escrito, una
 * baseline es una lista de silencio con otro nombre — que es exactamente el
 * defecto del issue #16.
 */
export function validateBaselineShape(raw) {
  const problemas = [];
  for (const clave of ['e1_registryAliasMissingFromCms', 'e2_cmsAliasMissingFromRegistry']) {
    for (const [i, e] of (raw[clave] ?? []).entries()) {
      if (!e || typeof e.alias !== 'string' || !e.alias)
        problemas.push(`${clave}[${i}]: falta \`alias\``);
      else if (typeof e.reason !== 'string' || e.reason.trim().length === 0)
        problemas.push(`${clave}[${i}] (${e.alias}): falta \`reason\``);
    }
  }
  return problemas;
}

// ── Lo que faltaba, y es el arreglo del #16 ──────────────────────────────────

/**
 * Delata las entradas de una lista de exclusión que ya no se corresponden con
 * nada vivo.
 *
 * `CMS_INTERNAL_ALIASES` clasifica ContentTypes del CMS que a propósito no
 * montan web component (SSR, presets de layout, modelos de datos anidados).
 * Es arquitectura de verdad y está anotada con sus ADRs, así que se queda en
 * código. Lo que NO puede seguir pasando es que caduque en silencio: si el
 * alias desaparece del CMS, la entrada sobra y hay que borrarla.
 *
 * Es el mismo trato que la baseline ya se daba a sí misma. La lección estaba
 * aprendida en el fichero de al lado; sólo no se había aplicado acá.
 */
export function staleExclusions(exclusiones, aliasVivos) {
  return [...exclusiones].filter(a => !aliasVivos.has(a)).sort();
}

/**
 * Las listas de supresión cableadas que un validador tiene permitido declarar.
 *
 * Cualquier otra tiene que pasar por la baseline, que imprime, exige motivo y
 * caduca. `SCHEMA_MANAGED_ALIASES`, `UI_ONLY_ALIASES` y
 * `LEGACY_RENAMED_ALIASES` no hacían ninguna de las tres: no salían por
 * pantalla, no exigían nada y no caducaban nunca. Una de ellas se justificaba
 * con `ElementTypeInitializer`, una clase que no existe en el CMS y que además
 * el proyecto prohíbe (CLAUDE.md §0.A, principios 2 y 4).
 */
export const LISTAS_PERMITIDAS = new Set([
  'CMS_INTERNAL_ALIASES', // clasificación del lado CMS, con ADRs, y ya stale-checked
  'CONFIG_EXEMPT_NAMES',  // exime de un WARNING (W4), no de un error
  'DEPRECATED_NAMES',     // no silencia: es lo que DISPARA el W5
  'VALID_TIERS',          // vocabulario, no supresión
]);

/**
 * Encuentra en el fuente del validador toda constante `X = new Set([...])` y
 * devuelve las que no están permitidas.
 *
 * Es deliberadamente sintáctico: el defecto del #16 no estaba en el
 * comportamiento del código —que hacía justo lo que decía— sino en que se
 * pudiera añadir una lista de silencio nueva sin que nada lo notara. Un test de
 * comportamiento habría comprobado la lista, no su existencia.
 */
export function listasNoPermitidas(fuente) {
  const encontradas = [];
  for (const m of fuente.matchAll(/^const\s+([A-Z][A-Z0-9_]*)\s*=\s*new Set\(/gm)) {
    if (!LISTAS_PERMITIDAS.has(m[1])) encontradas.push(m[1]);
  }
  return encontradas;
}
