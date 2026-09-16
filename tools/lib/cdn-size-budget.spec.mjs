import { describe, it, expect } from 'vitest';
import {
  revisarBundle,
  explicar,
  techoDe,
  importaExterno,
  TECHO_POR_TIER,
  EXCEPCIONES,
  externalsUniversales,
  revisarMigradosAlRuntime,
  MIGRADOS_AL_RUNTIME,
  FACTOR_TRINQUETE,
} from './cdn-size-budget.mjs';

/**
 * El presupuesto de tamaño (issue #8).
 *
 * El caso que estos tests reproducen es real y ya ocurrió: durante la purga de
 * Nx, `storefront` salió en 712 KB contra 287 KB, porque al apuntar el alias a
 * fuentes compiladas se perdió el `sideEffects: false` y con él la poda.
 *
 *   > Se encontró comparando bytes a mano contra un build viejo. Si nadie
 *   > hubiera mirado, se habría publicado un elemento 2,6× más pesado y nada se
 *   > habría puesto rojo.
 *
 * Por eso hay más tests del MENSAJE que del número: un gate que dice «210 KB >
 * 72 KB» consigue que alguien suba el 72. Uno que dice «este bundle ya no
 * importa @angular/core» consigue que alguien mire dónde está el defecto.
 */

/** Un bundle de mentira que importa lo que debe. */
const bundleSano = (extra = '') =>
  `${externalsUniversales('angular').map((e) => `import{x}from"${e}";`).join('')}${extra}`;

describe('techoDe', () => {
  it('un elemento normal hereda el techo de su tier', () => {
    expect(techoDe('badge', 'primitive')).toMatchObject({
      techo: TECHO_POR_TIER.primitive,
      origen: 'tier primitive',
    });
  });

  it('una excepción manda sobre el tier, y trae su razón', () => {
    const v = techoDe('storefront', 'module');
    expect(v.techo).toBe(EXCEPCIONES.storefront.techo);
    expect(v.origen).toBe('excepción');
    expect(v.razon).toBeTruthy();
  });

  it('un tier desconocido NO pasa en silencio', () => {
    // El día que el registry gane un tier, este gate tiene que ser de los que
    // se enteran. Si devolviera Infinity, los elementos nuevos nacerían sin
    // techo y nadie lo notaría — que es exactamente cómo empezó este ticket.
    expect(techoDe('lo-que-sea', 'experience').techo).toBeNull();
  });
});

describe('toda excepción está justificada', () => {
  // El único trámite que impide que la tabla se vuelva una lista de permisos.
  it.each(Object.entries(EXCEPCIONES))('%s', (nombre, { techo, razon }) => {
    expect(techo, `${nombre} sin techo`).toBeGreaterThan(0);
    expect(razon, `${nombre} sin razón escrita`).toBeTruthy();
    expect(razon.length, `${nombre}: la razón tiene que decir algo`).toBeGreaterThan(15);
  });

  it('y ninguna excepción es más laxa que el techo de su tier', () => {
    // Una "excepción" por debajo del techo del tier no excepciona nada: es una
    // línea que alguien dejó y que engaña al que la lee.
    for (const [nombre, { techo }] of Object.entries(EXCEPCIONES)) {
      expect(techo, `${nombre} no necesita ser excepción`).toBeGreaterThan(TECHO_POR_TIER.module);
    }
  });
});

describe('importaExterno', () => {
  it('reconoce la forma que emite esbuild, sin espacio', () => {
    expect(importaExterno('import{createApplication as C}from"@angular/core";', '@angular/core')).toBe(true);
  });

  it('y la relajada, para no depender de cómo minifica la herramienta de hoy', () => {
    expect(importaExterno("import { x } from '@angular/core';", '@angular/core')).toBe(true);
  });

  it('no confunde un paquete con otro que lo contiene como prefijo', () => {
    // `@angular/core` es prefijo de `@angular/core/rxjs-interop`. Un gate que
    // los confunda da por importado algo que no está.
    expect(importaExterno('import{x}from"@angular/core/rxjs-interop";', '@angular/core')).toBe(false);
  });

  it('una mención en un string no es un import', () => {
    expect(importaExterno('const s="@angular/core";', '@angular/core')).toBe(false);
  });
});

