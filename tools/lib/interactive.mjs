/**
 * Los menús interactivos de `npm run cli`, `dev-cdn` y `release-cdn`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO DESCUBRÍA PROYECTOS DE Nx, Y Nx SE PURGÓ EL 2026-08-04 (#52).
 *
 * `discoverProjects` hacía `glob('**\/project.json')` y los `project.json` ya no
 * existen. Medido antes de tocar nada: **0 proyectos**. Y no fallaba —
 * **contestaba**: un menú que se abre y no lista nada se lee como «todavía no
 * construí nada», no como «esta herramienta murió hace seis semanas». Es la
 * degradación silenciosa que este repo persigue en diez sitios, aplicada a la
 * herramienta de ENTRADA: `ONBOARDING.md` la ofrecía como el camino del primer
 * build.
 *
 * Hoy el descubrimiento es el MISMO que usa el build —`descubrirFuentes` de
 * `element-sources.mjs`, una carpeta con `src/main.ts`— y por eso está cubierto
 * por specs. Dos recorridos del mismo árbol que pueden discrepar es la forma en
 * que este repo ya perdió el tier (`TIER_BY_NAME`, #43) y la tabla del import
 * map (#58).
 *
 * **Y ahora VACÍO ES UN FALLO, no un menú en blanco.** Es la mitad que cierra
 * el defecto: si el descubrimiento deja de ver, hay que enterarse.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { select, checkbox, confirm } from '@inquirer/prompts';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ROOT } from './synergos-config.mjs';
import { descubrirFuentes, PLATAFORMAS } from './element-sources.mjs';
import { frameworksConstruibles } from './frameworks.mjs';

// ── Descubrimiento ───────────────────────────────────────────────────────────

const listarDirs = (dir) => {
  const abs = resolve(ROOT, dir);
  return existsSync(abs)
    ? readdirSync(abs, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
};

/**
 * Los elementos que este repo puede construir, leídos del disco.
 *
 * Devuelve la misma forma que el `discoverProjects` de Nx para los llamadores
 * —`{ name, path, framework, tier, element }`— menos `tags` y `scope`, que eran
 * vocabulario de Nx y no los leía nadie.
 *
 * El `tier` puede ser `''`: las apps de `apps/domains/` y `apps/experiences/`
 * no llevan segmento de tier en la ruta, y ahí lo sabe el registry y no el
 * disco. Inventarle uno sería la fabricación que #42 y #43 ya pagaron.
 *
 * @param {{ fuentes?: Map }} [io] Para los tests: el descubrimiento inyectado.
 * @returns {Array<{name:string, path:string, framework:string, tier:string, element:string}>}
 */
export function descubrirElementos(io = {}) {
  const fuentes = io.fuentes ?? descubrirFuentes({
    listar: listarDirs,
    existe: (r) => existsSync(resolve(ROOT, r)),
    plataformas: PLATAFORMAS,
  });

  return [...fuentes]
    .map(([nombre, { framework, dir, tier }]) => ({
      name: nombre, path: dir, framework, tier: tier ?? '', element: nombre,
    }))
    .sort((a, b) => {
      const fw = a.framework.localeCompare(b.framework);
      if (fw !== 0) return fw;
      const tr = a.tier.localeCompare(b.tier);
      return tr !== 0 ? tr : a.element.localeCompare(b.element);
    });
}

/**
 * Lo mismo, pero RECHAZANDO el vacío.
 *
 * Es el corte de #52. Un menú vacío no se lee como una herramienta rota, así
 * que todo flujo interactivo entra por acá: sin elementos no hay nada que
 * elegir, y decirlo es lo único que distingue «no has construido» de «el
 * descubrimiento dejó de ver».
 *
 * @param {string} [framework] Filtro opcional.
 */
