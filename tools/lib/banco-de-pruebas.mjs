/**
 * tools/lib/banco-de-pruebas.mjs
 *
 * La página que MONTA un elemento de verdad en el navegador (#49).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACÍA FALTA. Medido recorriendo el camino de quien entra hoy:
 * instalar ≈2 min, build completo 34 s, un elemento 9 s… y **ver algo en el
 * navegador: no había camino**. `dev:cdn` sirve los bundles perfectamente
 * —`/synergos/badge/angular/latest/main.js` contesta 200— pero `GET /` devuelve
 * el catálogo, que son tarjetas informativas con **cero**
 * `<script type="module">`: no carga ni un bundle. O sea que se podía compilar,
 * publicar y servir un elemento sin tener nunca la posibilidad de verlo.
 *
 * LO QUE ESTA PÁGINA ES, Y LO QUE NO ES. Es el banco del desarrollador: monta UN
 * elemento con valores de muestra para poder mirarlo y recargar al compilar. NO
 * es una vista previa de cómo se verá en el producto — eso lo decide el CMS, con
 * su tema, su contenido y su composición. Se dice en la propia página, porque un
 * banco que se confunde con la realidad es peor que no tenerlo: alguien aprueba
 * un diseño contra un fondo que no existe.
 *
 * VIVE FUERA DE `/synergos/` a propósito. Ese prefijo imita el layout que
 * publica `publish.mjs` y el gate `dev-cdn-routes` existe para que no se
 * desvíe; meter acá una ruta que el CDN no tiene sería ensuciar justo el
 * contrato que ese gate protege. El banco es de desarrollo y se le nota en la
 * URL.
 *
 * EL IMPORT MAP HAY QUE RESOLVERLO, Y ESO NO ERA OBVIO. Escribí este fichero
 * diciendo que se copiaba «tal cual, sin reescribir nada», porque miré el mapa
 * de `public/` —el PUBLICADO, donde las URLs ya son
 * `/synergos/runtime/angular/21.1.6/ng-core.js`—. El servidor de desarrollo no
 * lee ése: lee el de `dist/`, que es la SALIDA DEL BUILD y todavía lleva el
 * marcador `__BASE_URL__` que `publish-runtime.mjs` sustituye al publicar.
 *
 * Copiarlo tal cual daba un import map con `__BASE_URL__/runtime/…` en las
 * dieciséis entradas, y eso **no da error**: un import map con URLs que no
 * resuelven no falla, simplemente el módulo no encuentra su dependencia y el
 * custom element **no se registra**, con la página en 200 y nada en pantalla.
 * Es el defecto #126 del CMS otra vez, esta vez en el banco que existe para
 * cazarlo. Lo destapó pedir las URLs del mapa, no leerlo.
 *
 * Se sustituye por `/synergos`, que es donde este servidor sirve el runtime.
 */

/** La raíz bajo la que el servidor de desarrollo sirve el CDN. */
const BASE_DEV = '/synergos';

/**
 * Cambia el marcador que deja el build por la base que sirve este servidor.
 *
 * Devuelve `null` si el mapa no tiene forma de mapa — mejor no emitir ninguno y
 * decirlo en la página que emitir uno roto, porque el roto no falla: deja el
 * elemento sin hidratar en silencio.
 */
export function resolverImportMap(mapa, base = BASE_DEV) {
  if (!mapa || typeof mapa !== 'object' || typeof mapa.imports !== 'object' || !mapa.imports) {
    return null;
  }

  const imports = {};
  for (const [specifier, url] of Object.entries(mapa.imports)) {
    if (typeof url !== 'string') continue;
    imports[specifier] = url.replaceAll('__BASE_URL__', base);
  }

  // Si algo quedó sin resolver, no se sirve a medias: media hidratación es peor
  // que ninguna, porque parece que el elemento está roto y no el mapa.
  //
  // Y la guarda va sobre CUALQUIER marcador con forma de plantilla, no sólo
  // sobre `__BASE_URL__`: el día que el build introduzca otro, mirar sólo el
  // que hoy conozco dejaría pasar exactamente el mismo defecto con otro nombre
  // — que es lo que acaba de pasarme escribiendo esto.
  if (Object.values(imports).some((u) => /__[A-Z][A-Z0-9_]*__/.test(u))) return null;

  return Object.keys(imports).length > 0 ? { imports } : null;
}

