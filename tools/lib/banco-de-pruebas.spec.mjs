import { describe, it, expect } from 'vitest';
import {
  resolverImportMap, atributosDeMuestra, paginaDelBanco, valorDeMuestra, cableadoSinMuestra,
  ENTRADAS_DE_CABLEADO, TEXTO_DE_LAS_VERTICALES,
} from './banco-de-pruebas.mjs';
import { resolverRuta } from './dev-cdn-routes.mjs';
import { PLATFORMS, loadInputs } from './synergos-config.mjs';

/** Una convención de atributos cualquiera, para los tests que no son de convención. */
const tal = { atributoDeInput: (n) => n };

describe('el import map del banco', () => {
  it('sustituye el marcador que deja el BUILD', () => {
    // El fixture lleva `__BASE_URL__` a propósito: es lo que hay en `dist/`, que
    // es de donde lee el servidor de desarrollo. El mapa de `public/` ya viene
    // sustituido por `publish-runtime`, así que un fixture copiado de ahí
    // pasaría en verde con el defecto puesto — que es exactamente cómo escribí
    // este módulo la primera vez.
    const mapa = resolverImportMap({
      imports: { '@angular/core': '__BASE_URL__/runtime/angular/21.1.6/ng-core.js' },
    });
    expect(mapa.imports['@angular/core']).toBe('/synergos/runtime/angular/21.1.6/ng-core.js');
  });

  it('devuelve null si algo quedó sin resolver', () => {
    // Media hidratación es peor que ninguna: parece que el elemento está roto y
    // no el mapa. Un marcador distinto no se adivina — se rechaza el mapa entero.
    expect(resolverImportMap({
      imports: {
        '@angular/core': '__BASE_URL__/a.js',
        rxjs: '__OTRA_COSA__/b.js',
      },
    }, '/synergos')).toBeNull();
  });

  it('devuelve null con un mapa sin forma de mapa', () => {
    expect(resolverImportMap(null)).toBeNull();
    expect(resolverImportMap({})).toBeNull();
    expect(resolverImportMap({ imports: {} })).toBeNull();
  });
});

describe('la página del banco', () => {
  const mapaBueno = { imports: { '@angular/core': '__BASE_URL__/ng-core.js' } };
  const inputs = [
    { name: 'config', type: 'json' },
    { name: 'text', type: 'string', default: '' },
    { name: 'tone', type: 'string', default: 'neutral' },
    { name: 'veces', type: 'number' },
  ];

  it('emite el import map, el módulo y el tag — las tres cosas', () => {
    // Las tres hacen falta y ninguna sola sirve: sin mapa el módulo no resuelve,
    // sin módulo no se registra el custom element, sin tag no hay qué montar.
    const html = paginaDelBanco({
      elemento: 'badge', tag: 'synergos-badge', framework: 'angular',
      importMap: mapaBueno, inputs, ...tal,
    });
    expect(html).toContain('type="importmap"');
    expect(html).toContain('/synergos/badge/angular/latest/main.js');
    expect(html).toContain('<synergos-badge ');
    expect(html).not.toContain('__BASE_URL__');
  });

  it('sin runtime NO emite un mapa roto: lo dice', () => {
    // El modo de fallo que este banco viene a cerrar es el del defecto #126 del
    // CMS: un import map que no resuelve no da error, deja el elemento sin
    // hidratar en silencio. Así que o se emite uno bueno o se explica.
    const html = paginaDelBanco({
      elemento: 'badge', tag: 'synergos-badge', framework: 'angular',
      importMap: null, inputs, ...tal,
    });
    expect(html).not.toContain('type="importmap"');
    expect(html).not.toContain('type="module" src');
    expect(html).toContain('No hay runtime compilado');
  });

  it('el `config` json NO se rellena de muestra', () => {
    // Inventarse un `config` sería inventarse la forma del contenido, que es
    // distinta en cada elemento — y un banco que enseña una forma equivocada es
    // peor que uno vacío.
    expect(atributosDeMuestra(inputs, tal).map((a) => a.nombre)).toEqual(['text', 'tone', 'veces']);
  });

  it('el default gana sobre la muestra cuando lo hay', () => {
    const porNombre = Object.fromEntries(atributosDeMuestra(inputs, tal).map((a) => [a.nombre, a.valor]));
    expect(porNombre.tone).toBe('neutral');      // default declarado
    expect(porNombre.text).toContain('muestra'); // default vacío → muestra
    expect(porNombre.veces).toBe('1');           // sin default, por tipo
  });

  it('dice que es un banco y no una vista previa', () => {
    // Un banco que se confunde con la realidad hace que alguien apruebe un
    // diseño contra un fondo que no existe: acá no hay tema del CMS.
    const html = paginaDelBanco({
      elemento: 'badge', tag: 'synergos-badge', framework: 'angular',
      importMap: mapaBueno, inputs: [], ...tal,
    });
    expect(html).toContain('Banco de desarrollo');
    expect(html).toContain('MUESTRA');
  });
});