export function elementosOFallar(framework, io = {}) {
  const todos = descubrirElementos(io);
  const elementos = framework ? todos.filter((p) => p.framework === framework) : todos;

  if (elementos.length === 0) {
    const detalle = framework ? ` para el framework "${framework}"` : '';
    throw new Error(
      `El descubrimiento no encontró ni un elemento${detalle}.\n` +
      `  Una fuente es platforms/<plataforma>/apps/**/<nombre>/src/main.ts — el mismo\n` +
      `  recorrido que usa el build. Si acabás de clonar, corré 'npm run setup'; si no,\n` +
      `  el descubrimiento está roto y esto no es un menú vacío: es un fallo.`,
    );
  }

  return elementos;
}

// ── Display helpers ──────────────────────────────────────────────────────────

const TIER_ICONS = {
  primitive: '🟢',
  composition: '🔵',
  module: '🟣',
  experience: '🟠',
};

function tierIcon(tier) {
  return TIER_ICONS[tier] || '⚪';
}

function elementLabel(p) {
  return `${tierIcon(p.tier)} ${p.element}  [${p.tier || 'lib'}]`;
}

// ── Interactive flows ────────────────────────────────────────────────────────

/**
 * Pregunta el framework — DERIVADO del disco, y sin preguntar si hay uno solo.
 *
 * Antes devolvía un `[{ name: 'Angular', value: 'angular' }]` escrito a mano.
 * Era correcto mientras hubiera una plataforma y es la forma de la regla 26(b):
 * una excepción «legítimamente de X» caduca el día que hay dos X — con la
 * segunda plataforma en el disco, este menú habría seguido ofreciendo una.
 *
 * **Y con una sola no se pregunta**: un menú de una opción es teatro. Se
 * anuncia y se sigue.
 *
 * @param {{ includeCancel?: boolean, frameworks?: string[] }} options
 */
export async function selectFramework({ includeCancel = false, frameworks } = {}) {
  const disponibles = frameworks ?? frameworksConstruibles({
    raiz: ROOT, listarDirs, existe: (r) => existsSync(resolve(ROOT, r)), unir: join,
  });

  if (disponibles.length === 0) {
    throw new Error(
      'No hay ninguna plataforma construible bajo platforms/. Una plataforma es una carpeta ' +
      'con su propio package.json — ver el contrato de #62.',
    );
  }

  if (disponibles.length === 1) {
    console.log(`\n  🏗  Framework: ${disponibles[0]} (la única construible)\n`);
    return disponibles[0];
  }

  const choices = disponibles.map((f) => ({ name: f.charAt(0).toUpperCase() + f.slice(1), value: f }));
  if (includeCancel) choices.push({ name: '← Cancelar', value: '__cancel' });

  return select({ message: '🏗  Framework:', choices });
}

/**
 * Prompt user to select one or more elements from the discovered list.
 * @param {string} framework
 * @returns {Promise<string[]>} — array of element short names
 */
export async function selectElements(framework) {
  // `elementosOFallar` LANZA si no hay nada: un menú vacío se lee como «todavía
  // no construí», no como «la herramienta está rota» (#52).
  const elements = elementosOFallar(framework);

  if (elements.length === 1) {
    console.log(`\n  📦 Auto-selected: ${elements[0].element}\n`);
    return [elements[0].element];
  }

  // Ask: all or pick?
  const mode = await select({
    message: `📦 Elements (${elements.length} available):`,
    choices: [
      { name: `🔥 ALL (${elements.length} elements)`, value: 'all' },
      { name: '🎯 Pick specific elements', value: 'pick' },
    ],
  });

  if (mode === 'all') {
    return elements.map((p) => p.element);
  }

  // Group by tier for visual clarity
  const choices = elements.map((p) => ({
    name: elementLabel(p),
    value: p.element,
    checked: false,
  }));

  const selected = await checkbox({
    message: `Select elements:`,
    choices,
    required: true,
  });

  return selected;
}

/**
 * Prompt for LiveReload toggle.
 */
export async function askLiveReload() {
  return confirm({
    message: '📡 Enable LiveReload (CDN polling)?',
    default: true,
  });
}

