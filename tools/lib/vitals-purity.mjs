/**
 * Pureza de `vitals/`: ningún framework entra en la capa agnóstica (épica #36).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA SI HOY YA ESTÁ LIMPIA.
 *
 * La regla es «cada framework tiene su propio `shared`, escrito en su propio
 * lenguaje, y TODOS se alimentan de `vitals`». Hoy `vitals/` cumple: cero
 * imports de `@angular/*`, `react`, `vue` o `svelte`.
 *
 * ⚠ **Y el import obvio ya era imposible, cosa que este gate NO añade.** Se
 * midió mutando: `import { signal } from '@angular/core'` dentro de
 * `vitals/core` **no compila** — `TS2307: Cannot find module '@angular/core'` —
 * porque `vitals/` no cuelga de `platforms/angular/`, así que la resolución de
 * módulos sube hasta el `node_modules` de la raíz y ahí no hay ningún
 * framework. El árbol ya lo impedía por su FORMA.
 *
 * Decirlo importa, porque de ahí sale para qué sirve de verdad este gate: **lo
 * que hay que vigilar no es el import que lleva el nombre del framework, es el
 * que NO lo lleva**. Las dos mutaciones que compilaron y publicaron, las dos
 * con el build en VERDE y las dos invisibles para un barrido por la cadena
 * `@angular`:
 *
 *   1. `import { ButtonComponent } from
 *      '../../../../platforms/angular/libs/shared/…/button'` — una fuga
 *      RELATIVA. Mete un `@Component` de Angular entero en `vitals/` y compila,
 *      porque el fichero de destino sí resuelve `@angular/core` desde SU sitio.
 *      `grep -rn '@angular' vitals/` devuelve **nada**.
 *   2. `import('@' + 'angular/core')` — el especificador concatenado del que
 *      avisa el ticket. Compila y se publica.
 *
 * Y el día que exista el segundo framework la pureza deja de ser higiene y pasa
 * a ser la frontera: lo que se cuele acá lo arrastra React sin usarlo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL CRITERIO: LISTA BLANCA DERIVADA DEL DISCO, NO LISTA NEGRA DE NOMBRES.
 *
 * Buscar la cadena `@angular` es la forma frágil, y este repo y el del CMS ya
 * documentan cinco veces el mismo defecto —una lista escrita a mano que se
 * queda corta—. Un barrido por nombres de framework no ve `rxjs` (dependencia
 * de Angular, no de React), no ve `zone.js`, no ve `@lit/…`, no ve el paquete
 * que se invente el año que viene, y no ve `import('@' + 'angular/core')`.
 *
 * Así que el criterio se invierte: **se permite lo que se puede nombrar desde
 * el disco, y se prohíbe todo lo demás**. Lo permitido son dos cosas y las dos
 * salen de leer ficheros, no de una constante:
 *
 *   1. Un alias declarado en `compilerOptions.paths` de `tsconfig.base.json`
 *      **cuyo destino cae dentro de `vitals/`**. Hoy son tres
 *      (`@synergos/contracts`, `@synergos/core`, `@synergos/core-assets`).
 *      Si alguien mapeara un alias a `platforms/`, deja de estar permitido sin
 *      que haya que tocar este fichero.
 *   2. Una ruta relativa **que resuelva dentro de `vitals/`**. Un
 *      `../../platforms/angular/libs/shared/…` es relativo y es exactamente la
 *      fuga que hay que impedir, así que relativo no basta: se resuelve.
 *
 * Con eso, `react`, `rxjs`, `svelte` y el paquete que no existe todavía caen
 * por la misma puerta, sin nombrarlos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE GATE **NO** VE — y va escrito porque un gate que se cree más
 * listo de lo que es es peor que no tenerlo: alguien deja de mirar confiando
 * en él.
 *
 *  (a) **Un especificador que no es un literal.** `import('@' + 'angular/core')`
 *      o `require(nombre)` no se pueden leer sin ejecutar. NO se dan por buenos:
 *      se **rechazan** como `especificador_calculado`. O sea que el punto ciego
 *      está cerrado por prohibición, no por análisis — y el precio es que el día
 *      que vitals necesite un import dinámico de verdad habrá que escribir la
 *      excepción a mano y con su razón.
 *      ⚠ Ese caso obligó a leer `import(` AVANZANDO en vez de con dos regex: la
 *      concatenación EMPIEZA por comilla y no TERMINA en comilla+`)`, así que se
 *      colaba justo **entre** los dos cortes obvios y pasaba en verde. Ver
 *      `llamadasDinamicas`.
 *  (b) **Los globales.** `(globalThis as any).ng`, `window.React`. No hay import
 *      que leer. Nada en vitals hace eso hoy; esto no lo impide.
 *  (c) **Los tipos ambientales.** `lib` y `types` de un `tsconfig`, y un
 *      `@types/*` que esté en el árbol de `node_modules`, entran sin import. Por
 *      eso `HTMLElement` en `element-protocol.ts` pasa: es `lib.dom`, no un
 *      framework — y es correcto que pase, porque montar en un elemento del DOM
 *      es justamente la superficie que los cuatro frameworks comparten.
 *  (d) **Un framework copiado a mano.** Escribir un `signal()` propio dentro de
 *      vitals no es un import y no se caza acá. Pureza de imports no es pureza
 *      de diseño; eso lo decide la frontera escrita
 *      (`SynergosDocs/WHERE_DOES_THIS_GO.md`).
 *  (e) **El SCSS.** `vitals/core-assets` son `@use`/`@forward` de Sass y este
 *      gate sólo mira `.ts`. Ningún framework se importa por Sass, así que el
 *      riesgo es otro (ver la frontera) y no éste.
 *  (f) **Un literal de expresión regular con comillas dentro** (`/['"]/`). El
 *      barrido de comentarios distingue cadenas y comentarios, pero **no**
 *      literales de regex, así que uno que contenga `"` o `` ` `` podría
 *      descolocar el escáner. Se comprobó que hoy no hay ninguno en `vitals/`
 *      y el propio spec lo vuelve a comprobar en cada corrida — si aparece uno,
 *      el gate lo dice en vez de callarse.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Deja la fuente sin comentarios, conservando longitud y saltos de línea.
 *
 * Es un escáner con estado y no un `replace` de regex a propósito: el atajo
 * (un `replace` de `barra-barra hasta fin de línea`) se come la mitad de
 * `'https://cdn…'`, y este repo tiene
 * URLs en cadenas por todas partes. Se distinguen cadenas simples, dobles y
 * plantillas; lo que NO se distingue es un literal de regex (punto ciego (f)).
 */
