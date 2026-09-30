/**
 * Un elemento publicado con gemela en el design system la MONTA, nunca la reimplementa (#81).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE. Es la **regla de los dos pisos** de la ADR 0134 del CMS (Aceptada): el mismo
 * concepto existe como pieza del design system y como elemento publicado que el CMS coloca, y el
 * elemento la **rehace** en vez de montarla. Dos implementaciones de lo mismo divergen —el
 * arreglo de una no llega a la otra, la regla 26 dentro del mismo repo— y confunden a la fábrica
 * cuando pregunta por nombre «¿existe algo que haga esto?».
 *
 * El gate de #78 (`consumidores-del-design-system`) NO lo cubre: mide si una pieza la alcanza
 * ALGUIEN. `TabsComponent` está viva por `academy` mientras el elemento `tabs` la reimplementa,
 * y #78 sigue verde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ ES UN PAR. Un elemento del registry y una pieza del design system del MISMO concepto. Sale
 * de dos sitios, y hacen falta los dos:
 *
 *  1. **Derivados del nombre** —`candidatosPorNombre`—: el nombre del elemento es el de la pieza
 *     (su selector sin el prefijo) o la tiene como raíz (`progress-bar` ← `progress`,
 *     `avatar-group` ← `avatar`). Cada candidato tiene que estar **clasificado** en la tabla —par,
 *     o dos conceptos distintos con su razón y su disparador— o el gate falla. Es lo que impide
 *     que un elemento nuevo que se llame como una pieza entre sin que nadie lo mire, y lo que
 *     pone por escrito las trampas de nombre: `stepper` publicado es un indicador de pasos y
 *     `syn-stepper` un `+/-` numérico.
 *  2. **Declarados por concepto**: `pagination` ↔ `PaginatorComponent`, `drawer` ↔
 *     `ModalComponent`… El concepto que no comparte nombre no deja rastro en el disco; la tabla
 *     es su única memoria, y por eso cada uno lleva su razón.
 *
 * La clave de la pieza es la **CLASE**, no el selector: `syn-skeleton` está declarado dos veces
 * (la lección (d) de la regla 39).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ ES MONTAR. Las DOS señales, en el mismo componente: el **tag** de la pieza en su
 * plantilla (`<syn-x` seguido de espacio, `>` o `/`) **y** la **clase** importada de un
 * especificador que resuelve al fichero que la declara (o a un barril que lo contiene).
 *
 *  - El tag solo no basta: `tooltip.ts` compone `syn-tooltip-${…}` para un id, y un conteo de
 *    menciones lo daba por montado. Tampoco el tag sin la clase: con un esquema de elementos
 *    desconocidos, un `<syn-x>` sin importar compila y no monta nada.
 *  - La clase sola no basta: importarla sin usarla no pinta nada.
 *  - **Una clase que se llama igual no es la pieza.** El `card` publicado se llama
 *    `CardComponent` —como la del design system— y la declara en su propio fichero: por nombre
 *    se contaba a sí mismo (regla 41). Por eso la clase se busca por dónde la resuelve el import,
 *    con la tabla de alias que declara la plataforma en su `tsconfig`.
 *
 * Y se mira el **cierre transitivo** desde la clase que el `main` del elemento registra: si el
 * elemento monta un componente suyo que monta la pieza, la monta. El grafo es de todo
 * `apps/` + `libs/`, no sólo del design system. **Medido el 2026-09-29: hoy no decide nada** —los
 * 14 pares que cumplen montan su pieza desde la raíz, directo—. Se conserva porque delegar en un
 * componente propio es la forma normal de partir un elemento, y se dice hacia dónde empuja: hacia
 * «cumple», si un subárbol monta la pieza de pasada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LÍNEA BASE Y NO TRINQUETE: el árbol no lo cumple. Con el criterio de la regla 39 —un umbral
 * absoluto sólo vale cuando el árbol YA lo cumple— los incumplimientos de hoy son una **LISTA**
 * vigilada en los dos sentidos: uno nuevo rompe, y uno que ya monta su pieza (o que dejó de ser
 * un par) también, para que el commit que lo arregla la baje en el mismo commit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HACIA QUÉ LADO SE EQUIVOCA. Hacia decir «no monta» de más: un import por espacio de nombres
 * (`import * as ds from …`) o una clase re-exportada con otro nombre no se siguen. Es el lado
 * ruidoso y visible —sale rojo y alguien mira—, no el que calla. Del lado que calla sólo queda
 * un import que resuelva a un barril que NO re-exporta la clase, que no compila.
 */

