import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CASA,
  declaraciones,
  ficherosTs,
  nombresNormalizadores,
  segundasDeclaraciones,
} from './normalizador-unico.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');

/** Un repo de mentira con la forma del de verdad: casa + un fichero fuera. */
function arbol(fuera) {
  const raiz = mkdtempSync(path.join(tmpdir(), 'normalizador-'));
  mkdirSync(path.join(raiz, CASA), { recursive: true });
  writeFileSync(
    path.join(raiz, CASA, 'config-input.util.ts'),
    'export function resolveConfigValue<T>(a: T, b: T, c: T): T { return a ?? b ?? c; }\n' +
      'export function monogram(t: string): string { return t.slice(0, 2); }\n' +
      'export const TOPE = 3;\n' +
      'function interna() { return 1; }\n',
  );
  for (const [rel, src] of Object.entries(fuera)) {
    mkdirSync(path.join(raiz, path.dirname(rel)), { recursive: true });
    writeFileSync(path.join(raiz, rel), src);
  }
  return raiz;
}

describe('los nombres salen del disco', () => {
  it('lee los export del normalizador y no una lista escrita a mano', () => {
    const raiz = arbol({});
    try {
      expect([...nombresNormalizadores(raiz)].sort()).toEqual(['TOPE', 'monogram', 'resolveConfigValue']);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it('en el repo de verdad son los 20 de los cuatro ficheros, con red de seguridad', () => {
    const nombres = nombresNormalizadores(REPO);
    // La red: si el descubrimiento deja de ver, la lista sale vacía y el cruce
    // pasaría en verde sin mirar nada. El piso lo hace ruidoso.
    expect(nombres.size).toBeGreaterThanOrEqual(18);
    for (const clave of ['coerceConfigInput', 'resolveConfigValue', 'resolveEmbedSrc', 'monogram']) {
      expect(nombres.has(clave)).toBe(true);
    }
  });

  it('un helper NO exportado del normalizador no entra — no es contrato de nadie', () => {
    const raiz = arbol({});
    try {
      expect(nombresNormalizadores(raiz).has('interna')).toBe(false);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

describe('las declaraciones', () => {
  it('reconoce función, const, let y var en ámbito de módulo', () => {
    const encontradas = declaraciones(
      'export function a() {}\nasync function b() {}\nconst c = 1;\nlet d = 2;\nvar e = 3;\n',
    ).map((x) => x.nombre);
    expect(encontradas).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('NO cuenta un import ni una llamada — sólo declaraciones', () => {
    const encontradas = declaraciones(
      "import { resolveConfigValue } from '@synergos/shared';\nresolveConfigValue(1, 2, 3);\n",
    ).map((x) => x.nombre);
    expect(encontradas).toEqual([]);
  });

  it('lee SIN COMENTARIOS — un gate no se puede engañar con su propia explicación', () => {
    // La cabecera de `inputs/index.ts` nombra `coerceTrimmedStringInput` para
    // explicar qué hay ahí. Sin quitar comentarios, eso contaría.
    const encontradas = declaraciones(
      '// function resolveConfigValue() {}\n/* const monogram = 1; */\nconst real = 2;\n',
    ).map((x) => x.nombre);
    expect(encontradas).toEqual(['real']);
  });
});

describe('el cruce', () => {
  it('la MUTACIÓN del ticket: una segunda declaración fuera de vitals se nombra con las dos', () => {
    const raiz = arbol({
      'platforms/angular/libs/shared/src/utils/otro.util.ts':
        'export function resolveConfigValue<T>(a: T): T { return a; }\n',
    });
    try {
      const segundas = segundasDeclaraciones(raiz);
      expect(segundas).toEqual([
        {
          fichero: path.join('platforms', 'angular', 'libs', 'shared', 'src', 'utils', 'otro.util.ts'),
          linea: 1,
          nombre: 'resolveConfigValue',
        },
      ]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it('⚠ RENOMBRAR EL FICHERO no prueba nada, y es la mutación que no vale', () => {
    // Un gate por ruta pasaría en verde con la copia puesta en otro sitio, que
    // es exactamente cómo aparecen las copias. Éste va por el identificador.
    const raiz = arbol({
      'platforms/angular/libs/shop/src/cosas/normalizar-entrada.ts':
        'const monogram = (t: string) => t.slice(0, 2);\nexport { monogram };\n',
    });
    try {
      expect(segundasDeclaraciones(raiz).map((s) => s.nombre)).toEqual(['monogram']);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it('el propio normalizador NO se denuncia a sí mismo', () => {
    const raiz = arbol({});
    try {
      expect(segundasDeclaraciones(raiz)).toEqual([]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it('el repo de verdad tiene UNA sola declaración de cada uno', () => {
    expect(segundasDeclaraciones(REPO)).toEqual([]);
  });

  it('el barrido llega a los dos árboles y no sólo a uno', () => {
    // Un gate que mirara sólo `platforms/angular/` pasaría en verde con la
    // copia puesta en `tools/` o en otro `vitals/` — la regla 25.
    const ficheros = ficherosTs(REPO).map((f) => path.relative(REPO, f));
    expect(ficheros.some((f) => f.startsWith(path.join('platforms', 'angular', 'apps')))).toBe(true);
    expect(ficheros.some((f) => f.startsWith(path.join('platforms', 'angular', 'libs')))).toBe(true);
    expect(ficheros.some((f) => f.startsWith(path.join('vitals', 'contracts')))).toBe(true);
    expect(ficheros.length).toBeGreaterThan(500);
  });
});
