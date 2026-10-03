import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { leerBandera } from './cli-utils.mjs';
import { contarFuentesPorPlataforma } from './element-sources.mjs';
import { plataformaAServir } from './frameworks.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * UI#80 — `npm run dev:cdn` salía con 2 desde #64, y la guía lo documentaba sin `--framework`.
 *
 * Ningún gate ejecutaba el comando que la guía documenta: `dev-cdn-routes` vigila las rutas del
 * servidor, no su arranque. Lo de abajo cruza la GUÍA contra la regla con la que el script elige
 * plataforma, sobre el disco de verdad: el comando documentado tiene que arrancar.
 */
describe('plataformaAServir — sin `angular` por defecto (UI#80)', () => {
  it('con UNA plataforma con elementos, ésa es, aunque haya otra declarada sin ninguno', () => {
    expect(plataformaAServir({ pedida: null, elementosPorPlataforma: { uno: 127, dos: 0 } })).toEqual({
      framework: 'uno',
    });
  });

  it('con VARIAS, no elige: dice exactamente qué teclear, una línea por plataforma', () => {
    const { error } = plataformaAServir({ pedida: null, elementosPorPlataforma: { uno: 127, dos: 1 } });
    expect(error).toContain('uno: 127, dos: 1');
    expect(error.split('\n').slice(1)).toEqual([
      '  npm run dev:cdn -- --framework=uno',
      '  npm run dev:cdn -- --framework=dos',
    ]);
  });

  it('la que se pide manda, si existe', () => {
    expect(plataformaAServir({ pedida: 'dos', elementosPorPlataforma: { uno: 127, dos: 1 } })).toEqual({
      framework: 'dos',
    });
  });

  it('una errata no se convierte en «la de siempre»: se nombra y se dice qué teclear', () => {
    const { error } = plataformaAServir({ pedida: 'unoo', elementosPorPlataforma: { uno: 127, dos: 1 } });
    expect(error).toContain('--framework=unoo');
    expect(error).toContain('  npm run dev:cdn -- --framework=uno');
  });

  it('sin ninguna plataforma con elementos no inventa una', () => {
    expect(plataformaAServir({ pedida: null, elementosPorPlataforma: { uno: 0 } })).toEqual({
      error: expect.stringContaining('ninguna plataforma tiene elementos'),
    });
  });
});

describe('contarFuentesPorPlataforma', () => {
  it('cuenta con la regla de la entrada de CADA plataforma, y la que no tiene carpeta es 0', () => {
    const arbol = {
      'p/uno/apps': ['a', 'b', 'grupo'],
      'p/uno/apps/grupo': ['c'],
      'p/dos/apps': ['badge'],
    };
    const entradas = new Set([
      'p/uno/apps/a/src/main.ts',
      'p/uno/apps/b/src/main.ts',
      'p/uno/apps/grupo/c/src/main.ts',
      // `dos` declara `.tsx`: un `main.ts` en su carpeta NO es un elemento suyo.
      'p/dos/apps/badge/src/main.ts',
    ]);
    const listar = (dir) => {
      if (!(dir in arbol)) throw new Error(`ENOENT ${dir}`);
      return arbol[dir];
    };

    const cuenta = contarFuentesPorPlataforma({
      listar,
      existe: (ruta) => entradas.has(ruta),
      plataformas: [
        { framework: 'uno', apps: 'p/uno/apps', entrada: 'src/main.ts' },
        { framework: 'dos', apps: 'p/dos/apps', entrada: 'src/main.tsx' },
        { framework: 'tres', apps: 'p/tres/apps', entrada: 'src/main.ts' },
      ],
    });

    expect(cuenta).toEqual({ uno: 3, dos: 0, tres: 0 });
  });
});

/**
 * Las guías que alguien copia para arrancar el banco: `CLAUDE.md`, `AGENTS.md`, `LLM.txt`, la
 * documentación de `SynergosDocs/` y la propia cabecera de `tools/dev-cdn.mjs`. Quedan fuera las
 * `MEDICION_*.md`: son mediciones FECHADAS y citan lo que se tecleó ese día.
 */