/** Los inputs que se pueden poner como atributo: los de tipo simple. */
const TIPOS_ATRIBUIBLES = new Set(['string', 'number', 'boolean']);

/**
 * Las entradas de CABLEADO: su valor es una REFERENCIA —una URL base, un
 * identificador, un código, una clave o uno de un vocabulario cerrado—, no un
 * texto que se pinta. El banco NO las inventa (#88): sin atributo, el elemento usa
 * su propio valor por defecto, que acepta por construcción.
 *
 * Medido en el banco con academy: le ponía `scope="muestra: scope"`, que es el
 * primer segmento de sus rutas por hash (`#/<scope>/curso/<id>`). El navegador
 * devuelve ese hash CODIFICADO (`#/muestra:%20scope/…`) y el router compara contra
 * el texto crudo, así que academy dejaba de reconocer sus propias rutas: recargar,
 * volver atrás o entrar por enlace no abría el curso. Y `apiBase="muestra:
 * apiBase"` no llegaba ni a aplicarse (ver `atributoDeInput` abajo); aplicado, no
 * es una URL y `fetch` lo rechaza.
 *
 * Desde UI#91 las ocho verticales leen sus rutas con `segmentosDeRuta` y ese hash ya
 * no las rompe. `scope` sigue sin muestra porque es una REFERENCIA —el siteRoot—, no
 * un texto que se pinte.
 *
 * Es un censo por NOMBRE porque el vocabulario es el mismo en todas las verticales
 * (`apiBase` en diez, `scope` en ocho, `currency` en nueve). Cada entrada dice por
 * qué no se inventa; el spec exige que cada una exista en `element-inputs.json` y
 * que toda entrada de texto de una vertical esté clasificada aquí o en
 * `TEXTO_DE_LAS_VERTICALES` — una entrada nueva obliga a decidir.
 */
export const ENTRADAS_DE_CABLEADO = {
  apiBase:
    'la base del borde. Sin atributo, el elemento usa la suya, RELATIVA a la página —o sea al propio banco—: pide ahí, recibe 404 y degrada con su cartel',
  scope:
    'el siteRoot, primer segmento de las rutas por hash. Hasta UI#91 uno con espacios rompía los routers de las ocho verticales; hoy no, pero inventarlo pone un siteRoot que no existe en cada enlace que el banco enseña',
  currency: 'un código ISO 4217 que va a Intl.NumberFormat',
  role: 'el vocabulario cerrado de roles de cada vertical (alumno/instructor, paciente/médico, ciudadano/funcionario…)',
  view: 'el nombre de la vista inicial de blogs, de un vocabulario cerrado',
  sessionKey: 'la clave con la que el asistente guarda su progreso',
  clinic: 'el identificador de la clínica',
  agency: 'el identificador de la entidad',
  traveler: 'el identificador del viajero',
  eventId: 'el identificador del evento que se abre al cargar',
  operation: 'venta o arriendo, de un vocabulario cerrado',
  layout: 'la variante de presentación, de un vocabulario cerrado',
  // No es de una vertical, y se midió igual: media-explorer filtraba por la categoría
  // «muestra: defaultCategory», que ningún item tiene, y se quedaba sin un solo video.
  defaultCategory: 'una de las categorías del propio contenido: una inventada filtra todo y deja la lista vacía',

  // ── Los vocabularios cerrados de las piezas que NO son verticales (UI#91) ──────────
  // Medido sobre element-inputs.json: 25 entradas de 12 nombres seguían recibiendo
  // «muestra: X» —`position` en fab, scroll-top y toast-center; `placement` en popover y
  // rich-tooltip; `orientation`, `shape`, `style`, `variantKey`…—. Un valor fuera del
  // vocabulario no es una muestra: el elemento lo descarta y cae a su valor por defecto, o lo
  // pega en una clase que no existe. `theme`, `variant`, `tone`, `alignment`… hoy declaran su
  // valor por defecto y ése va; están en el censo para que una entrada nueva sin él tampoco
  // reciba un texto inventado.
  theme: 'el tema de la pieza, de un vocabulario cerrado (light, dark…); el de verdad lo pone el siteRoot',
  variant: 'la variante de presentación, de un vocabulario cerrado de cada pieza',
  variantKey: 'la variante de presentación con el nombre del CMS, del mismo vocabulario cerrado',
  tone: 'el tono semántico, de un vocabulario cerrado (neutral, success, warning, danger, info)',
  size: 'la escala de la pieza (sm, md, lg…) o su medida en píxeles: un texto no es ninguna de las dos',
  alignment: 'la alineación, de un vocabulario cerrado (left, center, right…)',
  orientation: 'horizontal o vertical',
  position: 'la esquina o el borde donde se fija la pieza, de un vocabulario cerrado',
  placement: 'el lado donde se abre la capa (top, bottom, left, right…)',
  shape: 'la forma, de un vocabulario cerrado (circle, square, text…)',
  style: 'el estilo de la pieza, de un vocabulario cerrado de cada una',
  density: 'la densidad del dibujo, de un vocabulario cerrado',
  direction: 'la dirección del grupo, fila o columna',
  headingLevel: 'el nivel del encabezado, de h1 a h6',
  badgeType: 'el tipo de la insignia (info, warning, success)',
  type: 'el tipo del aviso (info, success, warning, error)',
  status: 'el estado de presencia (online, offline, busy, away)',
  trend: 'la dirección de la tendencia (up, down, neutral)',
  color: 'un color CSS: un texto inventado es un valor inválido que el navegador descarta',
};

