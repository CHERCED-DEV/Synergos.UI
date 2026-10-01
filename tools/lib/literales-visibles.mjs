/**
 * Textos visibles escritos a mano en un elemento: los que no pasan por `t()` (ADR 0136 §4 del
 * CMS, piloto CMS#186). Funciones puras: el compilador de TS se inyecta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE, Y POR QUÉ CON LÍNEA BASE.
 *
 * La auditoría del CMS (informe 16 §2) contó ≈3.235 textos de interfaz escritos a mano, el 75 % en
 * las verticales: el diccionario existe y casi nadie lo usa. Bajarlos a cero de golpe es una
 * migración, no un gate. Lo que SÍ se puede hoy es que no crezcan: cada elemento tiene su cifra
 * en `tools/literales-visibles.baseline.json`, y un texto nuevo a mano la sube — rojo. Y al revés:
 * migrar textos la baja, y la línea base se reescribe en el mismo commit (`--actualizar`), para
 * que la deuda que se pagó no se pueda volver a contraer en silencio (trinquete en los dos
 * sentidos, regla 4 del contexto común).
 *
 * El detector es el del informe 16, medido allá: precisión ≈99 % (1 falso positivo en 154
 * muestras) y recall ≈97 %. No es exacto, y no necesita serlo: lo que se vigila es la DIFERENCIA
 * contra la línea base, y un falso positivo estable no la mueve.
 *
 * Lo que NO cuenta, a propósito:
 *  - los argumentos de `t('Clave', 'Respaldo')`: el respaldo ES el texto traducido cuando la
 *    página no publica la clave. Es la salida de la deuda, no la deuda;
 *  - specs, la página de vista previa (`src/index.html`) y los ficheros de DATOS (`*-api.client`,
 *    mocks, demos): ahí un texto es contenido de ejemplo, no interfaz;
 *  - las librerías: las hojas reciben strings y su texto por defecto es el respaldo de quien no
 *    les pasa nada. La deuda se cuenta en el elemento que las monta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── ¿parece texto humano? ───────────────────────────────────────────────────
export function esHumano(s) {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length < 2 || !/\p{L}/u.test(t)) return false;
  if (/^(https?:|mailto:|tel:|\/|\.\.?\/|#|data:|blob:|www\.)/i.test(t)) return false;
  if (/^[\w.-]+\.(ts|js|mjs|css|scss|html|json|svg|png|jpe?g|webp|gif|mp4|webm|vtt|pdf|ico)$/i.test(t)) return false;
  if (/^[a-z0-9]+([-_:./][a-z0-9]+)*$/.test(t)) return false; // kebab/snake/evento/clase
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(t)) return false; // camelCase
  if (/^[A-Z0-9_]+$/.test(t)) return false; // SCREAMING
  if (/^[A-Za-z]+(\.[A-Za-z0-9]+)+$/.test(t)) return false; // claves con punto
  if (/^[a-z]{2}(-[A-Z]{2})?$/.test(t)) return false; // locale
  if (/^[A-Z][a-z]+(-[A-Z][a-z]+)+$/.test(t)) return false; // Content-Type
  if (/^[a-z]+\/[a-z0-9.+-]+$/i.test(t)) return false; // MIME
  if (/^[yMdHhmsaEZ.:/\-, ']+$/.test(t)) return false; // formatos de fecha
  if (/^[.#[:]|[[\]>~]|:not\(|::?[a-z-]+\(|\b(var|calc|rgba?|hsla?|url)\(/.test(t)) return false; // selectores / CSS
  if (/;\s*$|^[a-z-]+\s*:\s*[^ ]/.test(t) && !/\s\p{L}+\s/u.test(t)) return false; // declaraciones CSS
  if (/^[a-z0-9-]+( [a-z0-9_-]+)+$/.test(t) && /-|__/.test(t)) return false; // lista de clases
  if (/^\d+(\.\d+)?(px|rem|em|ms|s|%|vh|vw|fr)?( \d+(\.\d+)?(px|rem|em|ms|s|%|vh|vw|fr)?)*$/.test(t)) return false;
  if (/^[A-Z][A-Za-z]*(Service|Component|Directive|Pipe|Error|Event)$/.test(t)) return false;
  if (/\p{L}\s+\p{L}/u.test(t)) return true; // varias palabras
  if (/[áéíóúñÁÉÍÓÚÑ¿¡…]/.test(t)) return true; // acento/ñ
  if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+[.!?…:]?$/.test(t)) return true; // «Cerrar», «Next»
  return false;
}

// ── plantillas ───────────────────────────────────────────────────────────────
const ATTR_VISIBLES = new Set(['aria-label', 'placeholder', 'title', 'alt', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'label']);
const NO_BINDING = new Set(['class', 'style', 'role', 'id', 'href', 'src', 'srcset', 'type', 'name', 'for', 'rel', 'target', 'tabindex', 'track', 'ngClass', 'ngStyle', 'ngSwitch', 'ngSwitchCase', 'loading', 'decoding', 'autocomplete', 'inputmode', 'pattern', 'lang', 'dir', 'viewBox', 'd', 'fill', 'stroke', 'transform', 'points', 'x', 'y', 'width', 'height']);
const NO_ATTR_BIND = /^(attr\.)?(aria-(current|live|hidden|expanded|selected|pressed|checked|disabled|controls|describedby|labelledby|owns|haspopup|modal|busy|atomic|relevant|invalid|required|orientation|sort|level|posinset|setsize|valuenow|valuemin|valuemax|activedescendant|autocomplete|readonly|multiselectable)|data-.*|role|class\..*|style\..*|id|href|src|type|name|for|rel|target|tabindex|lang|dir|loading|datetime|hreflang|download|value|min|max|step|autocomplete|inputmode|colspan|rowspan|width|height|viewBox|d|fill|stroke|cx|cy|r|x|y|x1|x2|y1|y2|points|transform|ngClass|ngStyle|ngSwitch|ngSwitchCase|formControlName)$/;

/** Los literales entre comillas de una expresión de plantilla. */
export function literalesEnExpresion(expr) {
  const out = [];
  for (const m of expr.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) out.push(m[1] ?? m[2]);
  return out;
}

