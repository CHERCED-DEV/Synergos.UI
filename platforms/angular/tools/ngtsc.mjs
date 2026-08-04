/**
 * El compilador de Angular, en un solo sitio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO SE PROMOVIÓ A FICHERO PROPIO.
 *
 * Por el segundo consumidor, no por el primero. Esta configuración vivía dentro
 * de `build.mjs` y ahí estaba bien mientras fuera la única que la usaba.
 * Apareció `build-specs.mjs` —que compila los 240 `*.spec.ts` para que corran
 * bajo vitest (issue #1)— y necesita EXACTAMENTE el mismo compilador: el mismo
 * `tsconfig`, el mismo puente de sass, el mismo trato de los diagnósticos.
 *
 * Duplicarlo habría sido peor que compartirlo: dos copias que empiezan iguales
 * y se separan en silencio significan que los tests compilan con reglas
 * distintas de las de producción, y entonces un test verde no dice nada del
 * artefacto que se publica.
 *
 * Es la misma regla que gobierna `Synergos.Shared` y `Synergos.Bff.Core` en el
 * otro árbol: se promueve al SEGUNDO consumidor, no antes.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Lo ÚNICO que cambia entre los dos usos es qué ficheros entran al programa y
 * a dónde sale el JS. Todo lo demás es idéntico a propósito.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const NG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(NG_DIR, '../..');
export const CORE_ASSETS = path.join(REPO, 'vitals/core-assets/src');

// Las herramientas se resuelven desde ESTE workspace, no desde la raíz: son
// las versiones que pinea el package-lock de Angular.
export const requireLocal = createRequire(path.join(NG_DIR, 'package.json'));
export const ts = requireLocal('typescript');
export const sass = requireLocal('sass');
export const { NgtscProgram, readConfiguration } = requireLocal('@angular/compiler-cli');

export const hostDiag = () => ({
  getCurrentDirectory: () => NG_DIR,
  getCanonicalFileName: (f) => f,
  getNewLine: () => '\n',
});

/**
 * Las opciones del `tsconfig.json` del workspace, con el destino sobreescrito.
 *
 * @param {string} outDir A dónde va el JS emitido.
 * @param {object} [extra] Lo que el consumidor necesite cambiar y nada más.
 */
export function opcionesTs(outDir, extra = {}) {
  const { options, errors } = readConfiguration(path.join(NG_DIR, 'tsconfig.json'), {
    // El intermedio: JS moderno con los imports intactos, que esbuild resuelve.
    outDir,
    rootDir: REPO, // vitals/ entra al programa vía paths — el root las abarca
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    skipLibCheck: true,
    types: [],
    ...extra,
  });
  if (errors.length) {
    throw new Error(ts.formatDiagnostics(errors, hostDiag()));
  }
  return options;
}

/**
 * El host que enseña al compilador a leer SCSS.
 *
 * Es el único puente no-trivial: ngtsc no sabe de sass. `transformResource` es
 * el mismo gancho que usa el builder oficial de Angular — cada styleUrl y cada
 * bloque `styles:` inline pasa por acá y sale como CSS plano que el compilador
 * inserta en el componente.
 */
export function crearHost(options) {
  const host = ts.createCompilerHost(options, true);
  host.readResource = (file) => readFileSync(file, 'utf-8');
  host.transformResource = async (data, context) => {
    if (context.type !== 'style') return null;
    const desde = context.resourceFile ?? context.containingFile;
    const css = sass.compileString(data, {
      // `@use 'scss' as syn` (el puente de tokens de vitals) resuelve por
      // loadPaths; los relativos, por la URL del propio fichero.
      loadPaths: [CORE_ASSETS, path.dirname(desde)],
      url: pathToFileURL(desde),
      style: 'compressed',
      silenceDeprecations: ['import'],
    });
    return { content: css.css };
  };
  return host;
}

/**
 * Un `NgtscProgram` analizado, con los errores ya reportados.
 *
 * @param {string[]} rootNames Los ficheros por los que entra el compilador.
 * @param {object} options Salida de `opcionesTs`.
 * @param {object} host Salida de `crearHost`.
 * @param {object} [oldProgram] Para el modo `--watch`: reusa lo ya analizado.
 * @returns {Promise<{ program: object, emitir: (escribir: Function) => void }>}
 */
export async function analizar(rootNames, options, host, oldProgram) {
  const program = new NgtscProgram(rootNames, options, host, oldProgram);
  await program.compiler.analyzeAsync();

  const diags = [
    ...program.getTsSyntacticDiagnostics(),
    ...program.getTsSemanticDiagnostics(),
    ...program.getNgSemanticDiagnostics(),
  ].filter((d) => d.category === ts.DiagnosticCategory.Error);

  if (diags.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diags, hostDiag()));
    throw new Error(`${diags.length} errores de compilación`);
  }

  const { transformers } = program.compiler.prepareEmit();
  return {
    program,
    emitir: (escribir) =>
      program.getTsProgram().emit(undefined, escribir, undefined, false, transformers),
  };
}

/** Dónde queda el JS emitido de un fuente TS, dado un destino. */
export const emitidoEn = (outDir, src) =>
  path.join(outDir, path.relative(REPO, src)).replace(/\.ts$/, '.js');

/**
 * Recorre un árbol y devuelve los ficheros que pasen el filtro.
 *
 * Ignora lo que nunca es fuente. `modules/` queda fuera de quien lo llame, no
 * de acá: son submódulos de git y pueden estar sin clonar.
 */
export function buscar(raiz, coincide) {
  const encontrados = [];
  if (!existsSync(raiz)) return encontrados;

  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (/^(node_modules|dist|\.cdn-out|\.test-out|coverage)$/.test(e.name)) continue;
        walk(full);
      } else if (coincide(full)) {
        encontrados.push(full);
      }
    }
  };
  walk(raiz);
  return encontrados.sort();
}
