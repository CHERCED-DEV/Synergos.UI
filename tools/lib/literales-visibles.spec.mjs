import { describe, expect, it } from 'vitest';
import ts from 'typescript';

import {
  analizarCodigo,
  analizarPlantilla,
  cruzarConLaLineaBase,
  esFicheroDeInterfaz,
  esHumano,
  lineaBaseDe,
  literalesDelElemento,
} from './literales-visibles.mjs';

/**
 * El detector de `gate:literales` (ADR 0136 §4 del CMS, piloto CMS#186): qué cuenta como texto de
 * interfaz escrito a mano, qué no, y el cruce con la línea base en los dos sentidos.
 */
describe('esHumano', () => {
  it('reconoce texto de interfaz', () => {
    for (const s of ['Sin resultados', 'Abrir app', 'Cerrar', 'Next', 'Buscar…']) expect(esHumano(s), s).toBe(true);
  });

  it('no confunde claves, clases, rutas ni CSS con texto', () => {
    for (const s of ['Slider.Next', 'syn-carousel__control', '/tienda', 'es-CO', 'camelCase', 'var(--syn-x)', '12px']) {
      expect(esHumano(s), s).toBe(false);
    }
  });
});

describe('analizarPlantilla', () => {
  it('cuenta nodos de texto, atributos visibles y literales en bindings', () => {
    const hallados = analizarPlantilla(
      '<label for="x">Industria</label>\n<ul aria-label="Capacidades"></ul>\n<syn-badge [ariaLabel]="\'Estado: \' + s" />',
    );
    expect(hallados.map((h) => h.texto)).toEqual(['Industria', 'Capacidades', 'Estado: ']);
  });

  it('no cuenta interpolaciones de señales ni atributos técnicos', () => {
    expect(analizarPlantilla('<p class="a b-c" role="status">{{ emptyLabel() }}</p>')).toEqual([]);
  });
});

describe('analizarCodigo', () => {
  it('cuenta los literales de texto de un componente', () => {
    const hallados = analizarCodigo(ts, 'x.ts', "const a = 'Abrir app';\nconst b = `${n} de ${m} aplicaciones`;");
    expect(hallados.map((h) => h.tipo)).toEqual(['codigo', 'codigo-plantilla']);
  });

  it('NO cuenta la clave ni el respaldo de t(): es la salida de la deuda, no la deuda', () => {
    expect(analizarCodigo(ts, 'x.ts', "const a = t('AppLauncher.Open', 'Abrir app');")).toEqual([]);
  });

  it('no cuenta selectores, comparaciones ni metadatos del decorador', () => {
    const src = "@Component({ selector: 'sg-x', templateUrl: './x.html' })\nclass X { f() { return s === 'Algo raro'; } }";
    expect(analizarCodigo(ts, 'x.ts', src)).toEqual([]);
  });
});

describe('esFicheroDeInterfaz', () => {
  it('deja fuera specs, la vista previa, el arranque y los datos de demo', () => {
    expect(esFicheroDeInterfaz('apps/x/src/x/x.ts')).toBe(true);
    expect(esFicheroDeInterfaz('apps/x/src/x/x.html')).toBe(true);
    expect(esFicheroDeInterfaz('apps/x/src/x/x.spec.ts')).toBe(false);
    expect(esFicheroDeInterfaz('apps/x/src/index.html')).toBe(false);
    expect(esFicheroDeInterfaz('apps/x/src/main.ts')).toBe(false);
    expect(esFicheroDeInterfaz('apps/x/src/x/eventos-api.client.ts')).toBe(false);
  });
});

describe('literalesDelElemento', () => {
  it('suma plantilla y código de las fuentes de interfaz del elemento', () => {
    const fuentes = [
      { ruta: 'apps/x/src/x/x.html', fuente: '<p>Sin dato</p>' },
      { ruta: 'apps/x/src/x/x.ts', fuente: "const a = 'Abrir app';" },
      { ruta: 'apps/x/src/x/x.spec.ts', fuente: "const a = 'No cuenta';" },
    ];
    expect(literalesDelElemento(ts, fuentes).map((h) => h.texto)).toEqual(['Sin dato', 'Abrir app']);
  });
});

describe('cruzarConLaLineaBase — los dos sentidos', () => {
  it('igual a la línea base: nada', () => {
    expect(cruzarConLaLineaBase({ a: 3, b: 0 }, { a: 3 })).toEqual({ subieron: [], bajaron: [], fantasmas: [] });
  });

  it('un texto nuevo a mano sube la cifra → rojo', () => {
    expect(cruzarConLaLineaBase({ a: 4, b: 1 }, { a: 3 }).subieron).toEqual(['a: 3 → 4', 'b: 0 → 1']);
  });

  it('deuda pagada sin reescribir la línea base → rojo: se podría volver a contraer', () => {
    expect(cruzarConLaLineaBase({ a: 1 }, { a: 3 }).bajaron).toEqual(['a: 3 → 1']);
  });

  it('una entrada de un elemento que ya no existe → rojo', () => {
    expect(cruzarConLaLineaBase({ a: 3 }, { a: 3, borrado: 2 }).fantasmas).toEqual(['borrado']);
  });

  it('la línea base guarda sólo la deuda, ordenada', () => {
    expect(lineaBaseDe({ b: 2, a: 1, c: 0 })).toEqual({ a: 1, b: 2 });
  });
});
