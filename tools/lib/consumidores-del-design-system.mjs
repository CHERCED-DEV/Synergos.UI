/**
 * Cuántas piezas del design system no las alcanza ningún elemento (#78).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE. Auditando si los tres árboles son de verdad reutilizables **antes** de la
 * épica de la fábrica. La pregunta no era «¿tiene forma de pieza reusable?» —eso se contesta
 * leyendo— sino **«¿alguien la volvió a usar?»**, que es la regla §0.B.17 del repo hermano: *la
 * reutilización se PRUEBA con el segundo consumidor*. Se aplicaba a las capacidades y a
 * `Bff.Core`, y nunca al design system.
 *
 * Medido: **55** componentes, **18** con cero consumidores y **22 inalcanzables** desde
 * producto. Los 22 viajan dentro de `sg-shared.js` —comprobado buscando su selector compilado
 * en el bundle publicado— que descarga TODA página Angular, lleve el elemento que lleve.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ CIERRE TRANSITIVO Y NO CONTEO DIRECTO. Es la mitad del hallazgo que un conteo plano
 * no ve. Cuatro componentes tienen **exactamente un consumidor** y ese consumidor es a su vez
 * inalcanzable: `syn-list` ← `pricing-card` (0), `syn-radio` y `syn-textarea` ←
 * `configurable-form` (0), `syn-section` ← `option-group` (0).
 *
 * `syn-textarea` **se lee como usado**. Lo usa una pieza que no usa nadie. Es la **regla 5** de
 * `CLAUDE.md` un piso más arriba —*un test que llama al MÉTODO no ve que falte el llamador*— y
 * el mismo movimiento que `clientes-sin-llamador` (#76), que tuvo que decidir que **un spec no
 * cuenta como llamador**. Acá: **un componente muerto no cuenta como consumidor.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ LÍNEA BASE Y NO TRINQUETE ABSOLUTO. Un umbral absoluto —«cero inalcanzables»— dejaría
 * `master` rojo hasta cerrar 22 decisiones de producto, y este repo ya tiene escrito dos veces
 * qué pasa con eso (#68 y #74: *un gate siempre rojo deja de leerse*, y lo que se pierde no es
 * el gate, es lo que el gate era el único en poder decir).
 *
 * La regla que unifica los dos criterios está medida en el hermano
 * (`feedback_measure_the_generator_at_its_best_or_the_finding_is_yours`): **un umbral absoluto
 * sólo vale cuando el árbol YA lo cumple** —el #134 lo eligió porque con cero avisos era
 * gratis—; **con deuda declarada va una línea base**, vigilada en los dos sentidos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Y LA LÍNEA BASE ES UNA LISTA, NO UNA CIFRA. Con un número, retirar uno y escribir otro pasa
 * en verde: la deuda no crece y sin embargo nadie decidió nada. Es
 * `feedback_a_named_list_beats_a_count` del hermano — *una cifra correcta con la lista
 * incompleta es peor que una cifra equivocada, porque la lista es lo que alguien lee para saber
 * qué hay que decidir*.
 *
 * Se vigila en los DOS sentidos: uno nuevo rompe, y uno que **dejó** de ser inalcanzable
 * también, para que el commit que retira o cablea una esté obligado a bajar la línea en el mismo
 * commit. Sin la segunda mitad la línea base se queda afirmando una deuda que ya no existe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ CUENTA COMO CONSUMIDOR, Y QUÉ NO.
 *
 * **La propia carpeta no cuenta** — el `.html` y el `.scss` de un componente lo nombran siempre.
 *
 * **Un barril no cuenta.** Un `index.ts` re-exporta, no consume. Medido con los barriles
 * dentro, los 18 con cero consumidores salen como «1 consumidor» y el runner informa
 * `0 sin un solo consumidor` — exactamente lo que dio la primera versión de la medición.
 *
 * **Pero de QUÉ cifra es responsable hay que medirlo, y me equivoqué al escribirlo primero.**
 * Afirmé que sin la exclusión «el defecto entero pasa en verde», y la mutación lo desmintió:
 * **los 22 inalcanzables salen igual con barriles y sin ellos**, porque un `index.ts` del
 * design system está DENTRO del design system y por tanto no entra en la semilla — no puede
 * resucitar a nadie. Lo que el barril sostiene es `sinConsumidorDirecto`, el 18 contra 22 que
 * el runner imprime, y no la línea base. Es la dirección (a)+(b) del addendum de
 * `feedback_a_gate_that_parses_source_needs_its_own_mutations`: se conserva porque la cifra que
 * la gente lee sí depende de ella, y se dice cuál de las dos, en vez de dejar puesta una
 * explicación que suena bien — que es exactamente donde nadie vuelve a mirar.
 *
 * **Un spec no cuenta**, por la razón de #76: un spec que renderiza el componente prueba que el
 * componente funciona, no que alguien lo use. **Medido: hoy es un no-op** —los 55 specs viven
 * dentro de la carpeta de su componente, así que ya los excluye la regla anterior, y el número
 * sale 22 con ellos y sin ellos—. Se conserva porque el disco puede crecer hacia el caso (un
 * `__tests__/` al lado), y se dice que hoy no sostiene nada en vez de insinuar que sí: es la
 * dirección (a) del addendum de `feedback_a_gate_that_parses_source_needs_its_own_mutations`.
 *
 * **Los comentarios se recortan**, y **también es un no-op hoy** —22 con recorte y 22 sin él,
 * medido—. Se conserva por lo mismo: un `<!-- <syn-tooltip> -->` en una plantilla, o un
 * `<remarks>` que diga «reemplaza a `syn-panel`», son consumidores falsos que dejarían a una
 * pieza muerta con aspecto de viva (falso NEGATIVO). Igual que arriba: la dirección se mide, no
 * se supone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HACIA QUÉ LADO SE EQUIVOCA. Un componente cuenta como usado si aparece su selector en una
 * plantilla **o** su clase en un `.ts`. La unión puede dar de más —una clase con el mismo nombre
 * declarada en otra parte— así que el sesgo va hacia el **falso negativo**: reporta menos
 * muertos de los que hay, nunca más. Es el lado correcto para un gate de deuda, por la lección
 * del #158 del hermano: *un gate que marca al bueno enseña a ignorarlo*.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE GATE NO DICE. Que retirar los 22 adelgace `sg-shared.js` en una cantidad concreta.
 * Se midió la FUENTE —170.630 B de 394.809, el 43 %— y eso es un proxy, no el coste en el
 * bundle, que exige construir la variante. Lo binario sí está comprobado: están dentro.
 *
 * Tampoco dice que el design system esté mal diseñado. Las 33 alcanzables incluyen piezas con
 * 47, 36 y 22 consumidores, que es reutilización probada. Lo que dice es cuánto de cada tier no
 * tiene un solo caso que lo respalde, y **eso lo imprime el runner, derivado** (`repartoPorTier`):
 * el 2026-09-29, de los 22, `primitives` 8 de 23 · `compositions` 8 de 16 · `patterns` 6 de 12 ·
 * `states` 0 de 4. Cuanto más arriba en la pirámide, algo menos se reusa —35 %, 50 %, 50 %—, y
 * los estados se usan todos.
 *
 * **Esta frase decía «9 de los 12 `patterns/` […] contra 6 de 23 `primitives/`», y era falsa**
 * (#172): la conclusión apuntaba bien y las dos cifras no — escritas a mano en la prosa, sin que
 * nada las derivara. Es la lección que este repo ya tiene escrita para las cifras de su
 * `CLAUDE.md`: una cifra que ninguna herramienta imprime se desvía sin que nadie lo note, así que
 * la guía cita al gate y el gate la imprime. (Y «31 alcanzables» tampoco: son 33, lo que el
 * runner dice en cada corrida.)
 */

