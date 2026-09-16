import { describe, it, expect } from 'vitest';
import { revisarRuntime, OK, SIN_RUNTIME, SIN_LATEST } from './cdn-runtime-check.mjs';

/**
 * La comprobación del runtime en el CDN (issues #7 y #61).
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
 *
 * **Y los fixtures cambiaron de forma en #61, que no es una regresión.** Antes
 * bastaba con decir qué RUTAS existen, porque la comprobación preguntaba por
 * una sola: `runtime/angular/latest/…`. Hoy la pregunta es «¿tiene runtime cada
 * framework que publicó ELEMENTOS?», así que un fixture sin elementos no está
 * preguntando nada — y el gate contesta `ok`, que es lo correcto. Es un fixture
 * que expiró con el defecto de al lado: se reescribe con la verdad nueva, no se
 * relaja el test.
 */

/**
 * Un CDN de mentira: el conjunto de rutas que "existen".
 *
 * `listarDirs` se DERIVA de las rutas en vez de declararse aparte — si se
 * declararan por separado, un fixture podría describir un árbol imposible (un
 * bundle dentro de una carpeta que el listado no devuelve) y el test pasaría
 * verde sobre un CDN que no puede existir.
 */
const cdnCon = (...rutas) => {
  const hay = new Set(rutas);
  const existe = (r) => hay.has(r);
  const listarDirs = (dir) => {
    const prefijo = `${dir}/`;
    const hijos = new Set();
    for (const r of hay) {
      if (!r.startsWith(prefijo)) continue;
      const resto = r.slice(prefijo.length);
      if (resto.includes('/')) hijos.add(resto.split('/')[0]);
    }
    return [...hijos];
  };
  return { existe, listarDirs };
};

const CDN = '/cdn/synergos';
const BASE = `${CDN}/runtime/angular`;

/** Un elemento publicado en un framework — lo que hace que la pregunta aplique. */
const bundle = (framework, elemento = 'badge') => `${CDN}/${elemento}/${framework}/latest/main.js`;

/** El runtime de un framework, entero. */
const runtime = (framework) => [
  `${CDN}/runtime/${framework}`,
  `${CDN}/runtime/${framework}/latest/import-map.json`,
];

describe('revisarRuntime', () => {
  it('CDN sin runtime → avisa, y el aviso dice qué correr', () => {
    // Este es el estado que el aviso siempre describía. Con el orden viejo,
    // era el estado real en el instante de preguntar — y dejaba de serlo
    // veinte líneas después.
    const { estado, lineas } = revisarRuntime({ cdnSynergos: CDN, ...cdnCon(bundle('angular')) });

    expect(estado).toBe(SIN_RUNTIME);
    expect(lineas.join(' ')).toContain('NOT found');
    expect(lineas.join(' ')).toContain('publish-runtime.mjs');
  });

  it('runtime publicado y con latest → callado', () => {
    // El caso que ocurría de verdad en cada build y que el aviso negaba.
    const { estado, lineas } = revisarRuntime({
      cdnSynergos: CDN,
      ...cdnCon(bundle('angular'), ...runtime('angular')),
    });

    expect(estado).toBe(OK);
    expect(lineas).toEqual([]);
  });

  it('runtime publicado pero sin el slot latest → avisa distinto', () => {
    // No es lo mismo «no hay runtime» que «hay runtime y el alias móvil no
    // apunta a nada»: lo segundo rompe sólo a quien pida `latest`, que es
    // justo lo que pide el import-map por defecto.
    const { estado, lineas } = revisarRuntime({
      cdnSynergos: CDN,
      ...cdnCon(bundle('angular'), BASE, `${BASE}/21.1.6/import-map.json`),
    });

    expect(estado).toBe(SIN_LATEST);
    expect(lineas.join(' ')).toContain('latest');
    expect(lineas.join(' ')).not.toContain('NOT found');
  });

  it('no confunde una versión exacta publicada con el slot latest', () => {
    // El error fácil de escribir: comprobar la carpeta `runtime/angular` y
    // darse por satisfecho. Con eso, un CDN al que le falta `latest/` pasa
    // el gate y los elementos no arrancan.
    const soloVersionada = revisarRuntime({
      cdnSynergos: CDN,
      ...cdnCon(bundle('angular'), BASE, `${BASE}/21.1.6/ng-core.js`),
    });
    expect(soloVersionada.estado).not.toBe(OK);
  });
});

describe('revisarRuntime — cualquier framework, no sólo angular (#61)', () => {
  it('MUTACIÓN — react publicó elementos y no su runtime: rojo, y lo NOMBRA', () => {
    // El fixture del ticket. Con el gate anterior —`${cdn}/runtime/angular`—
    // esto salía `ok`: el de angular está, así que la pregunta se contestaba
    // sola y los bundles de react se servían para romperse al arrancar.
    const { estado, lineas, frameworks, faltan } = revisarRuntime({
      cdnSynergos: CDN,
      ...cdnCon(bundle('angular'), bundle('react'), ...runtime('angular')),
    });

    expect(frameworks).toEqual(['angular', 'react']);
    expect(estado).toBe(SIN_RUNTIME);
    // Nombrarlo es la mitad del gate: «falta un runtime» sobre un CDN con dos
    // frameworks manda a alguien a mirar el que sí está. Se afirma sobre la
    // LISTA y no sobre el texto — un test que saque la lista de la prosa con un
    // regex acaba afirmando la redacción, y encima se equivoca: el mensaje
    // nombra a angular a propósito, en «con elementos publicados: …».
    expect(faltan).toEqual(['react']);
    expect(lineas[0]).toContain('react');
  });

  it('…y con los dos runtimes, callado', () => {
    const { estado } = revisarRuntime({
      cdnSynergos: CDN,
      ...cdnCon(bundle('angular'), bundle('react'), ...runtime('angular'), ...runtime('react')),
    });
    expect(estado).toBe(OK);
  });

  it('LA ASIMETRÍA — un framework que aún no publicó elementos NO da rojo', () => {
    // La otra mitad, y la que prueba que el gate mide lo PUBLICADO y no lo
    // construible. `platforms/react/` puede existir desde hoy; su primer
    // publish llega otro día, y en el medio este gate tiene que estar callado.
    // Si esto sale rojo, el gate está midiendo la lista equivocada — el error
    // que #44 documentó.
    const { estado, frameworks } = revisarRuntime({
      cdnSynergos: CDN,
      ...cdnCon(bundle('angular'), ...runtime('angular')),
    });

    expect(frameworks).toEqual(['angular']);
    expect(estado).toBe(OK);
  });

  it('un CDN sin un solo elemento no tiene a quién exigirle runtime', () => {
    // No es «ok porque sí»: es que la pregunta no aplica. Contestar
    // SIN_RUNTIME convertiría un árbol vacío en un despliegue roto, y el
    // primer sitio donde se nota es el `publish.mjs` corrido a mano.
    const { estado, frameworks } = revisarRuntime({ cdnSynergos: CDN, ...cdnCon() });
    expect(frameworks).toEqual([]);
    expect(estado).toBe(OK);
  });
});