export function sinComentarios(src) {
  const salida = [];
  let i = 0;
  const n = src.length;
  let estado = 'codigo'; // codigo | cadena | plantilla | linea | bloque
  let comilla = '';

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];

    if (estado === 'codigo') {
      if (c === '/' && d === '/') { estado = 'linea'; salida.push('  '); i += 2; continue; }
      if (c === '/' && d === '*') { estado = 'bloque'; salida.push('  '); i += 2; continue; }
      if (c === "'" || c === '"') { estado = 'cadena'; comilla = c; salida.push(c); i += 1; continue; }
      if (c === '`') { estado = 'plantilla'; salida.push(c); i += 1; continue; }
      salida.push(c); i += 1; continue;
    }

    if (estado === 'cadena' || estado === 'plantilla') {
      if (c === '\\') { salida.push(c, d ?? ''); i += 2; continue; }
      if ((estado === 'cadena' && c === comilla) || (estado === 'plantilla' && c === '`')) {
        estado = 'codigo';
      }
      salida.push(c); i += 1; continue;
    }

    if (estado === 'linea') {
      if (c === '\n') { estado = 'codigo'; salida.push('\n'); i += 1; continue; }
      salida.push(' '); i += 1; continue;
    }

    // bloque
    if (c === '*' && d === '/') { estado = 'codigo'; salida.push('  '); i += 2; continue; }
    salida.push(c === '\n' ? '\n' : ' '); i += 1; continue;
  }

  return salida.join('');
}

function lineaDe(src, indice) {
  let linea = 1;
  for (let i = 0; i < indice && i < src.length; i += 1) {
    if (src[i] === '\n') linea += 1;
  }
  return linea;
}

/**
 * Todo especificador de módulo de un fichero TypeScript.
 *
 * Devuelve `{ especificador, linea, forma }`. Cuando el especificador no es un
 * literal, `especificador` vale `null` y `forma` es `'especificador_calculado'`
 * — el punto ciego (a), que se rechaza en vez de darse por bueno.
 *
 * Las referencias triple-barra se leen del fuente **crudo**, porque son
 * comentarios: quitar comentarios primero las haría invisibles, que es justo
 * como un `/// <reference types="react" />` se cuela sin que nada chiste.
 */