describe('revisarBundle', () => {
  it('badge tal como está publicado hoy: pasa', () => {
    // 1845 bytes — el número de la purga, escrito acá para que sobreviva a la
    // sesión de quien lo midió.
    const v = revisarBundle({ framework: 'angular', nombre: 'badge', tier: 'primitive', bytes: 1845, codigo: bundleSano() });
    expect(v.ok).toBe(true);
  });

  it('storefront tal como está publicado hoy: pasa por su excepción', () => {
    const v = revisarBundle({ framework: 'angular',
      nombre: 'storefront',
      tier: 'module',
      bytes: 269_455,
      codigo: bundleSano(),
    });
    expect(v.ok).toBe(true);
    expect(v.origen).toBe('excepción');
  });

  it('storefront como salió durante la purga —712 KB— NO pasa', () => {
    // El defecto real, con su número real.
    const v = revisarBundle({ framework: 'angular',
      nombre: 'storefront',
      tier: 'module',
      bytes: 712_000,
      codigo: bundleSano(),
    });
    expect(v.ok).toBe(false);
    expect(v.veces).toBeGreaterThan(2);
  });

  it('un primitivo que engorda 10× NO pasa — y NO lo caza el techo del tier', () => {
    // ESTE TEST DESCUBRIÓ EL TRINQUETE. `badge` × 10 son 18 450 bytes, y el
    // techo de `primitive` está en 24 KB porque tiene que dejar vivir a
    // `popover` (20 041). El techo por tier lo fija el elemento más GRANDE del
    // tier; para el más pequeño no es un presupuesto, es un permiso.
    const bytes = 1845 * 10;
    expect(bytes).toBeLessThan(TECHO_POR_TIER.primitive); // el techo lo dejaría pasar

    const v = revisarBundle({ framework: 'angular',
      nombre: 'badge',
      tier: 'primitive',
      bytes,
      base: 1845,
      codigo: bundleSano(),
    });
    expect(v.ok).toBe(false);
    expect(v.crecimiento).toBe(10);
  });

  it('un elemento nuevo no tiene trinquete: sólo responde ante el techo', () => {
    // Sin línea base no hay contra qué comparar, y inventar una lo volvería un
    // gate que rechaza elementos por existir.
    const v = revisarBundle({ framework: 'angular',
      nombre: 'recien-nacido',
      tier: 'primitive',
      bytes: 18_000,
      base: null,
      codigo: bundleSano(),
    });
    expect(v.ok).toBe(true);
  });

  it('crecer por debajo del factor es trabajar, no romper', () => {
    // Un gate que salta cada vez que alguien añade una vista se apaga.
    const v = revisarBundle({ framework: 'angular',
      nombre: 'badge',
      tier: 'primitive',
      bytes: Math.round(1845 * 1.8),
      base: 1845,
      codigo: bundleSano(),
    });
    expect(v.ok).toBe(true);
  });

  it('el trinquete no salva a quien se pasa del techo absoluto', () => {
    // Regenerar la línea base no puede ser la forma de bendecir un elemento
    // que rompió el tope de su tier.
    const v = revisarBundle({ framework: 'angular',
      nombre: 'popover',
      tier: 'primitive',
      bytes: 30_000,
      base: 29_000,
      codigo: bundleSano(),
    });
    expect(v.ok).toBe(false);
  });

  it('un external tragado NO pasa AUNQUE quepa bajo el techo', () => {
    // Es el mismo defecto un poco antes, y es cuando sale barato arreglarlo.
    // Un gate que sólo mira bytes lo deja pasar hasta que duele.
    const sinCore = `import{x}from"@angular/elements";import{y}from"@angular/platform-browser";`;
    const v = revisarBundle({ framework: 'angular', nombre: 'badge', tier: 'primitive', bytes: 2000, codigo: sinCore });

    expect(v.ok).toBe(false);
    expect(v.externalsAusentes).toEqual(['@angular/core']);
  });
});

