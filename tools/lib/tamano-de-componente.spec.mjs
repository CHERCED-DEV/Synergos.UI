import { describe, expect, it } from 'vitest';

import {
  LIMITES,
  componentesDeLaApp,
  cruzarConElPiso,
  excedidos,
  lineasDeCodigo,
  lineasDePlantilla,
  pisoDe,
} from './tamano-de-componente.mjs';

describe('lineasDeCodigo', () => {
  it('no cuenta líneas en blanco ni comentarios: documentar no hace grande a un componente', () => {
    const fuente = ['/**', ' * El porqué.', ' */', 'export class A {', '', '  // una nota', '  x = 1; // y otra', '}'].join('\n');
    expect(lineasDeCodigo(fuente)).toBe(3);
  });
});

describe('lineasDePlantilla', () => {
  it('no cuenta líneas en blanco ni comentarios HTML', () => {
    expect(lineasDePlantilla('<!-- cabecera\n  de dos líneas -->\n<div>\n\n  {{ a }}\n</div>\n')).toBe(3);
  });
});

describe('componentesDeLaApp', () => {
  const fuentes = [
    { ruta: 'app/src/vista/vista.ts', fuente: "@Component({ selector: 'x', templateUrl: './vista.html' })\nexport class V {}\n" },
    { ruta: 'app/src/vista/vista.html', fuente: '<p>uno</p>\n<p>dos</p>\n' },
    { ruta: 'app/src/vista/vista.spec.ts', fuente: '@Component({ template: `<p></p>` }) class Doble {}' },
    { ruta: 'app/src/en-linea.ts', fuente: "@Component({ selector: 'y', template: `\n<p>a</p>\n<p>b</p>\n<p>c</p>\n` })\nexport class L {}\n" },
    { ruta: 'app/src/servicio.ts', fuente: '@Injectable()\nexport class S {}\n' },
  ];

  it('mide cada componente con su plantilla, por templateUrl o en línea; los specs y los servicios no son componentes', () => {
    expect(componentesDeLaApp(fuentes)).toEqual([
      { ruta: 'app/src/vista/vista.ts', ts: 2, plantilla: 2 },
      { ruta: 'app/src/en-linea.ts', ts: 6, plantilla: 3 },
    ]);
  });

  it('una plantilla en una carpeta hermana se resuelve con `..`', () => {
    const [c] = componentesDeLaApp([
      { ruta: 'app/src/a/a.ts', fuente: "@Component({ templateUrl: '../b/b.html' }) export class A {}" },
      { ruta: 'app/src/b/b.html', fuente: '<i></i>\n' },
    ]);
    expect(c.plantilla).toBe(1);
  });
});

describe('excedidos', () => {
  it('dice cuál se pasa y de qué', () => {
    const [e] = excedidos([
      { ruta: 'a.ts', ts: LIMITES.ts + 1, plantilla: 10 },
      { ruta: 'b.ts', ts: 10, plantilla: LIMITES.plantilla },
    ]);
    expect(e.ruta).toBe('a.ts');
    expect(e.motivo).toBe(`${LIMITES.ts + 1} líneas de TS (≤ ${LIMITES.ts})`);
  });
});

describe('cruzarConElPiso', () => {
  const regla = { obligatorias: ['storefront'], piso: { academy: 2 } };

  it('la obligatoria no tiene ninguno; las demás, no más que su piso', () => {
    expect(cruzarConElPiso({ storefront: 0, academy: 2 }, regla)).toEqual({ errores: [], bajaron: [] });
    expect(cruzarConElPiso({ storefront: 1, academy: 3 }, regla).errores).toHaveLength(2);
  });

  it('el piso sólo baja: bajar se avisa para reescribirlo, y pisoDe nunca lo sube', () => {
    expect(cruzarConElPiso({ storefront: 0, academy: 1 }, regla).bajaron).toEqual(['academy: 2 → 1']);
    expect(pisoDe({ storefront: 0, academy: 5 }, regla)).toEqual({ academy: 2 });
  });
});