describe('la ruta del banco', () => {
  it('vive FUERA de /synergos/, que es el layout que se imita', () => {
    // Meter una ruta de desarrollo dentro de ese prefijo ensuciaría justo el
    // contrato que el gate `dev-cdn-routes` protege.
    expect(resolverRuta('/probar/badge', 'angular')).toEqual({ tipo: 'banco', elemento: 'badge' });
    expect(resolverRuta('/probar', 'angular')).toEqual({ tipo: 'banco', elemento: null });
    expect(resolverRuta('/synergos/registry.json', 'angular').tipo).toBe('registry');
  });

  it('no acepta rutas anidadas', () => {
    // No hay nada que anidar, y aceptarlas invita a colarle un path traversal.
    expect(resolverRuta('/probar/a/b', 'angular')).toEqual({ tipo: 'nada' });
    expect(resolverRuta('/probar/../etc/passwd', 'angular')).toEqual({ tipo: 'nada' });
  });
});

// ── #88: muestras que el elemento ACEPTE ─────────────────────────────────────
// El banco no dejaba recorrer academy: `scope="muestra: scope"` es el primer segmento de sus
// rutas por hash, llegaba codificado (`muestra:%20scope`) y el router dejaba de reconocerlas (cerrado en UI#91). Y
// `apiBase="…"` no llegaba ni a aplicarse: el HTML lo guarda como `apibase` y Angular observa
// `api-base`. Medido con academy y con el badge en el banco (informe 62).

describe('el nombre del atributo lo decide la plataforma', () => {
  const inputsConCamello = [
    { name: 'apiBase', type: 'string' }, // cableado: no sale
    { name: 'headingText', type: 'string', default: '' },
    { name: 'ariaLabel', type: 'string' },
  ];

  it('toda plataforma declara su convención — sin default, sin banco', () => {
    expect(PLATFORMS.length).toBeGreaterThanOrEqual(2);
    for (const p of PLATFORMS) {
      expect(typeof p.atributoDeInput, p.name).toBe('function');
    }
    expect(() => atributosDeMuestra(inputsConCamello)).toThrow(/atributoDeInput/);
    expect(() => paginaDelBanco({ elemento: 'x', tag: 'synergos-x', framework: 'f', importMap: null, inputs: inputsConCamello }))
      .toThrow(/atributoDeInput/);
  });

  it('la página escribe el atributo con la convención, no con el nombre del input', () => {
    const dash = (n) => n.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);
    const html = paginaDelBanco({
      elemento: 'x', tag: 'synergos-x', framework: 'f', importMap: null,
      inputs: inputsConCamello, atributoDeInput: dash,
    });
    expect(html).toContain('heading-text="muestra: headingText"');
    expect(html).toContain('aria-label="muestra: ariaLabel"');
    expect(html).not.toMatch(/\sheadingText=/);
  });

  it('la de cada plataforma convierte un nombre en camello a un nombre de atributo que el HTML no altera', () => {
    // El HTML guarda los nombres de atributo en minúsculas. Una convención que devolviera
    // `apiBase` para una plataforma que observa `api-base` es exactamente el defecto.
    for (const p of PLATFORMS) {
      const nombre = p.atributoDeInput('headingText');
      expect(nombre.toLowerCase(), p.name).toMatch(/^heading-?text$/);
    }
  });

  it('Angular observa en dash-case: `apiBase` → `api-base`', () => {
    // Medido en el banco: con `ariaLabel="…"` el badge no recibía su etiqueta y con
    // `aria-label="…"` sí. Es el `camelToDashCase` de @angular/elements.
    const angular = PLATFORMS.find((p) => p.name === 'angular');
    expect(angular.atributoDeInput('apiBase')).toBe('api-base');
    expect(angular.atributoDeInput('copayMinor')).toBe('copay-minor');
    expect(angular.atributoDeInput('tone')).toBe('tone');
  });
});

