/**
 * tools/lib/esperas-de-los-specs.mjs
 *
 * Cuánto puede tardar un test, y quién lo decide (#84).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE. El #84 midió que `academy.spec` vivía pegado al tope de 5 s de
 * vitest y que, con la máquina cargada, `npm test` salía rojo por tiempo en un
 * test distinto cada vez. Había dos salidas baratas y las dos malas: subir el
 * `testTimeout` GLOBAL —esconde el próximo, y un test colgado sigue fallando
 * igual, sólo que más tarde— o darle un tope propio a cada fichero que se
 * quejara, sin saber por qué tardaba.
 *
 * El censo (2026-10-01, 2.542 tests de Angular, `tools` y `vitals`) dijo por qué:
 * el 88 % del tiempo de `academy.spec` era ESPERA, no montaje. Los specs de las
 * verticales escribían cada uno su `flushMicrotasks` con N vueltas de
 * `setTimeout(0)`, y en Windows cada vuelta cuesta un tick del temporizador del
 * sistema (~15,6 ms) en vez de ~1 ms: 186 vueltas, 2,8 s. Hoy la vuelta es UNA
 * pieza (`asentar`, en las `tools/` de la plataforma) que espera el mismo
 * temporizador sin dejar que el bucle se duerma.
 *
 * LO QUE ESTE GATE VIGILA, las tres caras de la misma decisión:
 *
 *   1. **Ninguna configuración de vitest sube el tope global** (`testTimeout`,
 *      `hookTimeout`). Es lo que el ticket prohíbe por escrito.
 *   2. **Todo tope EXPLÍCITO está en un censo con su razón**: un `{ timeout }` en
 *      un `describe`/`it`, un número como tercer argumento de `it`, o un
 *      `vi.setConfig({ testTimeout })`. Un tope sin razón es la segunda salida
 *      mala de arriba, escrita en un sitio donde nadie la vuelve a leer.
 *   3. **Ningún spec da vueltas de `setTimeout(0)` en un bucle propio**: se usa
 *      `asentar`. Una copia nueva del helper de antes devuelve el coste a cada
 *      vertical que la copie, y nada se pondría rojo hasta que la máquina se
 *      cargue.
 *
 * Se lee con el AST de TypeScript, no con expresiones regulares: el
 * `{ timeout: 2000 }` de un `vi.waitFor` es una espera de una CONDICIÓN, no el
 * tope de un test, y por texto los dos se ven iguales.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { raicesEnDisco } from './frameworks.mjs';

const K = ts.SyntaxKind;

/**
 * Los topes explícitos que existen, con su razón. Las claves son rutas relativas a la
 * raíz del repo. Se vigila en los DOS sentidos: un tope sin entrada rompe, y una entrada
 * cuyo fichero ya no declara ese tope también — una excepción que sobra deja de leerse.
 */
export const TOPES_DECLARADOS = {
  'tools/lib/npm.spec.mjs': {
    tope: 60_000,
    razon:
      'lanza npm DE VERDAD (`npm --version` por el lanzador de #79): en Windows es npm.cmd con ' +
      'shell, y arrancarlo cuesta 1–2 s con la máquina tranquila y varias veces eso cargada. ' +
      'Es lo único que prueba que la opción llega al proceso, así que no se simula.',
  },
  'tools/lib/cli-utils.spec.mjs': {
    tope: 30_000,
    razon:
      'lanza `publish-runtime.mjs` DE VERDAD, con `--dry-run`, para ver a qué destino publicaría con ' +
      '`--cdn RUTA` y con `--cdn=RUTA` (UI#69): son dos procesos de node por caso. Con la máquina ' +
      'tranquila tardan ~1 s cada uno; con los 46 ficheros de `test:tools` en paralelo se midieron ' +
      '5,9 s, por encima de los 5 de serie. Probar sólo la función no vería que la herramienta no la usa.',
  },
  'tools/lib/dev-cdn-arranque.spec.mjs': {
    tope: 30_000,
    razon:
      'lanza `dev-cdn.mjs` DE VERDAD con una plataforma que no existe, para ver que elige con la ' +
      'misma regla que se cruza contra las guías (UI#80). Sale con 2 antes de compilar ni escuchar, ' +
      'pero carga sus módulos y recorre `platforms/*/apps`: un proceso de node, que con `test:tools` ' +
      'en paralelo puede pasar de los 5 s de serie, como el de `cli-utils`.',
  },
};