describe('explicar — el mensaje habla de la causa, no de los bytes', () => {
  it('cuando falta un external, lo NOMBRA y dice dónde mirar', () => {
    const v = revisarBundle({
      framework: 'angular',
      nombre: 'hero',
      tier: 'module',
      bytes: 400_000,
      // Sin `@angular/core`, que es el único universal que le queda a Angular
      // desde que #62 mudó los otros dos al runtime compartido.
      codigo: 'import{x}from"@angular/elements";',
    });
    const texto = explicar(v).join('\n');

    expect(texto).toContain('@angular/core');
    expect(texto).toContain('se lo empaquetó');
    expect(texto).toContain('cdn.config.mjs');
  });

  it('los externals universales son POR FRAMEWORK, y sin framework se LANZA', () => {
    // Preact no tiene `@angular/core`, y exigírselo sería rojo por mirar la
    // lista de otra plataforma — la regla 25 dentro de un gate de tamaño.
    expect(externalsUniversales('angular')).toEqual(['@angular/core']);
    expect(externalsUniversales('preact')).toContain('preact/jsx-runtime');
    expect(() => externalsUniversales('svelte')).toThrow(/Declaralos en/);

    // Y omitirlo no puede degradar a «no hay externals ausentes».
    expect(() =>
      revisarBundle({ nombre: 'x', tier: 'primitive', bytes: 10, codigo: '' }),
    ).toThrow(/sin framework/);
  });

  it('lo que se MUDÓ al runtime se sigue vigilando, sobre el fichero que lo tiene', () => {
    // La mitad que evita que quitar `@angular/elements` de los universales
    // debilite el gate en vez de corregirlo (#64).
    const conLosDos =
      'import{a}from"@angular/elements";import{b}from"@angular/platform-browser";';

    expect(revisarMigradosAlRuntime('angular', () => conLosDos)).toEqual([]);

    const sinElements = 'import{b}from"@angular/platform-browser";';
    const errores = revisarMigradosAlRuntime('angular', () => sinElements);
    expect(errores[0]).toContain('sg-core.js');
    expect(errores[0]).toContain('@angular/elements');
    expect(errores[0]).toContain('se lo empaquetó');

    // Un runtime que falta NO se salta: es justo cuando esto importa.
    expect(revisarMigradosAlRuntime('angular', () => null)[0]).toContain('no se encuentra');

    // Y un framework sin migraciones declaradas no inventa errores.
    expect(revisarMigradosAlRuntime('preact', () => null)).toEqual([]);
    expect(Object.keys(MIGRADOS_AL_RUNTIME)).toEqual(['angular']);
  });

  it('cuando los externals están, dice que el diagnóstico NO está cerrado', () => {
    // Importa que el gate no finja saber. Acusa un síntoma y quien lo lee tiene
    // que buscar la causa — decirlo evita que se cierre el ticket subiendo el techo.
    const v = revisarBundle({ framework: 'angular',
      nombre: 'hero',
      tier: 'module',
      bytes: 400_000,
      codigo: bundleSano(),
    });
    const texto = explicar(v).join('\n');

    expect(texto).toContain('no es el caso típico');
    expect(texto).toContain('sideEffects');
  });

  it('un tier sin techo se explica como lo que es: una tabla desactualizada', () => {
    const v = revisarBundle({ framework: 'angular', nombre: 'x', tier: 'experience', bytes: 1, codigo: bundleSano() });
    expect(explicar(v).join('\n')).toContain('TECHO_POR_TIER');
  });

  it('no afirma que "cabe bajo el techo" cuando además se pasó del techo', () => {
    // Lo destapó la mutación de storefront a 712 KB: el mensaje decía a la vez
    // «cabe bajo el techo» y «695 KB > 304 KB». Una mentira en el mensaje de un
    // gate es exactamente cómo empezó el issue #7.
    const v = revisarBundle({ framework: 'angular',
      nombre: 'storefront',
      tier: 'module',
      bytes: 712_000,
      base: 269_455,
      codigo: bundleSano(),
    });
    const texto = explicar(v).join('\n');

    expect(v.bytes).toBeGreaterThan(v.techo);
    expect(texto).not.toContain('Cabe bajo el techo');
    expect(texto).toContain('size:baseline'); // sigue diciendo cómo bendecirlo
  });

  it('cuando el trinquete salta, dice cómo bendecirlo si es legítimo', () => {
    // Sin esta línea el gate es un muro: quien tiene un crecimiento legítimo no
    // sabe qué hacer y termina borrando el gate en vez de regenerar el registro.
    const v = revisarBundle({ framework: 'angular',
      nombre: 'badge',
      tier: 'primitive',
      bytes: 1845 * (FACTOR_TRINQUETE + 1),
      base: 1845,
      codigo: bundleSano(),
    });
    expect(explicar(v).join('\n')).toContain('size:baseline');
  });
});