import { relative, resolve } from 'node:path';

import ts from 'typescript';

import { PLATAFORMAS } from './element-sources.mjs';

/** Dónde vive el design system, relativo a la raíz de la plataforma. */
export const RAIZ_DEL_DESIGN_SYSTEM = 'libs/shared/src/components';

/**
 * Las plataformas que tienen design system, y dónde está la raíz de cada una.
 *
 * Se deriva de `PLATAFORMAS`. Escribir la carpeta de una plataforma a mano resolvería a un
 * literal una dimensión de lo que se recorre —la regla 25— y además lo prohíbe el censo de
 * `frameworks.spec.mjs`. **Sólo tienen design system las plataformas que lo tengan**: una que
 * no declara `RAIZ_DEL_DESIGN_SYSTEM` se salta en silencio y es correcto, porque no hay nada que
 * medir ahí. Lo que NO sería correcto es que no hubiera ninguna, y de eso se ocupa la red de
 * seguridad de cada gate.
 *
 * Vivía en el runner de este gate; la usan los dos gates del design system (#81), y con dos
 * copias la del segundo es la que se desvía.
 *
 * @template {{framework: string, apps: string}} P
 * @param {{ raiz: string, esDirectorio: (ruta: string) => boolean, plataformas?: ReadonlyArray<P> }} io
 * @returns {Array<P & {base: string}>} la plataforma tal cual, más `base`: su raíz, absoluta.
 */