function guias() {
  const docs = join(ROOT, 'SynergosDocs');
  return [
    'CLAUDE.md',
    'AGENTS.md',
    'LLM.txt',
    'tools/dev-cdn.mjs',
    ...readdirSync(docs)
      .filter((f) => f.endsWith('.md') && !f.startsWith('MEDICION_'))
      .map((f) => `SynergosDocs/${f}`),
  ];
}

/** Cada `npm run dev:cdn …` de un texto, con los argumentos que lleva detrás del `--` de npm. */
function comandosDeDevCdn(texto) {
  const comandos = [];
  for (const [linea, fila] of texto.split('\n').entries()) {
    for (const casado of fila.matchAll(/npm run dev:cdn(?![:\w-])([^`#\n)]*)/g)) {
      const argumentos = casado[1].replace(/[[\]]/g, ' ').split(/\s+/).filter(Boolean);
      if (argumentos[0] === '--') argumentos.shift();
      comandos.push({ linea: linea + 1, texto: casado[0].trim(), argumentos });
    }
  }
  return comandos;
}

describe('el comando que documentan las guías ARRANCA (UI#80)', () => {
  const listar = (dir) =>
    readdirSync(join(ROOT, dir), { withFileTypes: true })
      .filter((entrada) => entrada.isDirectory())
      .map((entrada) => entrada.name);
  const elementosPorPlataforma = contarFuentesPorPlataforma({
    listar,
    existe: (ruta) => existsSync(join(ROOT, ruta)),
  });

  const documentados = guias().flatMap((guia) =>
    comandosDeDevCdn(readFileSync(join(ROOT, guia), 'utf8')).map((comando) => ({ guia, ...comando })),
  );

  it('hay comandos que cruzar, o el cruce no mira nada', () => {
    // Red de seguridad: un extractor roto daría cero comandos y todo lo de abajo en verde.
    expect(documentados.length).toBeGreaterThanOrEqual(8);
    expect(documentados.some((c) => c.guia === 'CLAUDE.md')).toBe(true);
  });

  it('cada `npm run dev:cdn` documentado elige plataforma sobre el disco de hoy', () => {
    const queNoArrancan = documentados
      .map((c) => ({
        c,
        eleccion: plataformaAServir({ pedida: leerBandera(c.argumentos, 'framework'), elementosPorPlataforma }),
      }))
      .filter(({ eleccion }) => 'error' in eleccion)
      .map(({ c, eleccion }) => `${c.guia}:${c.linea} «${c.texto}» → ${eleccion.error.split('\n')[0]}`);

    expect(queNoArrancan, 'comandos documentados que salen con 2').toEqual([]);
  });
});

/**
 * Y `dev-cdn.mjs` decide CON esa regla (regla 5: probar la función no ve que el script no la
 * llame). Se lanza con una plataforma que no existe, que sale con 2 ANTES de compilar o
 * escuchar en ningún puerto —en cualquier árbol, tenga una plataforma o diez—, y lo que dice
 * tiene que ser, letra por letra, lo que la regla contesta sobre el disco de hoy.
 */
describe('dev-cdn.mjs elige con plataformaAServir (UI#80)', { timeout: 30_000 }, () => {
  it('una plataforma que no existe sale con 2 y dice exactamente qué teclear', () => {
    const elementosPorPlataforma = contarFuentesPorPlataforma({
      listar: (dir) =>
        readdirSync(join(ROOT, dir), { withFileTypes: true })
          .filter((entrada) => entrada.isDirectory())
          .map((entrada) => entrada.name),
      existe: (ruta) => existsSync(join(ROOT, ruta)),
    });
    const esperado = plataformaAServir({ pedida: 'no-existe', elementosPorPlataforma });

    const salida = spawnSync(process.execPath, [join(ROOT, 'tools', 'dev-cdn.mjs'), '--framework=no-existe'], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    expect(salida.status).toBe(2);
    expect(salida.stderr.trim()).toBe(`[dev-cdn] ${esperado.error}`);
  });
});