/** Las llamadas que declaran tests o grupos: `describe`, `it`, `test` y sus variantes. */
const DECLARADORES = new Set(['describe', 'it', 'test', 'suite', 'bench']);

/** El nombre raíz de un `describe.each(...)`/`it.only`/`test.concurrent`: el primer identificador. */
function raizDeLlamada(expr) {
  let e = expr;
  while (e) {
    if (ts.isIdentifier(e)) return e.text;
    if (ts.isPropertyAccessExpression(e)) e = e.expression;
    else if (ts.isCallExpression(e)) e = e.expression;
    else return null;
  }
  return null;
}

const tipoDeScript = (fichero) =>
  fichero.endsWith('.tsx') ? ts.ScriptKind.TSX : fichero.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;

const valorNumerico = (nodo) =>
  ts.isNumericLiteral(nodo) ? Number(nodo.text.replace(/_/g, '')) : null;

function propiedad(objeto, nombres) {
  for (const p of objeto.properties) {
    if (ts.isPropertyAssignment(p) && p.name && nombres.includes(p.name.getText())) {
      return p;
    }
  }
  return null;
}

/**
 * Los topes explícitos de un fichero: `[{ linea, tope, forma }]`.
 *
 * @param {string} fuente
 * @param {string} [fichero] sólo para elegir el dialecto (ts/tsx/js)
 */