export function especificadores(src) {
  const salida = [];

  // (1) triple-barra — sobre el fuente crudo, son comentarios.
  const refs = /\/\/\/\s*<reference\s+(?:types|path)\s*=\s*(['"])([^'"]*)\1/g;
  for (let m = refs.exec(src); m !== null; m = refs.exec(src)) {
    salida.push({ especificador: m[2], linea: lineaDe(src, m.index), forma: 'reference' });
  }

  const codigo = sinComentarios(src);

  const patrones = [
    // `import … from 'x'` y `export … from 'x'`
    [/\bfrom\s*(['"])([^'"]*)\1/g, 'from'],
    // `import 'x'` con efecto de lado (y `import type 'x'`, que no existe pero cuesta 0)
    [/\bimport\s+(['"])([^'"]*)\1/g, 'import'],
    // `declare module 'x'` — aumentar el módulo de un framework es depender de él
    [/\bdeclare\s+module\s+(['"])([^'"]*)\1/g, 'declare_module'],
  ];

  for (const [re, forma] of patrones) {
    for (let m = re.exec(codigo); m !== null; m = re.exec(codigo)) {
      salida.push({ especificador: m[2], linea: lineaDe(codigo, m.index), forma });
    }
  }

  salida.push(...llamadasDinamicas(codigo));

  return salida.sort((a, b) => a.linea - b.linea);
}

/**
 * `import(...)` y `require(...)`, leídos AVANZANDO y no con dos regex.
 *
 * Los dos cortes obvios —«un literal entre paréntesis» y «lo que NO empieza por
 * comilla»— dejan un hueco **entre** ellos, y el hueco es exactamente el caso
 * del que avisa el ticket: `import('@' + 'angular/core')` **empieza** por
 * comilla, así que la segunda regex no dispara, y no termina en comilla+`)`,
 * así que la primera tampoco. Con las dos regex puestas el caso pasaba en
 * VERDE — lo destapó el spec, no leer el gate.
 *
 * Así que se avanza: se lee el literal si lo hay, y se exige que lo siguiente
 * sea `)` o `,` (que es `import(x, { with: … })`). Cualquier otra cosa —una
 * concatenación, una variable, una plantilla— es `especificador_calculado` y se
 * rechaza.
 */
function llamadasDinamicas(codigo) {
  const salida = [];
  const re = /\b(import|require)\s*\(/g;

  for (let m = re.exec(codigo); m !== null; m = re.exec(codigo)) {
    const forma = m[1] === 'import' ? 'import_dinamico' : 'require';
    const linea = lineaDe(codigo, m.index);
    let i = m.index + m[0].length;
    while (i < codigo.length && /\s/.test(codigo[i])) i += 1;

    const comilla = codigo[i];
    if (comilla !== "'" && comilla !== '"') {
      salida.push({ especificador: null, linea, forma: `${forma}:especificador_calculado` });
      continue;
    }

    let j = i + 1;
    let valor = '';
    while (j < codigo.length && codigo[j] !== comilla) {
      if (codigo[j] === '\\') { valor += codigo[j + 1] ?? ''; j += 2; continue; }
      valor += codigo[j];
      j += 1;
    }
    j += 1; // la comilla de cierre
    while (j < codigo.length && /\s/.test(codigo[j])) j += 1;

    if (codigo[j] === ')' || codigo[j] === ',') {
      salida.push({ especificador: valor, linea, forma });
    } else {
      // Empieza por literal y sigue: `'@' + 'angular/core'`.
      salida.push({ especificador: null, linea, forma: `${forma}:especificador_calculado` });
    }
  }

  return salida;
}

/**
 * Los alias que `vitals/` puede nombrar, **derivados** de `tsconfig.base.json`:
 * los de `compilerOptions.paths` cuyo destino cae dentro de `vitals/`.
 *
 * Mapear un alias nuevo a `platforms/` no lo hace permitido, y borrar uno de
 * acá no hace falta: la lista se relee del disco en cada corrida.
 */
export function aliasPermitidos(repo) {
  const tsconfig = JSON.parse(
    readFileSync(path.join(repo, 'tsconfig.base.json'), 'utf8').replace(/^\s*\/\/[^\n]*$/gm, ''),
  );
  const paths = tsconfig?.compilerOptions?.paths ?? {};
  const raizVitals = path.join(repo, 'vitals');
  const permitidos = new Set();

  for (const [alias, destinos] of Object.entries(paths)) {
    const dentro = (destinos ?? []).every((destino) => {
      const abs = path.resolve(repo, destino);
      return abs === raizVitals || abs.startsWith(raizVitals + path.sep);
    });
    if (dentro && (destinos ?? []).length > 0) {
      permitidos.add(alias.replace(/\/\*$/, ''));
    }
  }

  return permitidos;
}

/** ¿El especificador cae dentro de la capa agnóstica? */
export function esPermitido(especificador, ficheroAbs, repo, permitidos) {
  if (especificador === null) return false;

  if (especificador.startsWith('.')) {
    const destino = path.resolve(path.dirname(ficheroAbs), especificador);
    const raizVitals = path.join(repo, 'vitals');
    return destino === raizVitals || destino.startsWith(raizVitals + path.sep);
  }

  for (const alias of permitidos) {
    if (especificador === alias || especificador.startsWith(alias + '/')) return true;
  }
  return false;
}

/**
 * Lo único que un `*.spec.ts` de `vitals/` puede importar de fuera: el runner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES UN CENSO CON SU RAZÓN, Y NO UN «SALTAR LOS SPECS». La diferencia importa.
 *
 * Al bajar los normalizadores del CMS a `vitals` (#63) bajaron también sus
 * specs —el código y su prueba viven juntos, o el segundo framework no puede
 * correrlas sin arrancar el compilador de Angular—. Y sus specs nombran
 * `vitest`, que no es un alias de `vitals/` ni una ruta relativa: el gate se
 * puso rojo, con razón.
 *
 * Las dos salidas fáciles son las dos malas. **Excluir `*.spec.ts` del barrido**
 * apaga el gate justo donde alguien escribiría «para probarlo rápido» un
 * `import { TestBed } from '@angular/core/testing'`, y de un helper de spec a
 * código compartido hay un `Extract function`. **Poner `globals: true`** hace
 * que el import desaparezca de la vista, que es peor: el gate se pondría verde
 * porque no hay nada que leer, no porque no haya dependencia.
 *
 * Así que la excepción se escribe, es UNA, y se vigila **en los dos sentidos**:
 * si mañana ningún spec de `vitals/` la usa, la entrada sobra y el build se pone
 * rojo — una excepción que sobra deja de leerse (la lección de #44 y #61).
 *
 * Y sólo vale en `*.spec.ts`: el mismo `vitest` en un fichero de producción de
 * `vitals/` sigue siendo una impureza.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const RUNNER_EN_SPECS = Object.freeze({
  vitest: 'El runner de los specs de este repo. Sólo en `*.spec.ts`, y no se empaqueta.',
});

/** ¿El fichero es un spec? Se decide por el nombre, que es lo que vitest mira. */
export function esSpec(abs) {
  return abs.endsWith('.spec.ts');
}

/** Todos los `.ts` de `vitals/`, recursivo, sin `node_modules` ni `dist`. */
export function ficherosDeVitals(repo) {
  const raiz = path.join(repo, 'vitals');
  const salida = [];
  const pendientes = [raiz];
  while (pendientes.length > 0) {
    const dir = pendientes.pop();
    for (const entrada of readdirSync(dir)) {
      if (entrada === 'node_modules' || entrada === 'dist') continue;
      const abs = path.join(dir, entrada);
      if (statSync(abs).isDirectory()) { pendientes.push(abs); continue; }
      if (abs.endsWith('.ts')) salida.push(abs);
    }
  }
  return salida.sort();
}

/**
 * Las impurezas del árbol: `{ fichero, linea, especificador, forma }` por cada
 * especificador que no cae dentro de la capa agnóstica.
 */
export function impurezas(repo) {
  const permitidos = aliasPermitidos(repo);
  const salida = [];
  for (const abs of ficherosDeVitals(repo)) {
    const src = readFileSync(abs, 'utf8');
    for (const uso of especificadores(src)) {
      if (esPermitido(uso.especificador, abs, repo, permitidos)) continue;
      if (esSpec(abs) && Object.hasOwn(RUNNER_EN_SPECS, uso.especificador ?? '')) continue;
      salida.push({
        fichero: path.relative(repo, abs),
        linea: uso.linea,
        especificador: uso.especificador,
        forma: uso.forma,
      });
    }
  }
  return salida;
}

/**
 * Literales de regex con comillas dentro — el punto ciego (f), medido en vez de
 * supuesto. Si esto deja de estar vacío, el escáner de `sinComentarios` puede
 * descolocarse y hay que decirlo, no callarlo.
 */
export function regexConComillas(repo) {
  const salida = [];
  for (const abs of ficherosDeVitals(repo)) {
    const src = readFileSync(abs, 'utf8');
    const re = /[=(,:[]\s*\/(?![/*])(?:\\.|\[(?:\\.|[^\]])*\]|[^/\n\\])+\/[dgimsuvy]*/g;
    for (let m = re.exec(src); m !== null; m = re.exec(src)) {
      if (/['"`]/.test(m[0])) {
        salida.push({ fichero: path.relative(repo, abs), linea: lineaDe(src, m.index), literal: m[0].trim() });
      }
    }
  }
  return salida;
}

/**
 * Las entradas de `RUNNER_EN_SPECS` que ya no usa ningún spec de `vitals/`.
 *
 * El otro sentido del censo: una excepción declarada sobre algo que nadie
 * importa es ruido, y el ruido deja de leerse.
 */
export function excepcionesQueSobran(repo) {
  const usados = new Set();
  for (const abs of ficherosDeVitals(repo)) {
    if (!esSpec(abs)) continue;
    for (const uso of especificadores(readFileSync(abs, 'utf8'))) {
      if (uso.especificador) usados.add(uso.especificador);
    }
  }
  return Object.keys(RUNNER_EN_SPECS).filter((nombre) => !usados.has(nombre));
}