export function plataformasConDesignSystem({ raiz, esDirectorio, plataformas = PLATAFORMAS }) {
  return plataformas
    // `apps` es `platforms/<x>/apps`; la raíz de la plataforma es su padre.
    .map((p) => ({ ...p, base: resolve(raiz, p.apps, '..') }))
    .filter((p) => esDirectorio(resolve(p.base, RAIZ_DEL_DESIGN_SYSTEM)));
}

/**
 * Lo que los dos gates del design system leen de UNA plataforma (#78, #81): cuántas fuentes
 * tiene su design system, qué piezas declaran, y todo el código y las plantillas de `apps/` y
 * `libs/`, con la ruta relativa a la plataforma.
 *
 * Vive acá, con el disco inyectado, para que el segundo gate no escriba una segunda lectura: qué
 * extensiones cuentan como fuente del design system y cuál es el universo de consumidores son
 * decisiones de UN sitio.
 *
 * @param {{ base: string, listar: (dir: string) => string[], leer: (ruta: string) => string }} io
 *   `base`, la raíz de la plataforma; `listar`, los ficheros bajo una carpeta (recursivo, rutas
 *   absolutas, vacío si no existe); `leer`, el texto de uno.
 */
export function leerDesignSystem({ base, listar, leer }) {
  const relativa = (ruta) => relative(base, ruta).replace(/\\/g, '/');
  const delDs = listar(resolve(base, RAIZ_DEL_DESIGN_SYSTEM));

  // Todo lo que PODRÍA declarar un componente, sea cual sea la forma de la plataforma. Es lo
  // que permite distinguir «acá no hay nada» de «acá hay algo que no sé leer» (regla 25).
  const fuentesDelDs = delDs.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f) && !/\.spec\.tsx?$/.test(f)).length;

  const piezas = componentesDeclarados(
    delDs
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .map((f) => ({ ruta: relativa(f), fuente: leer(f) })),
  );

  // El universo de posibles consumidores: los elementos publicables Y las demás libs. Sin
  // `libs/`, un componente usado sólo por `libs/shells` saldría muerto — falso positivo, que es
  // el lado del que el gate de #78 NO se puede equivocar.
  const fuentes = ['apps', 'libs']
    .flatMap((carpeta) => listar(resolve(base, carpeta)))
    .filter((f) => /\.(ts|tsx|html)$/.test(f))
    .map((f) => ({ ruta: relativa(f), fuente: leer(f) }));

  return { fuentesDelDs, piezas, fuentes };
}

