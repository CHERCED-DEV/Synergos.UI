import { describe, it, expect } from 'vitest';
import { revisarRuntime, OK, SIN_RUNTIME, SIN_LATEST } from './cdn-runtime-check.mjs';

/**
 * La comprobación del runtime en el CDN (issue #7).
 *
 * El defecto que estos tests existen para atrapar NO era que la comprobación
 * estuviera mal — calculaba bien. Era que se hacía **antes** de que la
 * respuesta pudiera ser otra:
 *
 *   > `build-cdn.mjs` llamaba a `publish.mjs` —que pregunta— antes de
 *   > `publish-runtime.mjs` —que responde—. Resultado: «Angular runtime NOT
 *   > found» en cada build, siempre falso, y el artefacto publicado correcto.
 *
 * Por eso hay un test de cada estado: el que decía la verdad y nunca se veía,
 * y el que se veía siempre y era mentira. Lo que un test unitario NO puede
 * probar es el orden de los pasos de `build-cdn.mjs`; eso se mutó a mano y
 * quedó anotado en el ticket.
 */

/** Un CDN de mentira: el conjunto de rutas que "existen". */
const cdnCon = (...rutas) => {
  const hay = new Set(rutas);
  return (ruta) => hay.has(ruta);
};

const CDN = '/cdn/synergos';
const BASE = `${CDN}/runtime/angular`;

describe('revisarRuntime', () => {
  it('CDN sin runtime → avisa, y el aviso dice qué correr', () => {
    // Este es el estado que el aviso siempre describía. Con el orden viejo,
    // era el estado real en el instante de preguntar — y dejaba de serlo
    // veinte líneas después.
    const { estado, lineas } = revisarRuntime(CDN, cdnCon());

    expect(estado).toBe(SIN_RUNTIME);
    expect(lineas.join(' ')).toContain('NOT found');
    expect(lineas.join(' ')).toContain('publish-runtime.mjs');
  });

  it('runtime publicado y con latest → callado', () => {
    // El caso que ocurría de verdad en cada build y que el aviso negaba.
    const { estado, lineas } = revisarRuntime(
      CDN,
      cdnCon(BASE, `${BASE}/latest/import-map.json`),
    );

    expect(estado).toBe(OK);
    expect(lineas).toEqual([]);
  });

  it('runtime publicado pero sin el slot latest → avisa distinto', () => {
    // No es lo mismo «no hay runtime» que «hay runtime y el alias móvil no
    // apunta a nada»: lo segundo rompe sólo a quien pida `latest`, que es
    // justo lo que pide el import-map por defecto.
    const { estado, lineas } = revisarRuntime(CDN, cdnCon(BASE, `${BASE}/21.1.6/import-map.json`));

    expect(estado).toBe(SIN_LATEST);
    expect(lineas.join(' ')).toContain('latest');
    expect(lineas.join(' ')).not.toContain('NOT found');
  });

  it('no confunde una versión exacta publicada con el slot latest', () => {
    // El error fácil de escribir: comprobar la carpeta `runtime/angular` y
    // darse por satisfecho. Con eso, un CDN al que le falta `latest/` pasa
    // el gate y los elementos no arrancan.
    const soloVersionada = revisarRuntime(CDN, cdnCon(BASE, `${BASE}/21.1.6/ng-core.js`));
    expect(soloVersionada.estado).not.toBe(OK);
  });
});