import { posix } from 'node:path';

import { declaracionesDeComponente, sinComentarios } from './consumidores-del-design-system.mjs';

/** El prefijo de los selectores del design system. Lo que se quita para comparar nombres. */
export const PREFIJO_DE_PIEZA = 'syn-';

const barras = (ruta) => ruta.replace(/\\/g, '/');

/**
 * `<syn-x` como TAG: seguido de espacio, `>` o `/`. `syn-x-1` (un id) y `<syn-x-y` no casan.
 * Sólo se construye para selectores que pasaron `esTag`, así que no hay nada que escapar.
 */
const tagDe = (selector) => new RegExp(`<${selector}(?=[\\s>/])`);

/** ¿El selector es un nombre de elemento? Una pieza por atributo no se monta por tag. */
export const esTag = (selector) => typeof selector === 'string' && /^[a-z][a-z0-9-]*$/.test(selector);

// ─────────────────────────────────────────────────────────────────────────────
// Imports y alias
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los import CON NOMBRE de una fuente ya sin comentarios: nombre local → original y especificador.
 *
 * Los `import type` no cuentan —ni la sentencia entera ni el especificador suelto—: un tipo no
 * trae la clase, y montarla la necesita en tiempo de ejecución.
 *
 * @returns {Map<string, {original: string, especificador: string}>}
 */
export function importsConNombre(fuente) {
  const salida = new Map();
  const re = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(fuente)) !== null) {
    if (m[1]) continue;
    for (const parte of m[2].split(',')) {
      const limpia = parte.trim();
      if (!limpia || /^type\s/.test(limpia)) continue;
      const [original, local] = limpia.split(/\s+as\s+/).map((x) => x.trim());
      salida.set(local ?? original, { original, especificador: m[3] });
    }
  }
  return salida;
}

/**
 * La tabla de alias de una plataforma, leída de su `tsconfig` (`compilerOptions.paths`).
 *
 * **Se lee del disco y no se escribe acá**: escribirla sería la segunda copia de algo que la
 * plataforma ya declara —y en este repo la segunda copia es la que se desvía—. Va ordenada de
 * la clave más larga a la más corta, porque una tabla de alias se lee de arriba abajo y casa por
 * prefijo (regla 30): `@x/inputs` antes que `@x`.
 *
 * @param {Record<string, string[]>|undefined} paths
 * @param {string} base carpeta contra la que resuelven los destinos, relativa a la plataforma
 *   (`''` si es la propia raíz de la plataforma).
 * @returns {Array<{prefijo: string, destino: string, comodin: boolean}>}
 */
export function aliasDePaths(paths, base = '') {
  return Object.entries(paths ?? {})
    .filter(([, destinos]) => Array.isArray(destinos) && destinos.length > 0)
    .map(([clave, [destino]]) => {
      const comodin = clave.endsWith('/*');
      return {
        prefijo: comodin ? clave.slice(0, -2) : clave,
        destino: posix.normalize(posix.join(barras(base), barras(comodin ? destino.replace(/\/\*$/, '') : destino))),
        comodin,
      };
    })
    .sort((a, b) => b.prefijo.length - a.prefijo.length);
}

/**
 * A qué ruta (relativa a la plataforma) apunta un especificador, o `null` si es un paquete.
 *
 * @param {string} desde fichero que importa, relativo a la plataforma.
 * @param {string} especificador
 * @param {ReturnType<typeof aliasDePaths>} alias
 */
export function resolverEspecificador(desde, especificador, alias) {
  if (especificador.startsWith('.')) {
    return posix.normalize(posix.join(posix.dirname(barras(desde)), especificador));
  }
  for (const a of alias) {
    if (especificador === a.prefijo) return a.destino;
    if (a.comodin && especificador.startsWith(`${a.prefijo}/`)) {
      return posix.join(a.destino, especificador.slice(a.prefijo.length + 1));
    }
  }
  return null;
}