/**
 * Las entradas de texto de las verticales que el banco SÍ rellena: se pintan tal
 * cual, así que cualquier texto es un valor que el elemento acepta.
 */
export const TEXTO_DE_LAS_VERTICALES = ['destinationLabel', 'sellerName', 'heading'];

/**
 * Valores de muestra por input, para que el elemento no salga en blanco — o
 * `null` cuando el banco no tiene un valor que el elemento acepte.
 *
 * **Son de MUESTRA y la página lo dice.** No se leen de ningún sitio ni
 * pretenden ser datos: existen para que haya algo que mirar. La regla 14 del
 * `CLAUDE.md` —no fabricar lo que vale por ser cierto— habla de lo que se le
 * enseña a un usuario como verdad; acá lo que se enseña es el elemento, y el
 * dato es andamiaje declarado. Pero un andamiaje que el elemento RECHAZA no deja
 * mirarlo: por eso el cableado sin valor por defecto no se inventa.
 */
export function valorDeMuestra(input) {
  if (input.default !== undefined && input.default !== '') return String(input.default);
  if (Object.hasOwn(ENTRADAS_DE_CABLEADO, input.name)) return null;

  switch (input.type) {
    case 'number':  return '1';
    case 'boolean': return 'true';
    default:        return `muestra: ${input.name}`;
  }
}

/**
 * Los atributos con los que se monta el elemento.
 *
 * Se dejan fuera los `json` —un `config` de muestra sería inventarse la forma
 * del contenido, y cada elemento la tiene distinta—, los que no llevan tipo
 * simple y el cableado sin valor por defecto. Quien quiera probar un `config` lo
 * edita en la página.
 *
 * **El nombre del ATRIBUTO no es el del input, y lo decide la plataforma** (#88).
 * `@angular/elements` observa `api-base` para el input `apiBase`; el banco escribía
 * `apiBase="…"`, que el HTML guarda como `apibase`, y el elemento no lo leía nunca:
 * medido con el badge, su `ariaLabel` de muestra no llegaba. Preact decía leer «con
 * `getAttribute(nombre)`, que no distingue mayúsculas», y eso sólo valía al conectar:
 * no observaba ningún nombre con mayúscula. Desde UI#91 las dos observan en dash-case.
 * Sin default: una plataforma que no declara su convención no tiene banco.
 *
 * @param {Array} inputs
 * @param {{ atributoDeInput: (nombre: string) => string }} plataforma
 */
export function atributosDeMuestra(inputs = [], { atributoDeInput } = {}) {
  if (typeof atributoDeInput !== 'function') {
    throw new Error(
      'atributosDeMuestra sin `atributoDeInput`: el nombre del atributo lo decide la plataforma ' +
        '(PLATFORMS[].atributoDeInput en tools/lib/synergos-config.mjs) y no hay uno por defecto.',
    );
  }
  return inputs
    .filter((i) => TIPOS_ATRIBUIBLES.has(i.type))
    .map((i) => ({ input: i.name, nombre: atributoDeInput(i.name), valor: valorDeMuestra(i) }))
    .filter((a) => a.valor !== null);
}

/** Las entradas de cableado que el banco deja sin atributo, para decirlo en la página. */
export function cableadoSinMuestra(inputs = []) {
  return inputs
    .filter((i) => TIPOS_ATRIBUIBLES.has(i.type) && valorDeMuestra(i) === null)
    .map((i) => i.name);
}