export function topesExplicitos(fuente, fichero = 'x.ts') {
  const sf = ts.createSourceFile(fichero, fuente, ts.ScriptTarget.Latest, true, tipoDeScript(fichero));
  const hallados = [];
  const linea = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const visitar = (nodo) => {
    if (ts.isCallExpression(nodo)) {
      const raiz = raizDeLlamada(nodo.expression);
      if (raiz && DECLARADORES.has(raiz)) {
        for (const arg of nodo.arguments) {
          if (ts.isObjectLiteralExpression(arg)) {
            const p = propiedad(arg, ['timeout']);
            if (p) hallados.push({ linea: linea(p), tope: valorNumerico(p.initializer), forma: `${raiz}(…, { timeout })` });
          }
        }
        // `it('nombre', fn, 5000)` — el número detrás de la función
        const ultimo = nodo.arguments.at(-1);
        const funcionAntes = nodo.arguments.length >= 3 &&
          nodo.arguments.slice(0, -1).some((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
        if (ultimo && funcionAntes && valorNumerico(ultimo) !== null) {
          hallados.push({ linea: linea(ultimo), tope: valorNumerico(ultimo), forma: `${raiz}(…, fn, N)` });
        }
      }
      // vi.setConfig({ testTimeout }) / vi.setConfig({ hookTimeout })
      const callee = nodo.expression;
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'setConfig' &&
          ts.isIdentifier(callee.expression) && callee.expression.text === 'vi') {
        const arg = nodo.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          const p = propiedad(arg, ['testTimeout', 'hookTimeout']);
          if (p) hallados.push({ linea: linea(p), tope: valorNumerico(p.initializer), forma: 'vi.setConfig' });
        }
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(sf);
  return hallados;
}

/** ¿Es `setTimeout(x)` o `setTimeout(x, 0)`? — una vuelta, no un plazo. */
function esVueltaDeTemporizador(nodo) {
  if (!ts.isCallExpression(nodo)) return false;
  const c = nodo.expression;
  const nombre = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : null;
  if (nombre !== 'setTimeout') return false;
  if (nodo.arguments.length < 2) return true;
  return valorNumerico(nodo.arguments[1]) === 0;
}

const esIteracion = (n) =>
  ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) ||
  ts.isWhileStatement(n) || ts.isDoStatement(n);

/**
 * Las vueltas de `setTimeout(0)` dentro de un bucle: `[linea]`. Una sola vuelta suelta
 * no cuenta —cuesta un tick y es legítima—; lo que cuesta caro es el bucle.
 */
export function vueltasEnBucle(fuente, fichero = 'x.ts') {
  const sf = ts.createSourceFile(fichero, fuente, ts.ScriptTarget.Latest, true, tipoDeScript(fichero));
  const lineas = [];
  const visitar = (nodo, dentroDeBucle) => {
    if (dentroDeBucle && esVueltaDeTemporizador(nodo)) {
      lineas.push(sf.getLineAndCharacterOfPosition(nodo.getStart(sf)).line + 1);
    }
    ts.forEachChild(nodo, (h) => visitar(h, dentroDeBucle || esIteracion(nodo)));
  };
  visitar(sf, false);
  return lineas;
}

/** Las claves de la configuración de vitest que suben el tope de TODOS los tests. */
export function topesGlobales(fuente, fichero = 'vitest.config.ts') {
  const sf = ts.createSourceFile(fichero, fuente, ts.ScriptTarget.Latest, true, tipoDeScript(fichero));
  const hallados = [];
  const visitar = (nodo) => {
    if (ts.isPropertyAssignment(nodo) && ['testTimeout', 'hookTimeout'].includes(nodo.name.getText())) {
      hallados.push({ clave: nodo.name.getText(), linea: sf.getLineAndCharacterOfPosition(nodo.getStart(sf)).line + 1 });
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(sf);
  return hallados;
}

const ES_SPEC = /\.spec\.(ts|tsx|mjs|js)$/;
const SALTAR = /^(node_modules|dist|\.test-out|\.cdn-out|\.claude|public|coverage)$/;

function recorrer(dir, filtro, salida = []) {
  if (!existsSync(dir)) return salida;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SALTAR.test(e.name)) recorrer(path.join(dir, e.name), filtro, salida);
    } else if (filtro(e.name)) salida.push(path.join(dir, e.name));
  }
  return salida;
}

/** Los specs del repo: los de `tools/`, `vitals/` y cada plataforma derivada del disco. */
export function specsDelRepo(repo) {
  return [
    ...recorrer(path.join(repo, 'tools'), (n) => ES_SPEC.test(n)),
    ...recorrer(path.join(repo, 'vitals'), (n) => ES_SPEC.test(n)),
    ...raicesEnDisco(repo).flatMap((raiz) => recorrer(raiz, (n) => ES_SPEC.test(n))),
  ];
}

/** Las configuraciones de vitest: la de la raíz y la de cada plataforma. */
export function configsDeVitest(repo) {
  const enDir = (d) =>
    existsSync(d) ? readdirSync(d).filter((n) => /^vitest\.config\.(ts|mts|mjs|js)$/.test(n)).map((n) => path.join(d, n)) : [];
  return [...enDir(repo), ...raicesEnDisco(repo).flatMap(enDir)];
}

/**
 * El cruce entero: `{ globales, sinDeclarar, sobrantes, bucles }`, cada uno una lista de
 * cadenas legibles. Todo vacío = verde.
 */
export function revisarEsperas(repo, declarados = TOPES_DECLARADOS) {
  const rel = (f) => path.relative(repo, f).split(path.sep).join('/');
  const globales = configsDeVitest(repo).flatMap((f) =>
    topesGlobales(readFileSync(f, 'utf8'), f).map((t) => `${rel(f)}:${t.linea} sube ${t.clave} para TODOS los tests`),
  );

  const sinDeclarar = [];
  const vistos = new Set();
  const bucles = [];
  for (const f of specsDelRepo(repo)) {
    const fuente = readFileSync(f, 'utf8');
    const r = rel(f);
    for (const t of topesExplicitos(fuente, f)) {
      const decl = declarados[r];
      if (decl && decl.tope === t.tope) vistos.add(r);
      else sinDeclarar.push(`${r}:${t.linea} ${t.forma} = ${t.tope ?? '¿no literal?'} ms sin entrada en TOPES_DECLARADOS`);
    }
    for (const l of vueltasEnBucle(fuente, f)) bucles.push(`${r}:${l}`);
  }
  const sobrantes = Object.keys(declarados)
    .filter((r) => !vistos.has(r))
    .map((r) => `${r} declara ${declarados[r].tope} ms y el fichero ya no lo usa`);

  return { globales, sinDeclarar, sobrantes, bucles };
}
