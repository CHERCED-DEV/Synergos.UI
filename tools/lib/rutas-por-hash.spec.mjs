import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { raicesEnDisco } from './frameworks.mjs';

/**
 * Las rutas por hash de las verticales salen de UNA pieza (UI#91, punto 1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El router de cada vertical armaba la base con el `scope` CRUDO (`#/${scope}`) y la
 * comparaba con `location.hash`, que el navegador devuelve codificado. Con un scope
 * con espacio, tilde o `:` la vertical dejaba de reconocer sus rutas — y estaba escrito
 * OCHO veces, una por vertical, así que el arreglo de una no llegaba a las otras siete.
 * Hoy las ocho leen con `segmentosDeRuta` y escriben con `baseDeRuta`
 * (`vitals/core/src/rutas/ruta-por-hash.ts`), y cada spec de vertical lo prueba montada
 * con `scope="Mi sitio: ñ"` (8 de 8 en rojo con el router de antes).
 *
 * Este gate vigila que la novena no vuelva a escribir el router a mano. El sujeto se
 * DERIVA dos veces y las dos tienen que dar lo mismo: las fuentes que escuchan
 * `hashchange` (el disco) y los elementos que declaran `scope` en `element-inputs.json`
 * (el contrato).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const REPO = path.resolve(import.meta.dirname, '../..');

function fuentes(dir, salida = []) {
  if (!existsSync(dir)) return salida;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(node_modules|dist|\.test-out)$/.test(e.name)) fuentes(full, salida);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.spec\./.test(e.name)) salida.push(full);
  }
  return salida;
}

const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const routers = raicesEnDisco(REPO)
  .flatMap((raiz) => fuentes(path.join(raiz, 'apps')))
  .filter((f) => /addEventListener\(\s*['"]hashchange['"]/.test(readFileSync(f, 'utf8')));

/** El elemento de una fuente: la carpeta bajo `modules/`/`primitives/`… que contiene `src/`. */
const elementoDe = (f) => {
  const partes = f.split(path.sep);
  return partes[partes.lastIndexOf('src') - 1];
};

const conScope = Object.entries(
  JSON.parse(readFileSync(path.join(REPO, 'vitals/contracts/src/element-inputs.json'), 'utf8')),
)
  .filter(([, inputs]) => Array.isArray(inputs) && inputs.some((i) => i.name === 'scope'))
  .map(([nombre]) => nombre)
  .sort();

describe('las rutas por hash de las verticales salen de una pieza (UI#91)', () => {
  it('hay routers que mirar — y las dos derivaciones dan las mismas verticales', () => {
    // Medido el 2026-10-01: ocho por los dos caminos.
    expect(routers.length).toBeGreaterThanOrEqual(8);
    expect([...new Set(routers.map(elementoDe))].sort()).toEqual(conScope);
  });

  it('cada router lee con segmentosDeRuta y escribe con baseDeRuta', () => {
    const faltan = routers.filter((f) => {
      const src = sinComentarios(readFileSync(f, 'utf8'));
      return !src.includes('segmentosDeRuta(') || !src.includes('baseDeRuta(');
    });
    expect(faltan.map((f) => path.relative(REPO, f))).toEqual([]);
  });

  it('y ninguno arma la base con el scope crudo ni decodifica por su cuenta', () => {
    // `#/${…}` crudo es el defecto entero; un `decodeURIComponent` al lado de la pieza
    // decodifica DOS veces, y un `%25` legítimo deja de serlo.
    const malos = routers.flatMap((f) => {
      const src = sinComentarios(readFileSync(f, 'utf8'));
      const rel = path.relative(REPO, f);
      return [
        ...(/`#\/\$\{/.test(src) ? [`${rel}: arma \`#/\${…}\` a mano`] : []),
        ...(/decodeURIComponent\(/.test(src) ? [`${rel}: decodifica por su cuenta`] : []),
      ];
    });
    expect(malos).toEqual([]);
  });
});