describe('el cableado no se inventa', () => {
  it('apiBase, scope, currency y role van SIN atributo: el elemento usa su valor por defecto', () => {
    const academy = [
      { name: 'config', type: 'json' },
      { name: 'apiBase', type: 'string' },
      { name: 'currency', type: 'string' },
      { name: 'scope', type: 'string' },
      { name: 'role', type: 'string' },
    ];
    expect(atributosDeMuestra(academy, tal)).toEqual([]);
    expect(cableadoSinMuestra(academy)).toEqual(['apiBase', 'currency', 'scope', 'role']);
  });

  it('pero si el cableado declara un default, ése sí va: es un valor que el elemento acepta', () => {
    expect(valorDeMuestra({ name: 'layout', type: 'string', default: 'grid' })).toBe('grid');
    expect(valorDeMuestra({ name: 'layout', type: 'string', default: '' })).toBeNull();
  });

  it('el texto se sigue rellenando, para que el elemento no salga en blanco', () => {
    expect(valorDeMuestra({ name: 'heading', type: 'string' })).toBe('muestra: heading');
  });

  it('la página dice qué dejó sin muestra y por qué', () => {
    const html = paginaDelBanco({
      elemento: 'academy', tag: 'synergos-academy', framework: 'f', importMap: null, ...tal,
      inputs: [{ name: 'apiBase', type: 'string' }, { name: 'scope', type: 'string' }],
    });
    expect(html).toContain('Sin muestra:');
    expect(html).toContain('<code>apiBase</code>, <code>scope</code>');
    expect(html).not.toContain('muestra: scope');
  });
});

describe('las verticales, con el mismo criterio', () => {
  // Las verticales son las que hablan con su borde: las que declaran `apiBase`. Se DERIVAN
  // del contrato, no se listan — una vertical nueva entra sola y trae sus entradas a decidir.
  const inputs = loadInputs();
  const verticales = Object.entries(inputs)
    .filter(([, lista]) => Array.isArray(lista) && lista.some((i) => i.name === 'apiBase'));
  const texto = new Set(TEXTO_DE_LAS_VERTICALES);

  it('hay verticales que mirar — sin sujeto, lo de abajo pasa en verde sin mirar', () => {
    expect(verticales.length).toBeGreaterThanOrEqual(8);
    expect(verticales.map(([n]) => n)).toContain('academy');
  });

  it('toda entrada de texto de una vertical está decidida: cableado (sin muestra) o texto (con muestra)', () => {
    const sinDecidir = [];
    for (const [elemento, lista] of verticales) {
      for (const i of lista) {
        if (i.type !== 'string' || (i.default !== undefined && i.default !== '')) continue;
        if (!Object.hasOwn(ENTRADAS_DE_CABLEADO, i.name) && !texto.has(i.name)) {
          sinDecidir.push(`${elemento}.${i.name}`);
        }
      }
    }
    expect(sinDecidir, 'clasificala en ENTRADAS_DE_CABLEADO (con su razón) o en TEXTO_DE_LAS_VERTICALES').toEqual([]);
  });

  it('y ninguna entrada de los dos censos sobra: cada una existe en element-inputs.json', () => {
    const nombres = new Set(Object.values(inputs).filter(Array.isArray).flat().map((i) => i.name));
    const muertas = [...Object.keys(ENTRADAS_DE_CABLEADO), ...TEXTO_DE_LAS_VERTICALES].filter((n) => !nombres.has(n));
    expect(muertas, 'una excepción que sobra deja de leerse').toEqual([]);
  });

  it('cada entrada de cableado dice por qué', () => {
    for (const [nombre, razon] of Object.entries(ENTRADAS_DE_CABLEADO)) {
      expect(razon.length, nombre).toBeGreaterThan(20);
    }
  });
});