/**
 * El flujo completo del dev-cdn: framework, elementos y livereload.
 *
 * Decía «picks Angular vs Vite-based» y devolvía un `mode`; `dev-cdn-vite.mjs`
 * murió con la purga y este flujo no devuelve ningún `mode` desde entonces. Una
 * cabecera que describe una bifurcación que no existe es lo que hace que el
 * siguiente la busque (#52).
 */
export async function interactiveDevCdnFull() {
  console.log('\n  🚀 Synergos Dev CDN — Interactive Mode\n');

  // El framework sale del disco y no se pregunta si hay uno solo (#52). Ni se
  // pregunta `skipRuntime`: el dev-cdn lo construye solo si falta, así que
  // «saltárselo» era ofrecer un pie del que tirar.
  const framework = await selectFramework();
  const elements = await selectElements(framework);
  const livereload = await askLiveReload();

  console.log('');
  console.log('  ─'.repeat(30));
  console.log(`  Elements   : ${elements.join(', ')}`);
  console.log(`  LiveReload : ${livereload ? 'yes' : 'no'}`);
  console.log('  ─'.repeat(30));
  console.log('');

  return { elements, livereload };
}

// ── Release flows ────────────────────────────────────────────────────────────

/**
 * Interactive release scope selection.
 * Returns { scope, framework?, elements?, verify, clean }
 */
export async function interactiveRelease() {
  console.log('\n  🚀 Synergos CDN Release — Interactive Mode\n');

  const scope = await select({
    message: '📦 Release scope:',
    choices: [
      { name: '🎯 Specific elements',           value: 'elements' },
      { name: '🏗  Entire framework',             value: 'framework' },
      { name: '📚 Runtime only (el compartido de la plataforma)', value: 'runtime' },
      { name: '🔥 Everything (full release)',     value: 'full' },
      { name: '← Cancelar',                       value: '__cancel' },
    ],
  });

  if (scope === '__cancel') {
    console.log('\n  👋 Cancelado.\n');
    process.exit(0);
  }

  let framework = null;
  let elements = [];

  if (scope === 'elements') {
    framework = await selectFramework({ includeCancel: true });
    if (framework === '__cancel') {
      console.log('\n  👋 Cancelado.\n');
      process.exit(0);
    }
    elements = await selectElements(framework);
  } else if (scope === 'framework') {
    framework = await selectFramework({ includeCancel: true });
    if (framework === '__cancel') {
      console.log('\n  👋 Cancelado.\n');
      process.exit(0);
    }
    // all elements for that framework
    elements = elementosOFallar(framework).map((p) => p.element);
  }

  const rebuildLibs = await confirm({
    message: '📚 Rebuild libs/shared? (solo si cambiaste shared, core o contracts)',
    default: false,
  });

  const verify = await confirm({
    message: '🔍 Verify integrity after publish?',
    default: true,
  });

  const clean = await confirm({
    message: '🧹 Clean dist/ after publish?',
    default: false,
  });

  // Summary
  console.log('');
  console.log('  ─'.repeat(30));
  if (scope === 'full') {
    console.log('  Scope      : FULL RELEASE (all frameworks + runtime)');
  } else if (scope === 'runtime') {
    console.log('  Scope      : Runtime only (libs compartidas de la plataforma)');
  } else {
    console.log(`  Scope      : ${scope}`);
    console.log(`  Framework  : ${framework}`);
    console.log(`  Elements   : ${elements.length} selected`);
    if (elements.length <= 10) {
      console.log(`               ${elements.join(', ')}`);
    }
  }
  console.log(`  Rebuild libs: ${rebuildLibs ? 'yes' : 'no (cache)'}`);
  console.log(`  Verify     : ${verify ? 'yes' : 'no'}`);
  console.log(`  Clean dist : ${clean ? 'yes' : 'no'}`);
  console.log('  ─'.repeat(30));

  const go = await confirm({
    message: '🚀 Proceed with release?',
    default: true,
  });

  if (!go) {
    console.log('\n  ❌ Release cancelled.\n');
    process.exit(0);
  }

  console.log('');
  return { scope, framework, elements, verify, clean, rebuildLibs };
}