const escapar = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * La página del banco.
 *
 * @param {object} o
 * @param {string} o.elemento  nombre de registro (p.ej. `badge`)
 * @param {string} o.tag       el custom element (p.ej. `synergos-badge`)
 * @param {string} o.framework la plataforma que sirve este servidor
 * @param {object|null} o.importMap  `{ imports: {...} }` del runtime, o null si no está compilado
 * @param {Array} o.inputs     descriptores de `element-inputs.json`
 * @param {(nombre: string) => string} o.atributoDeInput  la convención de la plataforma
 */
export function paginaDelBanco({ elemento, tag, framework, importMap, inputs = [], atributoDeInput }) {
  const atributos = atributosDeMuestra(inputs, { atributoDeInput });
  const attrHtml = atributos.map((a) => `${escapar(a.nombre)}="${escapar(a.valor)}"`).join(' ');
  const sinMuestra = cableadoSinMuestra(inputs);

  // Sin runtime no hay import map, y sin import map el módulo del elemento no
  // resuelve sus bare specifiers y NO HIDRATA — con la página en 200 y el hueco
  // en silencio, que es exactamente el defecto #126 del CMS. Se dice en la
  // página en vez de servir algo que parece roto sin explicar por qué.
  const mapa = resolverImportMap(importMap);
  const faltaRuntime = mapa === null;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>banco · ${escapar(tag)}</title>
${faltaRuntime ? '' : `<script type="importmap">${JSON.stringify(mapa)}</script>`}
<style>
  :root { color-scheme: light dark; }
  body { margin:0; font:14px/1.5 system-ui,sans-serif; }
  header { padding:.75rem 1rem; border-bottom:1px solid color-mix(in srgb, currentColor 15%, transparent);
           display:flex; gap:1rem; align-items:baseline; flex-wrap:wrap; }
  header code { font-size:1rem; font-weight:600; }
  header .fw { opacity:.6; }
  .aviso { padding:.6rem 1rem; background:#fff3cd; color:#664d03; border-bottom:1px solid #ffe69c; }
  .escenario { padding:2rem 1rem; }
  .pie { padding:1rem; opacity:.6; border-top:1px solid color-mix(in srgb, currentColor 15%, transparent); }
</style>
</head>
<body>
<header>
  <code>&lt;${escapar(tag)}&gt;</code>
  <span class="fw">${escapar(framework)}</span>
  <span class="fw">${atributos.length} atributo(s) de muestra</span>
</header>

<p class="aviso">
  <strong>Banco de desarrollo.</strong> Los valores son de MUESTRA, no datos, y no
  hay tema del CMS aplicado — así que esto no es una vista previa de cómo se verá
  en el producto: es el elemento, montado, para poder mirarlo mientras se edita.
</p>
${sinMuestra.length > 0 ? `
<p class="aviso">
  <strong>Sin muestra:</strong> ${sinMuestra.map((n) => `<code>${escapar(n)}</code>`).join(', ')}.
  Son cableado —una base, un identificador, un código o un valor de un vocabulario
  cerrado— y un texto inventado ahí el elemento no lo acepta: va sin atributo y usa
  su propio valor por defecto.
</p>` : ''}

${faltaRuntime ? `<p class="aviso">
  <strong>No hay runtime compilado</strong>, así que no hay import map y este
  elemento no va a resolver sus bare specifiers — se quedaría sin hidratar en
  silencio. Corré <code>npm run build:runtime</code> y recargá.
</p>` : ''}

<div class="escenario">
  <${escapar(tag)} ${attrHtml}></${escapar(tag)}>
</div>

<p class="pie">
  bundle: <code>/synergos/${escapar(elemento)}/${escapar(framework)}/latest/main.js</code>
</p>

${faltaRuntime ? '' : `<script type="module" src="/synergos/${escapar(elemento)}/${escapar(framework)}/latest/main.js"></script>`}
<script>
  // Recarga cuando dist/ se mueve, con el mismo latido que ya usa el catalogo.
  let ultimo = null;
  setInterval(async () => {
    try {
      const { ts } = await (await fetch('/synergos/__dev.json', { cache: 'no-store' })).json();
      if (ultimo !== null && ts !== ultimo) location.reload();
      ultimo = ts;
    } catch { /* el servidor se está reiniciando */ }
  }, 1000);
</script>
</body>
</html>`;
}