/**
 * Las plataformas cuyo design system este gate NO sabe leer, con su razón y su disparador.
 *
 * **Esto existe porque el descubrimiento busca `@Component({…}) export class`, que es la forma
 * de Angular** — o sea que una dimensión de lo que se mide está resuelta a una constante, que es
 * la **regla 25** exacta. Sin este censo, una plataforma con design system propio saldría
 * `0 componentes · 0 inalcanzables` y el gate informaría verde sobre el sitio equivocado. *Lo
 * que no se mide se rechaza, no se salta.*
 *
 * Se vigila en los DOS sentidos: una plataforma con fuentes y cero componentes que no esté acá
 * rompe, y una declarada de la que YA se descubren componentes también, porque una excepción
 * que sobra deja de leerse.
 */
export const DESIGN_SYSTEM_NO_MEDIBLE = {
  preact: {
    razon:
      'Preact declara sus componentes como funciones exportadas (`export function Badge(...)`), ' +
      'no con `@Component`. Y la razón para no escribir el descubridor hoy no es pereza: su ' +
      'design system tiene UNA pieza —`badge`— y esa pieza ES el elemento publicado, así que no ' +
      'hay nada que pueda estar sin alcanzar. Un descubridor para medir cero es la abstracción ' +
      'prematura de §6. Contesta «por qué esto NO se mide», no «por qué todavía no».',
    // El disparador NO escribe la ruta: la construye el gate con `RAIZ_DEL_DESIGN_SYSTEM` y la
    // raíz que le da `PLATAFORMAS`. Escribirla acá sería la segunda copia de un valor que el
    // módulo ya tiene como constante, y en este repo la segunda copia es la que se desvía
    // (la tabla del import map en #58, `TIER_BY_NAME` en #43).
    disparador:
      'El día que su carpeta de componentes tenga más piezas que elementos publica esa ' +
      'plataforma — ahí ya puede haber una que nadie alcance, y el descubridor se escribe.',
    ticket: 'CHERCED-DEV/Synergos.UI#78',
  },
};

/**
 * Que ninguna plataforma con design system quede sin medir por la forma en que lo declara.
 *
 * @param {ReadonlyArray<{framework: string, fuentes: number, componentes: number}>} plataformas
 * @param {Record<string, {razon: string}>} censo
 */
export function revisarCobertura(plataformas, censo = DESIGN_SYSTEM_NO_MEDIBLE) {
  const fallos = [];
  const nombres = plataformas.map((p) => p.framework);

  for (const p of plataformas) {
    const declarada = p.framework in censo;
    if (p.fuentes > 0 && p.componentes === 0 && !declarada) {
      fallos.push(
        `\`${p.framework}\` tiene ${p.fuentes} fuente(s) en \`${RAIZ_DEL_DESIGN_SYSTEM}\` y este ` +
          'gate no descubrió NI UN componente: o su design system se declara de otra forma —y ' +
          'entonces hay que escribir su descubridor o declararlo en `DESIGN_SYSTEM_NO_MEDIBLE` ' +
          'con su razón y su disparador— o el recorrido se rompió. Un `0 inalcanzables` sobre ' +
          'una plataforma que nadie miró es un verde sobre el vacío (regla 25).',
      );
    }
    if (p.componentes > 0 && declarada) {
      fallos.push(
        `\`${p.framework}\` está en \`DESIGN_SYSTEM_NO_MEDIBLE\` y ya se le descubren ` +
          `${p.componentes} componente(s): la excepción sobra. Borrala en el mismo commit — una ` +
          'excepción que sobra deja de leerse.',
      );
    }
  }

  for (const framework of Object.keys(censo)) {
    if (!nombres.includes(framework)) {
      fallos.push(
        `\`${framework}\` está en \`DESIGN_SYSTEM_NO_MEDIBLE\` y ya no tiene design system (o ya ` +
          'no es una plataforma). Borrá la entrada.',
      );
    }
  }

  return { fallos };
}

