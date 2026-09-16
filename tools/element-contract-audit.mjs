#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  descubrirFuentes, revisarFuentesDuplicadas, todasLasFuentes, PLATAFORMAS,
} from './lib/element-sources.mjs';
import { revisarContratoDePlataformas } from './lib/platform-contract.mjs';
import { frameworksConstruibles } from './lib/frameworks.mjs';
import { ALL_FRAMEWORKS } from './lib/synergos-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_JSON = resolve(ROOT, 'vitals/contracts/src/element-registry.json');
const INPUTS_JSON = resolve(ROOT, 'vitals/contracts/src/element-inputs.json');
const BLOCK_MAPPER_TS = resolve(ROOT, 'vitals/core/src/mappers/block.mapper.ts');
const MODELS_DIR = resolve(ROOT, 'vitals/core/src/models');
const MODELS_INDEX_TS = resolve(ROOT, 'vitals/core/src/models/index.ts');
const PLATFORMS_DIR = resolve(ROOT, 'platforms');

/**
 * Known compatibility aliases intentionally left in block.mapper.ts because
 * CMS payloads or historical datasets may still emit them, but they should
 * not appear as canonical registry entries.
 */
const KNOWN_COMPAT_MAPPER_ALIASES = new Set([
  'elementIntAngularHost',
  'elementIntMfHost',
  'elementIntMacroHost',
  'layoutPreset1Col',
  'layoutPreset2ColEqual',
  'layoutPreset3ColEqual',
  'layoutPreset4ColEqual',
  'layoutPresetMainSidebar',
  'elementCorpContactInfo',
  'elementCorpMapEmbed',
  'elementCorpMissionBlock',
  'elementCorpAlertBox',
  'elementTextCodeBlock',
  'elementTextAttributedQuote',
  'elementActionButtonContainer',
  'elementCompBlogHighlight',
  'elementCompArticleList',
  'elementFormEmbed',
  'elementCompFormBlock',
]);

/**
 * Deprecated wrapper-host names that remain documented in contracts/models for
 * migration support, but are intentionally not represented as canonical
 * registry entries.
 */
