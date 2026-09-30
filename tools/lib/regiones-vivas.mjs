/**
 * Gate: ninguna región viva NACE con su mensaje (#82, regla 42 del `CLAUDE.md`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ VIGILA. Un nodo con `aria-live` distinto de `off`, o `role` `status|alert|log`, DENTRO de un
 * bloque condicional o iterado de su propia plantilla —`@if/@else`, `@switch/@case`, `@for/@empty`,
 * `@defer` y sus ramas, `*ngIf/*ngFor`, `ng-template`—. Una región así entra al DOM en el mismo
 * render que su texto, y un lector de pantalla necesita que la región exista ANTES de que el texto
 * cambie: medido con el AST del compilador sobre las 323 plantillas, 119 de 200 nacían mudas.
 *
 * POR QUÉ LA REGLA ES TAN ANCHA. El informe 12 probó una más fina (G1–G4: contenido estático, guarda
 * que nombra lo que muestra, rama dedicada, `@for`) y le salían 5 falsos y se le escapaban 3. Esta
 * marca TODO lo que está en un bloque, y lo que es correcto —una región que nace con su VISTA y
 * después vive, como los totales del carrito— se declara en un CENSO con su razón, que tiene que
 * contestar «por qué esto NO nace con su mensaje». Declarar cuesta una línea; un falso negativo
 * cuesta un lector que calla.
 *
 * LÍNEA BASE Y NO TRINQUETE ABSOLUTO, porque el árbol no lo cumple (regla 39): la deuda es una
 * LISTA —no una cifra: con un número, arreglar una y escribir otra pasa en verde— vigilada en los
 * DOS sentidos. Una marca que no está en la lista ni en el censo rompe; una entrada que ya no se
 * encuentra también, para que el commit que la arregla baje la lista en el mismo diff.
 *
 * LO QUE NO VE (dicho, para que nadie lo dé por cubierto):
 *   - la COMPOSICIÓN: un componente cuya región está fuera de bloques pero que su padre crea dentro
 *     de un `@if` con el mensaje (`confirmation-shell`, `syn-status-banner`, `syn-error-state`);
 *   - las regiones en el `host:` de un componente;
 *   - una región persistente que habla CADA SEGUNDO (el defecto de los relojes): eso lo miden sus
 *     specs, contando anuncios;
 *   - una región bajo `aria-hidden`, y lo que hace de verdad un lector de pantalla.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Funciones puras: el disco, TypeScript y el parser de plantillas los inyecta quien llama
 * (`tools/regiones-vivas.mjs`), para que el spec las vea fallar con fixtures.
 */

/** Los roles de región viva que este gate mira. `timer` y `marquee` callan por definición. */
const ROLES_VIVOS = new Set(['status', 'alert', 'log']);

/** Normaliza espacios: una guarda re-indentada no puede cambiar la clave. */
const plano = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();

// ── 1. Plantillas ────────────────────────────────────────────────────────────

/**
 * Las plantillas de un conjunto de ficheros: cada `.html` entero y cada `template:` literal de un
 * `@Component` en un `.ts`. Una `template:` que NO es un literal (una cadena con `${}`) no se puede
 * parsear sin ejecutar: se devuelve aparte, para que la cobertura la acuse en vez de saltarla.
 *
 * @param {Array<{ruta: string, fuente: string}>} ficheros
 * @param {any} ts el módulo `typescript`
 * @returns {{ plantillas: Array<{ruta: string, origen: 'html'|'inline', texto: string, lineaBase: number}>,
 *             noLiterales: string[] }}
 */