/** Un barril re-exporta; no consume. */
export const esBarril = (ruta) => /(^|[\\/])(index|public-api|public_api)\.ts$/.test(ruta);

/** Un spec prueba que la pieza funciona, no que alguien la use (#76). */
export const esSpec = (ruta) => /\.spec\.tsx?$/.test(ruta);

const K = ts.SyntaxKind;

/**
 * Después de estos tokens una `/` ABRE una expresión regular; después de cualquier otro, divide.
 *
 * El escáner de TypeScript no sabe cuál de las dos es sin el parser —es la ambigüedad clásica de
 * la gramática— y la resuelve quien lo llama con `reScanSlashToken`. Importa por una razón
 * concreta del árbol: `fab.ts` tiene `/^https?:\/\//i`, y leída como división la `//` del final
 * abriría un comentario de línea.
 */
const ANTES_DE_UNA_REGEX = new Set([
  K.Unknown, K.OpenParenToken, K.OpenBracketToken, K.OpenBraceToken, K.CloseBraceToken,
  K.CommaToken, K.SemicolonToken, K.ColonToken, K.QuestionToken, K.QuestionQuestionToken,
  K.EqualsToken, K.EqualsEqualsEqualsToken, K.ExclamationEqualsEqualsToken, K.ExclamationToken,
  K.AmpersandAmpersandToken, K.BarBarToken, K.PlusToken, K.MinusToken, K.AsteriskToken,
  K.EqualsGreaterThanToken, K.ReturnKeyword, K.TypeOfKeyword, K.CaseKeyword,
]);

/** El texto con todo menos los saltos de línea pasado a espacios: conserva líneas y columnas. */
const enBlanco = (texto) => texto.replace(/[^\n]/g, ' ');

/**
 * El CÓDIGO sin sus comentarios, leído con el escáner de TypeScript (CHERCED-DEV/Synergos.UI#81).
 *
 * **Era un regex y se comía código.** `/\/\*[\s\S]*?\*\//` no sabe qué es una cadena: el `'/*'`
 * de `dropzone.ts:160` abría un comentario falso que se cerraba en el primer `*\/` de verdad, y
 * el `@Component` entero desaparecía —el de `dropzone` y el de `file-uploader`: 195 componentes
 * vistos en `apps/` + `libs/` contra 197—. Lo encontró la auditoría de los dos pisos (hallazgo H5
 * del informe 14) y no cambiaba la cifra de #78, porque esos dos elementos no montan piezas; sí
 * dejaba sin raíz a dos elementos en el grafo de `gemelas-del-design-system`, que es el que lo
 * necesita entero.
 *
 * **Y no se arregló reusando el barrido «que respeta cadenas» de `contract-schema.mjs`**: medido
 * contra el escáner sobre los 606 `.ts` de `apps/` + `libs/`, diverge en 3 —una regex con `\/\/`
 * la lee como comentario de línea— y el regex de antes, en 4. (El de `clientes-sin-llamador.mjs`
 * no sirve para esto: quita también las cadenas, y de una cadena salen el selector y la
 * plantilla en línea.) El escáner sabe de cadenas, de plantillas con `${…}` anidadas y, con la
 * ayuda de arriba, de expresiones regulares. Ya estaba en el repo (lo usa
 * `medir-frontera-shared.mjs`).
 */
