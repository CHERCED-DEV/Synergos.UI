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
 * Valores de muestra por input, para que el elemento no salga en blanco.
 *
 * **Son de MUESTRA y la página lo dice.** No se leen de ningún sitio ni
 * pretenden ser datos: existen para que haya algo que mirar. La regla 14 del
 * `CLAUDE.md` —no fabricar lo que vale por ser cierto— habla de lo que se le
 * enseña a un usuario como verdad; acá lo que se enseña es el elemento, y el
 * dato es andamiaje declarado.
 */
export function valorDeMuestra(input) {
  if (input.default !== undefined && input.default !== '') return String(input.default);

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
 * del contenido, y cada elemento la tiene distinta— y los que no llevan tipo
 * simple. Quien quiera probar un `config` lo edita en la página.
 */
export function atributosDeMuestra(inputs = []) {
  return inputs
    .filter((i) => TIPOS_ATRIBUIBLES.has(i.type))
    .map((i) => ({ nombre: i.name, valor: valorDeMuestra(i) }));
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
 */
export function paginaDelBanco({ elemento, tag, framework, importMap, inputs = [] }) {
  const atributos = atributosDeMuestra(inputs);
  const attrHtml = atributos.map((a) => `${escapar(a.nombre)}="${escapar(a.valor)}"`).join(' ');

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
