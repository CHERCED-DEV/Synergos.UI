import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Facetas multi-valor que viajan de a una (issue #18).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ES UN GATE Y NO UN TEST POR APP.
 *
 * `DiscoveryCriteria.facets` es `Record<string, readonly string[]>` —un array por
 * clave— y `DiscoveryFacet.kind` vale `MultiSelect` cuando el backend no dice otra
 * cosa, así que el shell pinta CASILLAS y la persona puede marcar varias.
 *
 * Cuatro de los seis consumidores se quedaban con el primer valor al armar la
 * petición:
 *
 *   const facetPick = (key) => (active.facets[key] ?? [])[0] ?? '';
 *
 * Marcar dos barrios filtraba por uno. **No fallaba y no avisaba**: la lista
 * salía más corta y parecía que así era el mercado. Es el peor modo de fallo que
 * tiene una búsqueda, porque el resultado equivocado es plausible.
 *
 * Y ningún spec lo veía: los del shell cubren que CAPTURE la multi-selección, los
 * de cada app cubren el render con datos sembrados, y el tramo entre el criteria y
 * la query string no lo cubría nadie. Mutación que lo demuestra: cambiar `[0]` por
 * `[1]` no ponía rojo ningún test.
 *
 * El arreglo no fue mandar varios valores —el backend de hoy no los acepta y
 * fingir que sí sería el mismo silencio con otro disfraz— sino **declarar la
 * verdad**: esas facetas son `SingleSelect`, el shell pinta radios, y lo que se
 * marca es lo que se filtra. El día que el transporte lleve `f.clave=a&f.clave=b`
 * vuelven a MultiSelect y este gate sigue sirviendo igual.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Lo que vigila: que nadie vuelva a indexar `[0]` sobre las facetas del criteria.
 * Si hace falta un solo valor, la faceta se declara `SingleSelect` y se lee con
 * `facetPick`, que sólo es legítimo cuando el descriptor lo dice.
 */

const REPO = path.resolve(import.meta.dirname, '../..');
const NG = path.join(REPO, 'platforms/angular');

/** `facets['x'][0]`, `facets[key] ?? [])[0]`, `.facets[k]?.[0]` — todas las formas. */
const APLANADO = /facets\s*(?:\[[^\]]+\]|\.\w+)\s*(?:\?\.)?\s*\[\s*0\s*\]|\(\s*\w*\.?facets\[[^\]]+\]\s*\?\?\s*\[\]\s*\)\s*\[\s*0\s*\]/;

function sinComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

function ficheros(raiz) {
  const encontrados = [];
  if (!existsSync(raiz)) return encontrados;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (/^(node_modules|dist|\.cdn-out|\.test-out)$/.test(e.name)) continue;
        walk(full);
      } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
        encontrados.push(full);
      }
    }
  };
  walk(raiz);
  return encontrados;
}

/**
 * Quien lee un solo valor de una faceta tiene que haber declarado que esa faceta
 * es de un solo valor. Se comprueba a nivel de app —el descriptor y el lector
 * viven en ficheros distintos, el cliente y el componente— y no línea por línea.
 */
function declaraValorUnico(dirApp) {
  return ficheros(dirApp)
    .map((f) => sinComentarios(readFileSync(f, 'utf8')))
    .some((src) => /'SingleSelect'|"SingleSelect"|kindPorDefecto\s*\(/.test(src));
}

function declaraValorUnicoEnPlantilla(dirApp) {
  const html = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (/^(node_modules|dist)$/.test(e.name)) continue;
        walk(full);
      } else if (e.name.endsWith('.html')) html.push(full);
    }
  };
  walk(dirApp);
  return html.some((f) => /kind:\s*'SingleSelect'/.test(readFileSync(f, 'utf8')));
}

describe('selección de facetas', () => {
  const raizApps = path.join(NG, 'apps/elements/modules');
  const apps = existsSync(raizApps)
    ? readdirSync(raizApps, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(raizApps, e.name))
    : [];

  it('hay apps que inspeccionar', () => {
    expect(apps.length).toBeGreaterThan(5);
  });

  it('quien lee UN valor de una faceta declara esa faceta de valor único', () => {
    const mudos = [];
    for (const app of apps) {
      const aplana = ficheros(app)
        .map((f) => sinComentarios(readFileSync(f, 'utf8')))
        .some((src) => APLANADO.test(src));
      if (!aplana) continue;
      if (declaraValorUnico(app) || declaraValorUnicoEnPlantilla(app)) continue;
      mudos.push(path.basename(app));
    }

    expect(
      mudos,
      `Estas apps se quedan con el primer valor de una faceta y NO declaran esa faceta\n` +
        `como de valor único, así que el shell pinta casillas y la selección se pierde\n` +
        `en silencio — es el defecto #18. Declará \`kind: 'SingleSelect'\` en el\n` +
        `descriptor, o hacé que la selección entera viaje al backend:\n  ` +
        mudos.join(', '),
    ).toEqual([]);
  });
});