export function sinComentariosDeCodigo(fuente) {
  const escaner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, fuente);
  let salida = '';
  let anterior = K.Unknown;
  // Una entrada por plantilla `…${` abierta: cuántas llaves se abrieron dentro de su expresión.
  const plantillas = [];

  for (let token = escaner.scan(); token !== K.EndOfFileToken; token = escaner.scan()) {
    if ((token === K.SlashToken || token === K.SlashEqualsToken) && ANTES_DE_UNA_REGEX.has(anterior)) {
      token = escaner.reScanSlashToken();
    }
    if (token === K.OpenBraceToken && plantillas.length > 0) plantillas[plantillas.length - 1] += 1;
    if (token === K.CloseBraceToken && plantillas.length > 0) {
      if (plantillas[plantillas.length - 1] === 0) {
        token = escaner.reScanTemplateToken(false);
        if (token === K.TemplateTail) plantillas.pop();
      } else {
        plantillas[plantillas.length - 1] -= 1;
      }
    }
    if (token === K.TemplateHead) plantillas.push(0);

    const texto = escaner.getTokenText();
    if (token === K.SingleLineCommentTrivia || token === K.MultiLineCommentTrivia) {
      salida += enBlanco(texto);
      continue;
    }
    salida += texto;
    if (token !== K.WhitespaceTrivia && token !== K.NewLineTrivia) anterior = token;
  }

  return salida;
}

/** Una plantilla sin sus `<!-- … -->`. Es el único comentario que tiene el HTML. */
export const sinComentariosDePlantilla = (html) => html.replace(/<!--[\s\S]*?-->/g, enBlanco);

/**
 * Un fichero sin comentarios, según lo que sea: una plantilla o código.
 *
 * Al código también se le quitan los `<!-- … -->`, porque una plantilla EN LÍNEA
 * (`template: \`…\``) vive dentro de una cadena y el escáner la deja entera.
 *
 * Se conservan los saltos de línea para que nada de lo de arriba dependa de los números de
 * línea, y porque un `join` sin ellos pegaría un identificador contra el siguiente.
 *
 * @param {string} fuente
 * @param {string} [ruta] con `.html`, sólo se quitan los comentarios de plantilla. Pasarle el
 *   escáner de código a un HTML convertiría el apóstrofo de «don't» en una cadena abierta.
 */
export function sinComentarios(fuente, ruta = '') {
  if (ruta.endsWith('.html')) return sinComentariosDePlantilla(fuente);
  return sinComentariosDePlantilla(sinComentariosDeCodigo(fuente));
}

/**
 * Cada `@Component({…}) export class X` de una fuente: la clase, su selector y el bloque de
 * metadatos entero.
 *
 * Es LA lectura de «qué es un componente» de los dos gates del design system: éste la usa para
 * las piezas, y `gemelas-del-design-system` (#81) para todo el árbol —elementos, shells, la
 * tienda—, porque necesita además la plantilla que el bloque declara. Dos regex para la misma
 * pregunta es cómo se acaba con una afinada y otra mintiendo.
 *
 * @param {string} fuente código, con o sin comentarios (se quitan acá).
 * @returns {Array<{clase: string, selector: string|null, metadatos: string}>}
 */