function quitarControl(texto) {
  let s = texto;
  for (;;) {
    const m = /@(else\s+if|if|for|switch|case|defer|placeholder|loading|error)\s*\(/.exec(s);
    if (!m) break;
    let i = m.index + m[0].length;
    let prof = 1;
    while (i < s.length && prof > 0) {
      if (s[i] === '(') prof++;
      else if (s[i] === ')') prof--;
      i++;
    }
    s = s.slice(0, m.index) + ' ' + s.slice(i);
  }
  s = s.replace(/@let\s+[\s\S]*?;/g, ' ').replace(/@(else|empty|default|placeholder|loading|error|defer)\b/g, ' ');
  return s.replace(/[{}]/g, ' ');
}

/** Los textos humanos de una plantilla: nodos de texto, atributos visibles y literales en bindings. */
export function analizarPlantilla(src, base = 1) {
  const out = [];
  const s = src.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
  const lin = (idx) => base + (s.slice(0, idx).match(/\n/g)?.length ?? 0);
  let i = 0;
  let texto = '';
  let textoIni = 0;
  let enStyle = false;
  const flush = () => {
    if (!texto) return;
    if (!enStyle) {
      let t = texto.replace(/\{\{([\s\S]*?)\}\}/g, (_, e) => {
        for (const l of literalesEnExpresion(e)) if (esHumano(l)) out.push({ tipo: 'interpolacion', texto: l, linea: lin(textoIni) });
        return ' ';
      });
      t = quitarControl(t).replace(/&[a-z]+;|&#\d+;/gi, ' ');
      const limpio = t.replace(/\s+/g, ' ').trim();
      if (/\p{L}/u.test(limpio) && limpio.length >= 2) out.push({ tipo: 'texto', texto: limpio, linea: lin(textoIni) });
    }
    texto = '';
  };
  while (i < s.length) {
    if (s[i] === '<' && /[a-zA-Z/]/.test(s[i + 1] ?? '')) {
      flush();
      let j = i + 1;
      let q = null;
      while (j < s.length) {
        const c = s[j];
        if (q) {
          if (c === q) q = null;
        } else if (c === '"' || c === "'") q = c;
        else if (c === '>') break;
        j++;
      }
      const tag = s.slice(i, j + 1);
      const nombre = /^<\/?([a-zA-Z][\w-]*)/.exec(tag)?.[1]?.toLowerCase();
      if (nombre === 'style') enStyle = !tag.startsWith('</');
      for (const m of tag.matchAll(/([[(]{0,2}[#*@]?[\w.:-]+[\])]{0,2})\s*=\s*("([^"]*)"|'([^']*)')/g)) {
        const an = m[1];
        const val = m[3] ?? m[4];
        if (an.startsWith('(') || an.startsWith('*') || an.startsWith('#')) continue;
        if (an.startsWith('[')) {
          const prop = an.replace(/^\[|\]$/g, '');
          if (NO_ATTR_BIND.test(prop) || NO_BINDING.has(prop)) continue;
          for (const l of literalesEnExpresion(val)) if (esHumano(l)) out.push({ tipo: `binding[${prop}]`, texto: l, linea: lin(i) });
        } else if (ATTR_VISIBLES.has(an.toLowerCase())) {
          const sinInterp = val.replace(/\{\{([\s\S]*?)\}\}/g, (_, e) => {
            for (const l of literalesEnExpresion(e)) if (esHumano(l)) out.push({ tipo: `attr-interp[${an}]`, texto: l, linea: lin(i) });
            return ' ';
          });
          if (/\p{L}/u.test(sinInterp) && sinInterp.trim().length >= 2) out.push({ tipo: `attr[${an}]`, texto: sinInterp.trim(), linea: lin(i) });
        }
      }
      i = j + 1;
      textoIni = i;
      continue;
    }
    if (!texto) textoIni = i;
    texto += s[i];
    i++;
  }
  flush();
  return out;
}

// ── TS ───────────────────────────────────────────────────────────────────────
// Llamadas cuyo argumento de texto es para el DESARROLLADOR o técnico. `set`, `emit`… NO van:
// `this.estado.set('Enviando…')` es texto visible (lo decide `esHumano`).
const LLAMADAS_TECNICAS = /^(querySelector(All)?|closest|matches|getAttribute|removeAttribute|hasAttribute|addEventListener|removeEventListener|fetch|getItem|setItem|removeItem|parse|RegExp|createElement|define|inject|includes|startsWith|endsWith|split|indexOf|lastIndexOf|replace|replaceAll|match|test|toLocaleString|toLocaleDateString|toLocaleTimeString|NumberFormat|DateTimeFormat|setProperty|getPropertyValue|toggle|contains|postMessage|require|Symbol|InjectionToken|HttpParams|log|warn|debug|info|trace|groupCollapsed|group|assert|localeCompare|padStart|padEnd|toFixed|t)$/;
const PROPIEDADES_DEL_DECORADOR = ['selector', 'templateUrl', 'styleUrl', 'styleUrls', 'styles', 'encapsulation', 'changeDetection'];

/**
 * Los textos humanos de un `.ts`: literales de cadena (y la plantilla en línea), sin contar los
 * técnicos. `t(…)` es una llamada «técnica» para este detector: su clave y su respaldo NO cuentan.
 *
 * @param {any} ts el módulo `typescript`.
 * @param {string} ruta
 * @param {string} src
 */
export function analizarCodigo(ts, ruta, src) {
  const sf = ts.createSourceFile(ruta, src, ts.ScriptTarget.Latest, true);
  const out = [];
  const nombreLlamada = (call) => {
    const e = call.expression;
    if (ts.isIdentifier(e)) return e.text;
    if (ts.isPropertyAccessExpression(e)) return e.name.text;
    return '';
  };
  const linea = (n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const K = ts.SyntaxKind;
  const comparaciones = new Set([K.EqualsEqualsEqualsToken, K.ExclamationEqualsEqualsToken, K.EqualsEqualsToken, K.ExclamationEqualsToken, K.InKeyword]);
  const ver = (n) => {
    if (ts.isPropertyAssignment(n) && n.name.getText().replace(/['"]/g, '') === 'template'
      && (ts.isNoSubstitutionTemplateLiteral(n.initializer) || ts.isStringLiteral(n.initializer))) {
      for (const h of analizarPlantilla(n.initializer.text, linea(n.initializer))) out.push({ ...h, tipo: `plantilla-en-linea:${h.tipo}` });
      return;
    }
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isTypeNode(n) && !ts.isExpressionWithTypeArguments(n)) return;
    if (ts.isPropertyAssignment(n) && PROPIEDADES_DEL_DECORADOR.includes(n.name.getText().replace(/['"]/g, ''))) return;
    if (ts.isCaseClause(n)) {
      ts.forEachChild(n, (c) => { if (c !== n.expression) ver(c); });
      return;
    }
    if (ts.isBinaryExpression(n) && comparaciones.has(n.operatorToken.kind)) return;
    if (ts.isElementAccessExpression(n)) {
      ver(n.expression);
      return;
    }
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const nom = ts.isCallExpression(n) ? nombreLlamada(n) : n.expression.getText();
      if (ts.isNewExpression(n) && /Error|CustomEvent|RegExp|URL|InjectionToken|HttpParams|Intl\./.test(nom)) return;
      if (ts.isCallExpression(n) && LLAMADAS_TECNICAS.test(nom)) return;
      if (ts.isCallExpression(n) && nom === 'setAttribute') {
        const [a, b] = n.arguments;
        if (a && ts.isStringLiteral(a) && ATTR_VISIBLES.has(a.text) && b) ver(b);
        return;
      }
    }
    if (ts.isThrowStatement(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (ts.isPropertyAssignment(n.parent) && n.parent.name === n) return;
      if (esHumano(n.text)) out.push({ tipo: 'codigo', texto: n.text, linea: linea(n) });
      return;
    }
    if (ts.isTemplateExpression(n)) {
      const partes = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' ¤ ');
      if (esHumano(partes.replace(/¤/g, ' '))) out.push({ tipo: 'codigo-plantilla', texto: partes, linea: linea(n) });
      for (const s of n.templateSpans) ver(s.expression);
      return;
    }
    ts.forEachChild(n, ver);
  };
  ver(sf);
  return out;
}

/** Specs, la vista previa de desarrollo y el arranque: no son interfaz. */
export function esFicheroDeInterfaz(ruta) {
  const nombre = ruta.split(/[\\/]/).pop() ?? '';
  if (/\.spec\.ts$|\.stories\.ts$|\.d\.ts$/.test(nombre)) return false;
  if (/[\\/]src[\\/]index\.html$/.test(ruta) || nombre === 'main.ts') return false;
  // Datos de ejemplo: un texto ahí es contenido de demo, no cromo de interfaz (informe 16).
  if (/-api\.client\.ts$|mock|demo|fixture|seed|fake|\.data\.ts$|-data\.ts$|sample/i.test(nombre)) return false;
  return /\.(ts|html)$/.test(nombre);
}

/**
 * Los textos a mano de un elemento.
 *
 * @param {any} ts
 * @param {{ ruta: string, fuente: string }[]} fuentes
 */
export function literalesDelElemento(ts, fuentes) {
  return fuentes
    .filter(({ ruta }) => esFicheroDeInterfaz(ruta))
    .flatMap(({ ruta, fuente }) => {
      const limpia = fuente.replace(/\r/g, '');
      const hallados = ruta.endsWith('.html') ? analizarPlantilla(limpia) : analizarCodigo(ts, ruta, limpia);
      return hallados.map((h) => ({ ...h, ruta }));
    });
}

/**
 * La cifra de cada elemento contra la línea base, en los dos sentidos.
 *
 * @param {Record<string, number>} actual TODOS los elementos recorridos, con su cifra (0 incluido).
 * @param {Record<string, number>} base la línea base: sólo los que tienen deuda.
 * @returns {{ subieron: string[], bajaron: string[], fantasmas: string[] }}
 *   `subieron`: un texto nuevo a mano (rojo); `bajaron`: deuda pagada sin reescribir la línea base
 *   (rojo: se podría volver a contraer en silencio); `fantasmas`: la línea base nombra un elemento
 *   que ya no existe (una excepción que sobra deja de leerse).
 */
export function cruzarConLaLineaBase(actual, base) {
  const subieron = [];
  const bajaron = [];
  for (const [elemento, n] of Object.entries(actual)) {
    const antes = base[elemento] ?? 0;
    if (n > antes) subieron.push(`${elemento}: ${antes} → ${n}`);
    else if (n < antes) bajaron.push(`${elemento}: ${antes} → ${n}`);
  }
  const fantasmas = Object.keys(base).filter((e) => !(e in actual));
  return { subieron, bajaron, fantasmas };
}

/** La línea base que corresponde a `actual`: los elementos con deuda, ordenados. */
export function lineaBaseDe(actual) {
  return Object.fromEntries(
    Object.entries(actual)
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