/**
 * ¿Lo resuelto ES el fichero `ruta`, o un barril/carpeta que lo contiene?
 *
 * Que el barril re-exporte la clase no se comprueba: un import que resuelve a un barril que no
 * la exporta no compila, y el gate mide un árbol que compila.
 */
export function apuntaA(resuelto, ruta) {
  const destino = resuelto.replace(/\.(ts|tsx|js|mjs)$/, '').replace(/\/index$/, '');
  const sinExtension = barras(ruta).replace(/\.(ts|tsx)$/, '');
  return sinExtension === destino || sinExtension.startsWith(`${destino}/`);
}

// ─────────────────────────────────────────────────────────────────────────────
// El grafo de montaje
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Todo componente del árbol, con su plantilla (en línea + `templateUrl`) y sus imports.
 *
 * @param {ReadonlyArray<{ruta: string, fuente: string}>} fuentes todo `.ts` y `.html` de la
 *   plataforma, con la ruta relativa a ella. Los specs se ignoran: un componente anfitrión de un
 *   spec monta la pieza para probarla, no para usarla.
 * @returns {{ nodos: Array<{clase: string, selector: string|null, ruta: string, plantilla: string,
 *   imports: Map<string, {original: string, especificador: string}>}>, plantillasPerdidas: string[] }}
 */