export function extraerPlantillas(ficheros, ts) {
  const plantillas = [];
  const noLiterales = [];
  for (const { ruta, fuente } of ficheros) {
    if (/\.spec\.ts$/.test(ruta)) continue;
    if (ruta.endsWith('.html')) {
      plantillas.push({ ruta, origen: 'html', texto: fuente, lineaBase: 1 });
      continue;
    }
    if (!ruta.endsWith('.ts') || !/@Component\s*\(/.test(fuente)) continue;
    const sf = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true);
    const visitar = (nodo) => {
      if (ts.isDecorator(nodo) && ts.isCallExpression(nodo.expression)) {
        const llamada = nodo.expression;
        if (llamada.expression.getText(sf) === 'Component' && llamada.arguments[0]
          && ts.isObjectLiteralExpression(llamada.arguments[0])) {
          for (const prop of llamada.arguments[0].properties) {
            if (!ts.isPropertyAssignment(prop) || prop.name.getText(sf).replace(/['"]/g, '') !== 'template') continue;
            const valor = prop.initializer;
            if (ts.isNoSubstitutionTemplateLiteral(valor) || ts.isStringLiteral(valor)) {
              const inicio = valor.getStart(sf) + 1;
              plantillas.push({
                ruta,
                origen: 'inline',
                texto: fuente.slice(inicio, valor.getEnd() - 1),
                lineaBase: sf.getLineAndCharacterOfPosition(inicio).line + 1,
              });
            } else {
              noLiterales.push(`${ruta}:${sf.getLineAndCharacterOfPosition(valor.getStart(sf)).line + 1}`);
            }
          }
        }
      }
      ts.forEachChild(nodo, visitar);
    };
    visitar(sf);
  }
  return { plantillas, noLiterales };
}

// ── 2. Regiones ──────────────────────────────────────────────────────────────

/** Los hijos de cualquier nodo del AST de plantillas, sea bloque, rama o elemento. */
function hijosDe(nodo) {
  const hijos = [];
  for (const clave of ['children', 'branches', 'groups', 'cases']) {
    if (Array.isArray(nodo[clave])) hijos.push(...nodo[clave]);
  }
  for (const clave of ['empty', 'placeholder', 'loading', 'error']) {
    if (nodo[clave] && typeof nodo[clave] === 'object') hijos.push(nodo[clave]);
  }
  return hijos;
}

/**
 * Qué bloque abre un nodo, o `null` si no abre ninguno. Por `instanceof` contra las clases que
 * exporta `@angular/compiler`, no por `constructor.name`: el nombre de una clase empaquetada es
 * un detalle del bundle.
 */
function bloqueDe(nodo, ng) {
  if (nodo instanceof ng.TmplAstIfBlockBranch) {
    if (!nodo.expression) return '@else';
    const alias = nodo.expressionAlias ? `; as ${nodo.expressionAlias.name}` : '';
    return `@if(${plano(nodo.expression.source)}${alias})`;
  }
  if (ng.TmplAstSwitchBlockCaseGroup && nodo instanceof ng.TmplAstSwitchBlockCaseGroup) {
    const casos = (nodo.cases ?? []).map((c) => (c.expression ? plano(c.expression.source) : 'default'));
    return `@case(${casos.join('|')})`;
  }
  if (nodo instanceof ng.TmplAstSwitchBlockCase) {
    // Hasta Angular 20 los hijos colgaban del caso; desde el grupo, el caso no tiene hijos.
    if (!Array.isArray(nodo.children) || nodo.children.length === 0) return null;
    return `@case(${nodo.expression ? plano(nodo.expression.source) : 'default'})`;
  }
  if (nodo instanceof ng.TmplAstForLoopBlock) {
    return `@for(${nodo.item?.name ?? ''} of ${plano(nodo.expression?.source)})`;
  }
  if (nodo instanceof ng.TmplAstForLoopBlockEmpty) return '@empty';
  if (nodo instanceof ng.TmplAstDeferredBlock) return '@defer';
  if (nodo instanceof ng.TmplAstDeferredBlockPlaceholder) return '@placeholder';
  if (nodo instanceof ng.TmplAstDeferredBlockLoading) return '@loading';
  if (nodo instanceof ng.TmplAstDeferredBlockError) return '@error';
  if (nodo instanceof ng.TmplAstTemplate) {
    const atributos = (nodo.templateAttrs ?? []).filter((a) => !/^ngFor(TrackBy)$/.test(a.name));
    if (atributos.length === 0) return 'ng-template';
    return atributos
      .map((a) => `*${a.name}(${plano(a.value?.source ?? a.value)})`)
      .join(' ');
  }
  return null;
}

/** `role` y `aria-live` de un elemento, estáticos o atados, como aparecen en la plantilla. */
function marcadores(elemento) {
  const m = {};
  for (const a of elemento.attributes ?? []) {
    if (a.name === 'role' || a.name === 'aria-live') m[a.name] = { valor: plano(a.value), atado: false };
  }
  for (const i of elemento.inputs ?? []) {
    const nombre = i.name === 'ariaLive' ? 'aria-live' : i.name;
    if (nombre === 'role' || nombre === 'aria-live') {
      m[nombre] = { valor: plano(i.value?.source ?? '?'), atado: true };
    }
  }
  return m;
}

/** Los valores que puede tomar un marcador: el literal, o los literales de su expresión. */
function valoresPosibles(marcador) {
  if (!marcador) return [];
  if (!marcador.atado) return [marcador.valor];
  const literales = [...marcador.valor.matchAll(/['"]([\w-]+)['"]/g)].map((x) => x[1]);
  // Una atadura sin literales (`[attr.aria-live]="cortesia"`) no se puede resolver: cuenta como
  // viva. Del lado de este gate, callar sobre una región real es el error caro.
  return literales.length > 0 ? literales : ['?'];
}

function esViva(m) {
  return valoresPosibles(m.role).some((r) => ROLES_VIVOS.has(r))
    || valoresPosibles(m['aria-live']).some((v) => v !== 'off');
}

/**
 * Todas las regiones vivas de un conjunto de plantillas, con su bloque más cercano.
 *
 * @param {Array<{ruta: string, texto: string, lineaBase: number}>} plantillas
 * @param {any} ng el módulo `@angular/compiler` (usa `parseTemplate` y las clases `TmplAst*`)
 * @returns {{ nodos: Array<{ruta: string, linea: number, clave: string, enBloque: boolean, bloque: string}>,
 *             errores: string[] }}
 */
export function regionesVivas(plantillas, ng) {
  const nodos = [];
  const errores = [];
  for (const p of plantillas) {
    const r = ng.parseTemplate(p.texto, p.ruta, { preserveWhitespaces: false });
    if (r.errors?.length) {
      errores.push(`${p.ruta}: ${String(r.errors[0].msg ?? r.errors[0]).slice(0, 120)}`);
      continue;
    }
    const recorrer = (nodo, bloques) => {
      const bloque = bloqueDe(nodo, ng);
      const aca = bloque ? [...bloques, bloque] : bloques;
      const esElemento = nodo instanceof ng.TmplAstElement
        || (ng.TmplAstComponent && nodo instanceof ng.TmplAstComponent);
      if (esElemento) {
        const m = marcadores(nodo);
        if (esViva(m)) {
          const etiqueta = (nodo.name ?? nodo.tagName ?? '?').toLowerCase();
          const rol = m.role ? `role=${m.role.atado ? `[${m.role.valor}]` : m.role.valor}` : '';
          const vivo = m['aria-live'] ? `live=${m['aria-live'].atado ? `[${m['aria-live'].valor}]` : m['aria-live'].valor}` : '';
          const cercano = aca.at(-1) ?? '';
          nodos.push({
            ruta: p.ruta,
            linea: p.lineaBase + nodo.sourceSpan.start.line,
            enBloque: aca.length > 0,
            bloque: cercano,
            clave: `${p.ruta} · ${cercano || '(sin bloque)'} · ${etiqueta}[${[rol, vivo].filter(Boolean).join(' ')}]`,
          });
        }
      }
      for (const h of hijosDe(nodo)) recorrer(h, aca);
    };
    for (const n of r.nodes) recorrer(n, []);
  }
  return { nodos, errores };
}

// ── 3. El cruce ──────────────────────────────────────────────────────────────

/** Cuenta repeticiones: dos regiones iguales en el mismo bloque del mismo fichero son dos. */
function contar(claves) {
  const m = new Map();
  for (const c of claves) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

/** Lo que tiene `a` de más respecto de `b`, contando repeticiones. */
function diferencia(a, b) {
  const salida = [];
  for (const [clave, n] of a) {
    for (let i = (b.get(clave) ?? 0); i < n; i += 1) salida.push(clave);
  }
  return salida.sort((x, y) => x.localeCompare(y));
}

/**
 * Cruza las marcas de HOY contra la deuda y el censo declarados.
 *
 * @param {string[]} marcas claves de los nodos vivos dentro de un bloque
 * @param {{ deuda: string[], censo: Array<{clave: string, razon: string, veces?: number}> }} declarado
 * @returns {{ nuevas: string[], arregladas: string[], censoSobrante: string[], censoSinRazon: string[],
 *             enLasDos: string[], fallos: string[] }}
 */
export function cruzarConLaLineaBase(marcas, { deuda, censo }) {
  const hoy = contar(marcas);
  const censado = new Map();
  for (const e of censo) censado.set(e.clave, (censado.get(e.clave) ?? 0) + (e.veces ?? 1));
  const debida = contar(deuda);

  const declarado = new Map(debida);
  for (const [c, n] of censado) declarado.set(c, (declarado.get(c) ?? 0) + n);

  const nuevas = diferencia(hoy, declarado);
  const sobrantes = diferencia(declarado, hoy);
  const censoSobrante = sobrantes.filter((c) => censado.has(c) && !debida.has(c));
  const arregladas = sobrantes.filter((c) => !censoSobrante.includes(c));
  const censoSinRazon = censo
    .filter((e) => typeof e.razon !== 'string' || e.razon.trim().length < 40)
    .map((e) => e.clave);
  const enLasDos = [...censado.keys()].filter((c) => debida.has(c));

  const fallos = [];
  for (const c of nuevas) {
    fallos.push(`NUEVA región viva dentro de un bloque — nace con su mensaje y el lector calla: ${c}`);
  }
  for (const c of arregladas) {
    fallos.push(`ya no está (¿arreglada?): bajala de la línea base en este mismo commit — ${c}`);
  }
  for (const c of censoSobrante) fallos.push(`el censo declara una que ya no existe: ${c}`);
  for (const c of censoSinRazon) {
    fallos.push(`censo sin razón (≥ 40 caracteres: «por qué esto NO nace con su mensaje»): ${c}`);
  }
  for (const c of enLasDos) fallos.push(`está en la deuda Y en el censo — es una cosa o la otra: ${c}`);
  return { nuevas, arregladas, censoSobrante, censoSinRazon, enLasDos, fallos };
}

// ── 4. La red de seguridad ───────────────────────────────────────────────────

/**
 * Descubrir CERO no es verde. Cuando el recorrido o el parser se rompen, lo que se ve es un gate
 * sin marcas — o sea en verde para siempre. Los pisos están a la mitad de lo que hay hoy (#82:
 * 323 plantillas, 69 inline, ~190 nodos vivos): si un arreglo legítimo los cruza, se bajan con su
 * razón en el mismo commit.
 */
export const PISOS = { plantillas: 160, inline: 30, nodosVivos: 60 };

export function revisarCobertura({ plantillas, inline, nodosVivos, errores, noLiterales }) {
  const fallos = [];
  if (plantillas < PISOS.plantillas) {
    fallos.push(`sólo ${plantillas} plantillas (piso ${PISOS.plantillas}): el recorrido dejó de ver`);
  }
  if (inline < PISOS.inline) {
    fallos.push(`sólo ${inline} plantillas inline (piso ${PISOS.inline}): la extracción de \`template:\` se rompió`);
  }
  if (nodosVivos < PISOS.nodosVivos) {
    fallos.push(`sólo ${nodosVivos} regiones vivas (piso ${PISOS.nodosVivos}): el parser dejó de verlas`);
  }
  for (const e of errores) fallos.push(`plantilla que no se pudo parsear (no se revisó): ${e}`);
  for (const r of noLiterales) fallos.push(`\`template:\` que no es un literal (no se puede revisar): ${r}`);
  return { fallos };
}

// ── 5. El trinquete: sólo el anunciador crea regiones por código ─────────────

/**
 * El único fichero que puede crear una región viva desde código. Fuera de él, una región hecha con
 * `setAttribute('aria-live', …)` es otra región paralela a la del documento — y con ellas, dos
 * mensajes en el mismo instante se pisan. **Trinquete absoluto porque el árbol YA lo cumple.**
 */
export const DUENO_DE_LAS_REGIONES_POR_CODIGO = 'libs/shared/src/services/live-announcer.service.ts';

const POR_CODIGO = [
  /setAttribute\(\s*['"`]aria-live['"`]/,
  /setAttribute\(\s*['"`]role['"`]\s*,\s*['"`](status|alert|log)['"`]/,
  /\.ariaLive\s*=/,
];

/**
 * @param {Array<{ruta: string, fuente: string}>} fuentes `.ts`/`.tsx` sin specs
 * @returns {string[]} `ruta:línea` de cada región creada por código fuera del dueño
 */
export function regionesPorCodigo(fuentes) {
  const salida = [];
  for (const { ruta, fuente } of fuentes) {
    if (/\.spec\.tsx?$/.test(ruta) || ruta.endsWith(DUENO_DE_LAS_REGIONES_POR_CODIGO)) continue;
    fuente.split('\n').forEach((linea, i) => {
      const codigo = linea.replace(/\/\/.*$/, '');
      if (/^\s*\*/.test(codigo)) return;
      if (POR_CODIGO.some((re) => re.test(codigo))) salida.push(`${ruta}:${i + 1}`);
    });
  }
  return salida;
}
