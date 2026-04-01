#!/usr/bin/env node

import { readdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_JSON = resolve(ROOT, 'vitals/contracts/src/element-registry.json');
const INPUTS_JSON = resolve(ROOT, 'vitals/contracts/src/element-inputs.json');
const BLOCK_MAPPER_TS = resolve(ROOT, 'vitals/core/src/mappers/block.mapper.ts');
const MODELS_DIR = resolve(ROOT, 'vitals/core/src/models');
const MODELS_INDEX_TS = resolve(ROOT, 'vitals/core/src/models/index.ts');

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

const registryEntries = readJson(REGISTRY_JSON);
const inputsData = readJson(INPUTS_JSON);
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
};

const warnings = {
  emptyInputs: [],
  orphanMappers: [],
  orphanModels: [],
  orphanInputEntries: [],
  inputFieldsMissingFromModels: [],
  modelFieldsMissingFromInputs: [],
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
  if (!registryByAlias.has(alias)) {
    pushIssue(warnings.orphanMappers, {
      alias,
      tag: mapperEntry.tag,
    });
  }
}

for (const modelSlug of modelSlugs) {
  if (!registryTagSlugs.has(modelSlug)) {
    pushIssue(warnings.orphanModels, {
      modelSlug,
    });
  }
}

for (const inputName of inputNames) {
  if (!registryNames.has(inputName)) {
    pushIssue(warnings.orphanInputEntries, {
      name: inputName,
    });
  }
}

const errorCount = Object.values(errors).reduce((sum, issues) => sum + issues.length, 0);

console.log('\nSynergos Element Contract Audit');
console.log(`  Registry entries: ${registryEntries.length}`);
console.log(`  Mapper aliases:   ${mapperEntries.size}`);
console.log(`  Model files:      ${modelSlugs.size}`);
console.log(`  Input entries:    ${inputNames.length}`);

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

if (errorCount > 0) {
  console.error(`\nContract audit failed with ${errorCount} error(s).\n`);
  process.exit(1);
}

console.log('\nContract audit passed.\n');