export function componentesDelArbol(fuentes) {
  const porRuta = new Map(fuentes.map((f) => [barras(f.ruta), f.fuente]));
  const nodos = [];
  const plantillasPerdidas = [];

  for (const [ruta, fuente] of porRuta) {
    if (!ruta.endsWith('.ts') || ruta.endsWith('.spec.ts')) continue;
    const declaraciones = declaracionesDeComponente(fuente);
    if (declaraciones.length === 0) continue;
    const imports = importsConNombre(sinComentarios(fuente, ruta));

    for (const { clase, selector, metadatos } of declaraciones) {
      let plantilla = /\btemplate:\s*`([\s\S]*?)`/.exec(metadatos)?.[1] ?? '';
      const url = /\btemplateUrl:\s*['"`]([^'"`]+)['"`]/.exec(metadatos)?.[1];
      if (url) {
        const rutaHtml = posix.normalize(posix.join(posix.dirname(ruta), url));
        const html = porRuta.get(rutaHtml);
        // Una plantilla que no está es un componente cuyo montaje no se puede afirmar. Se
        // devuelve para que el gate lo diga, en vez de medirlo con la plantilla vacía.
        if (html === undefined) plantillasPerdidas.push(`${ruta} → ${url}`);
        else plantilla += `\n${sinComentarios(html, rutaHtml)}`;
      }
      nodos.push({ clase, selector, ruta, plantilla, imports });
    }
  }

  return { nodos, plantillasPerdidas };
}

/**
 * Quién monta a quién: `X → Y` exige las DOS señales en `X`.
 *
 * @param {ReturnType<typeof componentesDelArbol>['nodos']} nodos
 * @param {ReturnType<typeof aliasDePaths>} alias
 * @returns {Map<object, Set<object>>}
 */
export function aristasDeMontaje(nodos, alias) {
  const porClase = new Map();
  for (const n of nodos) {
    if (!porClase.has(n.clase)) porClase.set(n.clase, []);
    porClase.get(n.clase).push(n);
  }

  const aristas = new Map(nodos.map((n) => [n, new Set()]));
  for (const x of nodos) {
    // Candidatos por CLASE: los importados (resueltos contra el fichero que la declara) y los del
    // mismo fichero, que no necesitan import.
    const importados = [...x.imports.values()].flatMap(({ original, especificador }) => {
      const resuelto = resolverEspecificador(x.ruta, especificador, alias);
      if (resuelto === null) return [];
      return (porClase.get(original) ?? []).filter((y) => apuntaA(resuelto, y.ruta));
    });
    const vecinos = nodos.filter((y) => y !== x && y.ruta === x.ruta);

    for (const y of [...importados, ...vecinos]) {
      if (y !== x && esTag(y.selector) && tagDe(y.selector).test(x.plantilla)) aristas.get(x).add(y);
    }
  }
  return aristas;
}

/**
 * La clase que registra el `main` de un elemento, y su nodo.
 *
 * Se reconoce por la forma del adaptador de cada plataforma —`registrarElemento<Plataforma>(tag,
 * Clase, …)`, la obligación 8 de `platform-contract`: el adaptador es el único que registra—.
 * Un `main` que no la tenga devuelve `null` y el gate lo dice: la raíz de un par que no se
 * resuelve es un par sobre el que no se puede afirmar nada.
 *
 * @param {{ruta: string, fuente: string}} main ruta relativa a la plataforma.
 */
export function raizDelElemento(main, nodos, alias) {
  const limpia = sinComentarios(main.fuente, main.ruta);
  const m = /registrarElemento\w*\(\s*['"`]([a-z][a-z0-9-]*)['"`]\s*,\s*(\w+)/.exec(limpia);
  if (!m) return null;
  const [, tag, clase] = m;
  const importada = importsConNombre(limpia).get(clase);
  const resuelto = importada ? resolverEspecificador(main.ruta, importada.especificador, alias) : null;
  const nodo =
    nodos.find((n) =>
      importada
        ? resuelto !== null && n.clase === importada.original && apuntaA(resuelto, n.ruta)
        : n.clase === clase && n.ruta === barras(main.ruta),
    ) ?? null;
  return { tag, clase, nodo };
}

/**
 * Las clases de pieza que alcanza `raiz` por el grafo, con las dos señales en cada paso.
 *
 * @param {object} raiz
 * @param {Map<object, Set<object>>} aristas
 * @param {(nodo: object) => boolean} esPieza
 * @returns {Set<string>}
 */
export function piezasMontadas(raiz, aristas, esPieza) {
  const vistos = new Set([raiz]);
  const pila = [raiz];
  const montadas = new Set();
  while (pila.length > 0) {
    const x = pila.pop();
    for (const y of aristas.get(x) ?? []) {
      if (vistos.has(y)) continue;
      vistos.add(y);
      if (esPieza(y)) montadas.add(y.clase);
      pila.push(y);
    }
  }
  return montadas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Los pares y el veredicto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los elementos cuyo NOMBRE coincide con el de una pieza: exacto o como raíz.
 *
 * Raíz = el nombre de la pieza es la primera o la última palabra del elemento (`progress-bar`,
 * `avatar-group`, `copy-button`). Da ruido a propósito —`testimonial-section` ← `section`—: el
 * que se equivoca por nombre es el que el gate obliga a clasificar.
 *
 * @param {Iterable<string>} nombres los del registry.
 * @param {ReadonlyArray<{clase: string, selector: string}>} piezas
 * @returns {Map<string, {clases: string[], via: string}>}
 */
export function candidatosPorNombre(nombres, piezas) {
  const porNombreDePieza = new Map();
  for (const p of piezas) {
    if (!p.selector.startsWith(PREFIJO_DE_PIEZA)) continue;
    const n = p.selector.slice(PREFIJO_DE_PIEZA.length);
    porNombreDePieza.set(n, [...(porNombreDePieza.get(n) ?? []), p.clase]);
  }

  const candidatos = new Map();
  for (const nombre of nombres) {
    const exacto = porNombreDePieza.get(nombre);
    if (exacto) {
      candidatos.set(nombre, { clases: exacto, via: 'nombre' });
      continue;
    }
    const raices = [...porNombreDePieza].filter(([n]) => nombre.startsWith(`${n}-`) || nombre.endsWith(`-${n}`));
    if (raices.length > 0) {
      candidatos.set(nombre, {
        clases: raices.flatMap(([, clases]) => clases),
        via: `raíz ${raices.map(([n]) => `«${n}»`).join(' y ')}`,
      });
    }
  }
  return candidatos;
}

/**
 * El cruce: la tabla contra lo medido, y los incumplimientos contra la línea base.
 *
 * @param {{
 *   tabla: { gemelas: Record<string, {piezas: string[], razon: string}>,
 *            noGemelas: Record<string, {razon: string, disparador: string}>,
 *            incumplen: string[] },
 *   piezas: ReadonlyArray<{clase: string, selector: string}>,
 *   nombresDelRegistry: ReadonlyArray<string>,
 *   montadas: Map<string, Set<string>|null>,
 * }} entrada `montadas`: por elemento del registry, las clases de pieza que alcanza su raíz, o
 *   `null` si su raíz no se resolvió —y eso rompe, sea par o no—. Un elemento que no está es uno
 *   sin fuente en una plataforma medible.
 */
export function evaluarGemelas({ tabla, piezas, nombresDelRegistry, montadas }) {
  const vacio = (motivo) => ({ fallos: [`VACÍO: ${motivo} Un cruce sobre nada es un verde que no comprobó nada.`], pares: [], cumplen: [], incumplen: [], candidatos: new Map() });
  if (piezas.length === 0) return vacio('no se descubrió ninguna pieza del design system: el recorrido dejó de ver.');
  if (nombresDelRegistry.length === 0) return vacio('el registry no tiene ningún elemento.');
  const conRaiz = [...montadas.values()].filter((m) => m !== null);
  if (conRaiz.length === 0) return vacio('no se resolvió la raíz de ningún elemento: la lectura de los `main` dejó de ver.');
  if (conRaiz.every((m) => m.size === 0)) {
    return vacio('ningún elemento monta ninguna pieza: o la tabla de alias de la plataforma no se leyó, o el grafo dejó de ver.');
  }

  const gemelas = tabla.gemelas ?? {};
  const noGemelas = tabla.noGemelas ?? {};
  const lineaBase = tabla.incumplen ?? [];
  const clases = new Map(piezas.map((p) => [p.clase, p]));
  const registry = new Set(nombresDelRegistry);
  const candidatos = candidatosPorNombre(nombresDelRegistry, piezas);
  const fallos = [];

  if (candidatos.size === 0) fallos.push('VACÍO: la derivación por nombre no dio ni un candidato — el recorrido dejó de ver.');
  const repetidos = lineaBase.filter((n, i) => lineaBase.indexOf(n) !== i);
  if (repetidos.length > 0) fallos.push(`\`incumplen\` repite ${[...new Set(repetidos)].join(', ')}: la línea base es una lista de elementos, uno por línea.`);

  // ── clasificación ──
  for (const [nombre, c] of candidatos) {
    if (nombre in gemelas || nombre in noGemelas) continue;
    fallos.push(
      `sin clasificar: «${nombre}» se llama como ${c.clases.join(' / ')} (${c.via}). Decidí qué es y ` +
        'escribilo en `tools/gemelas-del-design-system.json`: si es el mismo concepto, va en ' +
        '`gemelas` y el elemento la monta; si se llaman igual y son dos cosas, va en `noGemelas` ' +
        'con la razón y el disparador que lo cambiaría. Un nombre que coincide sin decidir es ' +
        'justo la trampa en la que cae quien busca por nombre.',
    );
  }
  for (const nombre of Object.keys(gemelas)) {
    if (nombre in noGemelas) fallos.push(`«${nombre}» está en \`gemelas\` Y en \`noGemelas\`: es una cosa o la otra.`);
  }

  // ── entradas que sobran o no dicen nada ──
  for (const [nombre, v] of Object.entries(gemelas)) {
    if (!registry.has(nombre)) fallos.push(`sobra: \`gemelas.${nombre}\` — ya no hay elemento «${nombre}» en el registry. Borrá la entrada (y de \`incumplen\` si está).`);
    if (!Array.isArray(v.piezas) || v.piezas.length === 0) fallos.push(`\`gemelas.${nombre}\` no nombra ninguna pieza: \`piezas\` es la lista de clases del design system que cuentan.`);
    for (const clase of v.piezas ?? []) {
      if (!clases.has(clase)) fallos.push(`sobra: \`gemelas.${nombre}\` apunta a ${clase}, que ya no es una pieza del design system. Corregí la clase o borrá la entrada.`);
      else if (!esTag(clases.get(clase).selector)) fallos.push(`\`gemelas.${nombre}\`: ${clase} tiene el selector «${clases.get(clase).selector}», que no es un tag — este gate no sabe medir ese montaje y no lo da por bueno.`);
    }
    if (!v.razon?.trim()) fallos.push(`\`gemelas.${nombre}\` no tiene \`razon\`: por qué es el mismo concepto es lo que lee quien la tenga que montar.`);
  }
  for (const [nombre, v] of Object.entries(noGemelas)) {
    if (!candidatos.has(nombre)) fallos.push(`sobra: \`noGemelas.${nombre}\` — ya no se llama como ninguna pieza. Una excepción que sobra deja de leerse: borrala.`);
    if (!v.razon?.trim() || !v.disparador?.trim()) fallos.push(`\`noGemelas.${nombre}\` necesita \`razon\` (por qué NO es la misma pieza) y \`disparador\` (qué lo cambiaría).`);
  }

  // ── la raíz de TODO elemento con fuente, sea par o no ──
  // Un elemento cuya raíz no se lee es uno del que el gate no sabe qué monta: si mañana entra en
  // la tabla no hay nada que medir, y si es un eslabón de otro, corta la cadena. Y es la forma en
  // que se ve que la LECTURA se rompió: con el regex de comentarios de antes, `dropzone` y
  // `file-uploader` perdían su `@Component` y este gate seguía verde, porque no son pares.
  for (const [nombre, alcanzadas] of montadas) {
    if (alcanzadas !== null) continue;
    fallos.push(
      `sin raíz: no se pudo leer qué registra el elemento «${nombre}» —su \`main\` no registra una ` +
        'clase que el grafo encuentre, o su componente no se lee como tal—, así que el gate no ' +
        'puede decir qué monta. Es la red de seguridad: lo que no se mide se rechaza, no se salta ' +
        '(regla 25).',
    );
  }

  // ── el montaje ──
  const pares = [];
  const cumplen = [];
  const incumplen = [];
  for (const [nombre, v] of Object.entries(gemelas)) {
    if (!registry.has(nombre)) continue;
    const alcanzadas = montadas.get(nombre);
    if (alcanzadas === null) continue;
    if (alcanzadas === undefined) {
      fallos.push(
        `sin fuente: «${nombre}» está en \`gemelas\` y no tiene fuente en ninguna plataforma con ` +
          'design system medible, así que el gate no puede afirmar si monta su pieza. O se escribe ' +
          'el elemento, o la entrada no es un par que se pueda vigilar todavía.',
      );
      continue;
    }
    const monta = (v.piezas ?? []).some((c) => alcanzadas.has(c));
    pares.push({ elemento: nombre, piezas: v.piezas, monta });
    (monta ? cumplen : incumplen).push(nombre);
  }
  cumplen.sort();
  incumplen.sort();

  // ── la línea base, en los dos sentidos ──
  const nuevos = incumplen.filter((n) => !lineaBase.includes(n));
  const resueltos = lineaBase.filter((n) => !incumplen.includes(n));
  for (const n of nuevos) {
    const piezasDelPar = gemelas[n].piezas.join(' / ');
    fallos.push(
      `NUEVO incumplimiento: «${n}» tiene gemela en el design system (${piezasDelPar}) y no la ` +
        'monta. Montala: importá su clase y usá su tag en la plantilla. Si el elemento hace algo ' +
        'mejor que la pieza, eso se lleva a la pieza y el elemento queda como un anfitrión ' +
        'delgado (ADR 0134 §4 del CMS); si resultan ser dos conceptos, pasalo a `noGemelas` con ' +
        'su razón. No lo sumes a `incumplen`: la línea base es la deuda medida, no una papelera.',
    );
  }
  for (const n of resueltos) {
    fallos.push(
      pares.some((p) => p.elemento === n) || !(n in gemelas)
        ? `RESUELTO: «${n}» ya no incumple (monta su pieza, o dejó de ser un par). Sacalo de ` +
            '`incumplen` en `tools/gemelas-del-design-system.json` en este MISMO commit: una línea ' +
            'base que afirma una deuda que alguien ya pagó miente.'
        : `«${n}» está en \`incumplen\` y no se pudo medir (ver «sin raíz»).`,
    );
  }

  return { fallos, pares, cumplen, incumplen, candidatos };
}
