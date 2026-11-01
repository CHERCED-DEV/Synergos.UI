/**
 * El tamaño de los componentes de una app (014-despiece-tienda, T012; spec de 014, regla 1): un componente de app se
 * queda en ~300 líneas de TS y ~200 de plantilla, y lo que pase se parte en subcomponentes con un papel claro.
 * Funciones puras: el recorrido del disco lo hace `tools/tamano-de-componente.mjs`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ SE CUENTA, Y POR QUÉ NO LAS LÍNEAS DEL FICHERO.
 *
 * Se cuentan líneas de CÓDIGO: ni las en blanco ni las que sólo son comentario. Este repo escribe el porqué al lado
 * de cada decisión, a propósito, y un límite sobre las líneas del fichero castigaría la documentación —la manera más
 * barata de «bajar» un componente sería borrar sus comentarios—. La plantilla, igual: sin líneas en blanco ni
 * comentarios HTML.
 *
 * Un componente es un `.ts` (no un spec) con `@Component(`. Su plantilla es la de `templateUrl`, resuelta contra su
 * carpeta, o la `template` en línea.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const LIMITES = { ts: 300, plantilla: 200 };

/** Las líneas de código de un TS: sin las en blanco ni las de comentario (`//` y `/* … *\/`). */
export function lineasDeCodigo(fuente) {
  const sinBloques = fuente.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
  return sinBloques.split('\n').filter((l) => {
    const t = l.trim();
    return t !== '' && !t.startsWith('//');
  }).length;
}

/** Las líneas de una plantilla: sin las en blanco ni las de comentario HTML. */
export function lineasDePlantilla(fuente) {
  const sinComentarios = fuente.replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''));
  return sinComentarios.split('\n').filter((l) => l.trim() !== '').length;
}

const directorio = (ruta) => ruta.replace(/[\\/][^\\/]*$/, '');
function resolver(desde, relativa) {
  const partes = directorio(desde).split('/');
  for (const p of relativa.split('/')) {
    if (p === '.' || p === '') continue;
    if (p === '..') partes.pop();
    else partes.push(p);
  }
  return partes.join('/');
}

/**
 * Los componentes de una app con sus cifras.
 *
 * @param {ReadonlyArray<{ruta: string, fuente: string}>} fuentes con rutas `/`
 * @returns {Array<{ruta: string, ts: number, plantilla: number}>}
 */
export function componentesDeLaApp(fuentes) {
  const porRuta = new Map(fuentes.map((f) => [f.ruta, f.fuente]));
  const salida = [];
  for (const { ruta, fuente } of fuentes) {
    if (!ruta.endsWith('.ts') || ruta.endsWith('.spec.ts') || !fuente.includes('@Component(')) continue;
    let plantilla = 0;
    const url = /templateUrl:\s*['"]([^'"]+)['"]/.exec(fuente)?.[1];
    if (url) {
      const html = porRuta.get(resolver(ruta, url));
      plantilla = html === undefined ? 0 : lineasDePlantilla(html);
    } else {
      const enLinea = /template:\s*`([\s\S]*?)`/.exec(fuente)?.[1];
      plantilla = enLinea === undefined ? 0 : lineasDePlantilla(enLinea);
    }
    salida.push({ ruta, ts: lineasDeCodigo(fuente), plantilla });
  }
  return salida;
}

/** Los que se pasan de algún límite, con el porqué. */
export function excedidos(componentes, limites = LIMITES) {
  return componentes
    .filter((c) => c.ts > limites.ts || c.plantilla > limites.plantilla)
    .map((c) => ({
      ...c,
      motivo: [c.ts > limites.ts ? `${c.ts} líneas de TS (≤ ${limites.ts})` : '', c.plantilla > limites.plantilla ? `${c.plantilla} de plantilla (≤ ${limites.plantilla})` : '']
        .filter(Boolean)
        .join(' y '),
    }));
}

/**
 * El cruce con el piso: las obligatorias no tienen ningún componente excedido; las demás, no más de los que tenían.
 *
 * @param {Record<string, number>} actual excedidos por app
 * @param {{obligatorias?: string[], piso?: Record<string, number>}} regla
 */
export function cruzarConElPiso(actual, { obligatorias = [], piso = {} }) {
  const errores = [];
  const bajaron = [];
  for (const app of obligatorias) {
    if (!(app in actual)) errores.push(`la app obligatoria «${app}» no existe`);
    else if (actual[app] > 0) errores.push(`${app}: ${actual[app]} componente(s) excedido(s) y es obligatoria (0)`);
  }
  for (const [app, antes] of Object.entries(piso)) {
    if (!(app in actual)) errores.push(`el piso nombra «${app}», que ya no existe`);
    else if (actual[app] > antes) errores.push(`${app}: ${antes} → ${actual[app]} excedidos`);
    else if (actual[app] < antes) bajaron.push(`${app}: ${antes} → ${actual[app]}`);
  }
  return { errores, bajaron };
}

/** El piso que corresponde a `actual` sin subir ninguno: las apps no obligatorias con su cifra, ordenadas. */
export function pisoDe(actual, { obligatorias = [], piso = {} }) {
  return Object.fromEntries(
    Object.keys(piso)
      .filter((app) => !obligatorias.includes(app) && app in actual)
      .sort((a, b) => a.localeCompare(b))
      .map((app) => [app, Math.min(piso[app], actual[app])]),
  );
}