const KNOWN_DEPRECATED_INPUT_NAMES = new Set(['angular-host', 'mf-host', 'macro-host']);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function stripPrefix(value, prefix) {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function parseBlockMapperRegistry(source) {
  const registry = new Map();
  const lines = source.split(/\r?\n/u);
  let currentAlias = null;

  for (const line of lines) {
    const aliasMatch = line.match(/^\s{2}([A-Za-z0-9]+):\s*\{$/u);
    if (aliasMatch) {
      currentAlias = aliasMatch[1];
      registry.set(currentAlias, { tag: null });
      continue;
    }

    if (currentAlias === null) {
      continue;
    }

    const tagMatch = line.match(/^\s{4}tag:\s*'([^']+)',$/u);
    if (tagMatch) {
      registry.get(currentAlias).tag = tagMatch[1];
      continue;
    }

    if (line.trim() === '},' || line.trim() === '}') {
      currentAlias = null;
    }
  }

  return registry;
}

function parseModelIndexSlugs(source) {
  return new Set(
    [...source.matchAll(/\.\/([a-z0-9-]+)-inputs\.model/gu)].map((match) => match[1]),
  );
}

function parseModelFields(source) {
  return new Set(
    [...source.matchAll(/^\s{2}([A-Za-z0-9]+)\??:\s*[^;]+;$/gmu)].map((match) => match[1]),
  );
}

function pushIssue(collection, issue) {
  collection.push(issue);
}

function printSection(title, issues, formatter) {
  if (issues.length === 0) {
    return;
  }

  console.log(`\n${title} (${issues.length})`);
  for (const issue of issues) {
    console.log(`  - ${formatter(issue)}`);
  }
}

/**
 * Los elementos implementados, leídos del FILESYSTEM de las plataformas.
 *
 * Antes esto escaneaba tags `element:<name>` en los project.json de Nx. Con la
 * purga, la fuente de verdad es la misma que usa el build (tools/build.mjs):
 * cada carpeta bajo apps/ con un src/main.ts es un elemento y su nombre de
 * carpeta es su nombre en dist/. El check que protege sigue siendo el mismo —
 * una implementación cuyo nombre no está en el registry no se puede publicar
 * por ningún camino, y las dos rutas fallan en silencio.
 *
 * EL RECORRIDO YA NO ES PROPIO (issue #44). Era una copia del de
 * `element-sources.mjs` con una diferencia de una palabra: escribía
 * `framework: 'angular'` para todo lo que encontrara, así que con dos
 * plataformas habría reportado los elementos de la segunda como si fueran de
 * la primera. Dos recorridos del mismo árbol que pueden discrepar es la forma
 * en que este repo ya perdió el tier (`TIER_BY_NAME`, issue #43).
 */
function scanElementProjects() {
  const found = new Map();

  const io = {
    listar: (dir) => {
      const abs = resolve(ROOT, dir);
      return existsSync(abs)
        ? readdirSync(abs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
        : [];
    },
    existe: (ruta) => existsSync(resolve(ROOT, ruta)),
    plataformas: PLATAFORMAS,
  };

  // ANTES de colapsar por nombre (#59). `descubrirFuentes` devuelve un `Map`, así
  // que dos plataformas con el mismo elemento dejaban UNA fuera sin decirlo — y
  // lo que se ponía rojo era el cruce contra el registry, con un mensaje que
  // culpaba a la entrada del registry. Acá se para antes, nombrando las dos.
  // El contrato de una plataforma, ANTES que nada (#62). Si a `platforms/react/`
  // le faltan piezas, lo que sale después son síntomas: «ninguna plataforma
  // tiene su fuente» para cada entrada suya, que manda a mirar el registry. Las
  // siete obligaciones nombradas una por una son la causa.
  const listarDirs = (dir) => {
    const abs = resolve(ROOT, dir);
    return existsSync(abs)
      ? readdirSync(abs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
      : [];
  };
  const incumplen = revisarContratoDePlataformas({
    raiz: ROOT,
    // Del DISCO, no de PLATFORMS: lo que hay que auditar es la carpeta que
    // alguien creó, y que le falte la entrada en PLATFORMS es justamente la
    // obligación 2.
    frameworks: frameworksConstruibles({ raiz: ROOT, listarDirs, existe: existsSync, unir: join }),
    declaradas: ALL_FRAMEWORKS,
    existe: (r) => existsSync(resolve(ROOT, r)),
    leerJson: (r) => JSON.parse(readFileSync(resolve(ROOT, r), 'utf8')),
    leer: (r) => readFileSync(resolve(ROOT, r), 'utf8'),
    fuentes: (framework) =>
      todasLasFuentes({
        listar: (dir) => listarDirs(dir),
        existe: (r) => existsSync(resolve(ROOT, r)),
        plataformas: [{ framework, apps: `platforms/${framework}/apps` }],
      }).length,
    unir: join,
  });
  if (incumplen.length > 0) {
    console.error('\n[element-audit] ✗ el contrato de plataforma no se cumple:');
    for (const linea of incumplen) console.error(`[element-audit]   ${linea}`);
    process.exit(1);
  }

  const duplicadas = revisarFuentesDuplicadas(io);
  if (duplicadas.length > 0) {
    console.error('\n[element-audit] ✗ el mismo elemento tiene fuente en dos plataformas:');
    for (const linea of duplicadas) console.error(`[element-audit]   ${linea}`);
    process.exit(1);
  }

  const fuentes = descubrirFuentes(io);

  for (const [nombre, { framework }] of fuentes) {
    found.set(nombre, { project: nombre, framework, buildable: true });
  }

  return found;
}

const registryEntries = readJson(REGISTRY_JSON);
const inputsData = readJson(INPUTS_JSON);
const nxElementProjects = scanElementProjects();
const blockMapperSource = readFileSync(BLOCK_MAPPER_TS, 'utf8');
const modelFiles = readdirSync(MODELS_DIR)
  .filter((name) => name.endsWith('-inputs.model.ts'))
  .map((name) => name.replace(/-inputs\.model\.ts$/u, ''));
const modelIndexSource = readFileSync(MODELS_INDEX_TS, 'utf8');

const mapperEntries = parseBlockMapperRegistry(blockMapperSource);
const registryByAlias = new Map(registryEntries.map((entry) => [entry.alias, entry]));
const registryNames = new Set(registryEntries.map((entry) => entry.name));
const registryTagSlugs = new Set(registryEntries.map((entry) => stripPrefix(entry.tag, 'synergos-')));
const inputNames = Object.keys(inputsData).filter((name) => !name.startsWith('_'));
const modelSlugs = new Set(modelFiles);
const modelIndexSlugs = parseModelIndexSlugs(modelIndexSource);

const errors = {
  missingMappers: [],
  mapperTagMismatch: [],
  missingModels: [],
  missingModelExports: [],
  missingInputs: [],
  unpublishableNxProjects: [],
};

const warnings = {
  emptyInputs: [],
  orphanMappers: [],
  orphanModels: [],
  orphanInputEntries: [],
  inputFieldsMissingFromModels: [],
  modelFieldsMissingFromInputs: [],
  registryWithoutImplementation: [],
};

for (const entry of registryEntries) {
  const mapperEntry = mapperEntries.get(entry.alias);
  if (!mapperEntry) {
    pushIssue(errors.missingMappers, entry);
  } else if (mapperEntry.tag !== entry.tag) {
    pushIssue(errors.mapperTagMismatch, {
      alias: entry.alias,
      registryTag: entry.tag,
      mapperTag: mapperEntry.tag,
    });
  }

  const modelSlug = stripPrefix(entry.tag, 'synergos-');
  if (!modelSlugs.has(modelSlug)) {
    pushIssue(errors.missingModels, {
      name: entry.name,
      alias: entry.alias,
      modelSlug,
    });
  } else if (!modelIndexSlugs.has(modelSlug)) {
    pushIssue(errors.missingModelExports, {
      name: entry.name,
      alias: entry.alias,
      modelSlug,
    });
  }

  if (!(entry.name in inputsData)) {
    pushIssue(errors.missingInputs, {
      name: entry.name,
      alias: entry.alias,
    });
    continue;
  }

  if (!Array.isArray(inputsData[entry.name]) || inputsData[entry.name].length === 0) {
    pushIssue(warnings.emptyInputs, {
      name: entry.name,
      alias: entry.alias,
    });
    continue;
  }

  if (modelSlugs.has(modelSlug)) {
    const modelSource = readFileSync(resolve(MODELS_DIR, `${modelSlug}-inputs.model.ts`), 'utf8');
    const modelFields = parseModelFields(modelSource);
    const inputFields = new Set(inputsData[entry.name].map((input) => input.name));

    const missingFromModel = [...inputFields].filter((field) => !modelFields.has(field));
    if (missingFromModel.length > 0) {
      pushIssue(warnings.inputFieldsMissingFromModels, {
        name: entry.name,
        alias: entry.alias,
        fields: missingFromModel,
      });
    }

    const missingFromInputs = [...modelFields].filter((field) => !inputFields.has(field));
    if (missingFromInputs.length > 0) {
      pushIssue(warnings.modelFieldsMissingFromInputs, {
        name: entry.name,
        alias: entry.alias,
        fields: missingFromInputs,
      });
    }
  }
}

for (const [alias, mapperEntry] of mapperEntries.entries()) {
  if (!registryByAlias.has(alias) && !KNOWN_COMPAT_MAPPER_ALIASES.has(alias)) {
    pushIssue(warnings.orphanMappers, {
      alias,
      tag: mapperEntry.tag,
    });
  }
}

for (const modelSlug of modelSlugs) {
  if (!registryTagSlugs.has(modelSlug) && !KNOWN_DEPRECATED_INPUT_NAMES.has(modelSlug)) {
    pushIssue(warnings.orphanModels, {
      modelSlug,
    });
  }
}

for (const inputName of inputNames) {
  if (!registryNames.has(inputName) && !KNOWN_DEPRECATED_INPUT_NAMES.has(inputName)) {
    pushIssue(warnings.orphanInputEntries, {
      name: inputName,
    });
  }
}

// ── Publishability: Nx `element:` tags <-> registry `name` ──────────────────

for (const [elementName, project] of nxElementProjects.entries()) {
  if (registryNames.has(elementName) || KNOWN_DEPRECATED_INPUT_NAMES.has(elementName)) {
    continue;
  }
  pushIssue(errors.unpublishableNxProjects, {
    elementName,
    project: project.project,
    framework: project.framework,
  });
}

// Inverse direction: a registry entry nothing can build. Several entries share
// one implementation on purpose (six text-* aliases all render through
// `synergos-text-block`), so exempt any entry whose tag is also carried by a
// sibling entry that does have a project — computed, not a hardcoded list.
const namesWithProject = new Set(
  registryEntries.filter((entry) => nxElementProjects.has(entry.name)).map((entry) => entry.name),
);
const tagsWithProject = new Set(
  registryEntries.filter((entry) => namesWithProject.has(entry.name)).map((entry) => entry.tag),
);

for (const entry of registryEntries) {
  if (nxElementProjects.has(entry.name) || tagsWithProject.has(entry.tag)) {
    continue;
  }
  pushIssue(warnings.registryWithoutImplementation, {
    name: entry.name,
    alias: entry.alias,
    tag: entry.tag,
  });
}

const errorCount = Object.values(errors).reduce((sum, issues) => sum + issues.length, 0);

console.log('\nSynergos Element Contract Audit');
console.log(`  Registry entries: ${registryEntries.length}`);
console.log(`  Mapper aliases:   ${mapperEntries.size}`);
console.log(`  Model files:      ${modelSlugs.size}`);
console.log(`  Input entries:    ${inputNames.length}`);
console.log(`  Nx element projects: ${nxElementProjects.size}`);

printSection('Errors: Missing mapper aliases', errors.missingMappers, (issue) =>
  `${issue.alias} (${issue.name}) -> ${issue.tag}`,
);
printSection('Errors: Mapper tag mismatches', errors.mapperTagMismatch, (issue) =>
  `${issue.alias} registry=${issue.registryTag} mapper=${issue.mapperTag}`,
);
printSection('Errors: Missing models', errors.missingModels, (issue) =>
  `${issue.alias} (${issue.name}) expects ${issue.modelSlug}-inputs.model.ts`,
);
printSection('Errors: Missing model exports', errors.missingModelExports, (issue) =>
  `${issue.alias} (${issue.name}) missing export for ${issue.modelSlug}-inputs.model.ts in vitals/core/src/models/index.ts`,
);
printSection('Errors: Missing input entries', errors.missingInputs, (issue) =>
  `${issue.alias} (${issue.name}) missing key in vitals/contracts/src/element-inputs.json`,
);
printSection('Errors: Nx projects that cannot be published', errors.unpublishableNxProjects, (issue) =>
  `${issue.project} [${issue.framework}] is tagged element:${issue.elementName}, `
  + `but no registry entry has name "${issue.elementName}" — `
  + 'add one to vitals/contracts/src/element-registry.json (and a matching key in element-inputs.json), '
  + 'or retag the project to an existing registry name',
);

printSection('Warnings: Empty input arrays', warnings.emptyInputs, (issue) =>
  `${issue.alias} (${issue.name}) has [] in vitals/contracts/src/element-inputs.json`,
);
printSection('Warnings: Mapper aliases not in registry', warnings.orphanMappers, (issue) =>
  `${issue.alias} -> ${issue.tag}`,
);
printSection('Warnings: Model files not represented in registry', warnings.orphanModels, (issue) =>
  `${issue.modelSlug}-inputs.model.ts`,
);
printSection('Warnings: Input entries not represented in registry', warnings.orphanInputEntries, (issue) =>
  issue.name,
);
printSection('Warnings: Input fields missing from models', warnings.inputFieldsMissingFromModels, (issue) =>
  `${issue.alias} (${issue.name}) -> ${issue.fields.join(', ')}`,
);
printSection('Warnings: Model fields missing from input entries', warnings.modelFieldsMissingFromInputs, (issue) =>
  `${issue.alias} (${issue.name}) -> ${issue.fields.join(', ')}`,
);
printSection('Warnings: Registry entries with no buildable project', warnings.registryWithoutImplementation, (issue) =>
  `${issue.alias} (${issue.name}) -> ${issue.tag} — no Nx project is tagged element:${issue.name}, `
  + 'so nothing ever builds it and publish.mjs reports it as "not built"',
);

if (errorCount > 0) {
  console.error(`\nContract audit failed with ${errorCount} error(s).\n`);
  process.exit(1);
}

console.log('\nContract audit passed.\n');