export function declaracionesDeComponente(fuente) {
  const limpia = sinComentarios(fuente);
  const declaraciones = [];
  // Puede haber varios `@Component` por fichero — `states/` los agrupa.
  const re = /@Component\(\{[\s\S]*?\}\)\s*export\s+class\s+(\w+)/g;
  let m;
  while ((m = re.exec(limpia)) !== null) {
    declaraciones.push({
      clase: m[1],
      selector: /selector:\s*['"`]([^'"`]+)['"`]/.exec(m[0])?.[1] ?? null,
      metadatos: m[0],
    });
  }
  return declaraciones;
}

/**
 * Los componentes que declara el design system.
 *
 * @param {ReadonlyArray<{ruta: string, fuente: string}>} ficheros rutas relativas a la
 *   plataforma, ya filtradas a `.ts` que no sean specs.
 * @returns {Array<{clase: string, selector: string, carpeta: string, tier: string}>}
 */
export function componentesDeclarados(ficheros) {
  const piezas = [];

  for (const { ruta, fuente } of ficheros) {
    for (const { clase, selector } of declaracionesDeComponente(fuente)) {
      if (!selector) continue;
      const rel = ruta.replace(/\\/g, '/');
      const carpeta = rel.replace(/\/[^/]+$/, '');
      piezas.push({
        clase,
        selector,
        carpeta,
        tier: carpeta.slice(RAIZ_DEL_DESIGN_SYSTEM.length + 1).split('/')[0] ?? '',
      });
    }
  }

  return piezas;
}

/**
 * Qué piezas no alcanza ningún elemento, por cierre transitivo.
 *
 * Semilla: lo que usa algo de FUERA del design system. Después se propaga — una pieza que sólo
 * usan piezas vivas también está viva.
 *
 * **La clave es la CLASE y no el selector**, y es una decisión medida: `syn-empty-state` y
 * `syn-skeleton` están declarados **dos veces cada uno** (en `patterns/`+`states/` y en
 * `primitives/`+`states/`), así que una línea base por selector confundiría dos piezas
 * distintas. Las clases sí son únicas — comprobado.
 *
 * @param {ReadonlyArray<{clase: string, selector: string, carpeta: string, tier: string}>} componentes
 * @param {ReadonlyArray<{ruta: string, fuente: string}>} fuentes todo `.ts`/`.html`/`.tsx` de
 *   la plataforma, con la ruta relativa a ella.
 */
export function inalcanzablesDesdeProducto(componentes, fuentes) {
  const util = fuentes
    .map((f) => ({ ruta: f.ruta.replace(/\\/g, '/'), fuente: f.fuente }))
    .filter((f) => !esBarril(f.ruta) && !esSpec(f.ruta))
    .map((f) => ({ ruta: f.ruta, limpia: sinComentarios(f.fuente, f.ruta) }));

  /** @type {Map<string, string[]>} */
  const consumidores = new Map();
  for (const p of componentes) {
    const clase = new RegExp(`\\b${p.clase}\\b`);
    consumidores.set(
      p.clase,
      util
        .filter((f) => !f.ruta.startsWith(`${p.carpeta}/`))
        .filter((f) => f.limpia.includes(`<${p.selector}`) || clase.test(f.limpia))
        .map((f) => f.ruta),
    );
  }

  const dentroDelDs = (ruta) => ruta.startsWith(`${RAIZ_DEL_DESIGN_SYSTEM}/`);
  const dueño = (ruta) => componentes.find((q) => ruta.startsWith(`${q.carpeta}/`));

  const vivas = new Set(
    componentes.filter((p) => consumidores.get(p.clase).some((r) => !dentroDelDs(r))).map((p) => p.clase),
  );

  let crecio = true;
  while (crecio) {
    crecio = false;
    for (const p of componentes) {
      if (vivas.has(p.clase)) continue;
      const viva = consumidores.get(p.clase).some((r) => {
        const q = dueño(r);
        return q !== undefined && vivas.has(q.clase);
      });
      if (viva) {
        vivas.add(p.clase);
        crecio = true;
      }
    }
  }

  const inalcanzables = componentes
    .filter((p) => !vivas.has(p.clase))
    .map((p) => p.clase)
    .sort((a, b) => a.localeCompare(b));

  const sinConsumidorDirecto = componentes
    .filter((p) => consumidores.get(p.clase).length === 0)
    .map((p) => p.clase)
    .sort((a, b) => a.localeCompare(b));

  return { inalcanzables, sinConsumidorDirecto, alcanzables: vivas.size, medidos: componentes.length };
}

/**
 * Cuántas piezas tiene cada tier y cuántas de ellas no alcanza nadie (#172).
 *
 * **Existe porque la cifra por tier estaba escrita a mano y era falsa** —«9 de los 12
 * `patterns/`» cuando son 6—. Se deriva de lo que el descubrimiento YA calculó: los tiers salen
 * de las carpetas de los componentes, no de una lista, así que un tier nuevo aparece solo y uno
 * vacío de inalcanzables sale con su **0** en vez de desaparecer (un tier que no se imprime se lee
 * como uno que no existe).
 *
 * Orden: de más piezas a menos, y a igualdad por nombre. Es un orden derivado —no una pirámide
 * escrita a mano— y hoy coincide con la base de la pirámide primero.
 *
 * @param {ReadonlyArray<{clase: string, tier: string}>} componentes
 * @param {ReadonlyArray<string>} inalcanzables clases, como las devuelve `inalcanzablesDesdeProducto`
 * @returns {Array<{tier: string, total: number, inalcanzables: number}>}
 */
export function repartoPorTier(componentes, inalcanzables) {
  const muertas = new Set(inalcanzables);
  /** @type {Map<string, {tier: string, total: number, inalcanzables: number}>} */
  const porTier = new Map();
  for (const p of componentes) {
    const tier = p.tier || '(sin tier)';
    const fila = porTier.get(tier) ?? { tier, total: 0, inalcanzables: 0 };
    fila.total += 1;
    if (muertas.has(p.clase)) fila.inalcanzables += 1;
    porTier.set(tier, fila);
  }
  return [...porTier.values()].sort((a, b) => b.total - a.total || a.tier.localeCompare(b.tier));
}

/** El reparto en una línea: `tier inalcanzables/total (porcentaje)`. */
export function formatearReparto(reparto) {
  return reparto
    .map((t) => `${t.tier} ${t.inalcanzables}/${t.total} (${Math.round((100 * t.inalcanzables) / t.total)} %)`)
    .join(' · ');
}

/**
 * La lista medida contra la línea base, en los dos sentidos.
 *
 * @param {ReadonlyArray<string>} inalcanzables
 * @param {ReadonlyArray<string>} lineaBase
 * @param {number} medidos cuántos componentes se descubrieron — la red de seguridad.
 */
export function cruzarConLaLineaBase(inalcanzables, lineaBase, medidos) {
  // Si el descubrimiento deja de ver, todo lo de abajo pasa sin mirar nada Y el segundo diente
  // acusaría a la línea base entera. Es el 12/12 sobre la lista vacía del #136 del hermano.
  if (medidos === 0) {
    return {
      fallos: [
        'no se descubrió ningún componente del design system: el recorrido dejó de ver, y un ' +
          'cruce sobre cero piezas es un verde que no comprobó nada.',
      ],
      nuevos: [],
      resueltos: [],
    };
  }

  const nuevos = inalcanzables.filter((c) => !lineaBase.includes(c));
  const resueltos = lineaBase.filter((c) => !inalcanzables.includes(c));
  const fallos = [];

  if (nuevos.length > 0) {
    fallos.push(
      `${nuevos.length} pieza(s) del design system que nadie alcanza y que no estaban en la ` +
        `línea base: ${nuevos.join(', ')}. Un componente que no usa ningún elemento viaja igual ` +
        'en el runtime compartido de su plataforma, que descarga toda página que lleve uno de ' +
        'sus elementos. Decidí qué es —usarla, fusionarla si duplica un concepto, declararla con ' +
        'su disparador o, sólo con evidencia, retirarla (#78, regla 40)— y no la sumes a la línea ' +
        'base: la línea base es la deuda medida, no una papelera.',
    );
  }

  if (resueltos.length > 0) {
    fallos.push(
      `${resueltos.length} pieza(s) de la línea base ya no corresponden: ${resueltos.join(', ')}. ` +
        'O las alcanza alguien, o ya no existen. Bajá la línea base en el MISMO commit —con ' +
        '`--actualizar`— o se queda afirmando una deuda que alguien ya pagó, y una línea base que ' +
        'miente es peor que no tenerla.',
    );
  }

  return { fallos, nuevos, resueltos };
}
