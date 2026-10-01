import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { raicesEnDisco } from './frameworks.mjs';
import { lavadosComoTinta } from './tinta-de-lavado.mjs';

/**
 * Ningún texto se pinta con un token de LAVADO (UI#91). La medición y la razón están en la
 * cabecera de `tinta-de-lavado.mjs`.
 */

const REPO = path.resolve(import.meta.dirname, '../..');

function hojas(dir, salida = []) {
  if (!existsSync(dir)) return salida;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(node_modules|dist|\.test-out)$/.test(e.name)) hojas(full, salida);
    } else if (/\.(scss|css)$/.test(e.name) || (/\.(ts|tsx)$/.test(e.name) && !/\.spec\./.test(e.name))) {
      salida.push(full);
    }
  }
  return salida;
}

const fuentes = raicesEnDisco(REPO).flatMap((raiz) => [
  ...hojas(path.join(raiz, 'apps')),
  ...hojas(path.join(raiz, 'libs')),
]);

describe('un lavado de estado no es tinta (UI#91)', () => {
  it('hay hojas que mirar — sin sujeto, lo de abajo pasa en verde sin mirar', () => {
    expect(fuentes.filter((f) => f.endsWith('.scss')).length).toBeGreaterThan(150);
  });

  it('ningún `color:` de las plataformas nombra un -surface, -soft o -border de estado', () => {
    const malos = fuentes.flatMap((f) =>
      lavadosComoTinta(readFileSync(f, 'utf8')).map(
        (uso) => `${path.relative(REPO, f)}:${uso.linea} pinta texto con ${uso.token} → usá su -text`,
      ),
    );
    expect(
      malos,
      'Un lavado es un rgb(… / 0.10): como tinta da 1,1-1,3:1 en los siete temas del CMS, y en ' +
        'el banco no se ve porque el respaldo Sass es sólido. La tinta es el -text de la misma ' +
        'familia:\n  ' + malos.join('\n  '),
    ).toEqual([]);
  });
});

describe('el detector', () => {
  it('caza el lavado como tinta, con respaldo o sin él', () => {
    const hoja = [
      '.a { color: var(--syn-color-state-danger-surface, #{syn.$color-danger-500}); }',
      '.b {',
      '  color: var(--syn-color-state-warning-soft);',
      '}',
      ".c { color:var(--syn-color-state-success-border) }",
    ].join('\n');
    expect(lavadosComoTinta(hoja).map((u) => u.linea)).toEqual([1, 3, 5]);
  });

  it('el lavado como FONDO o como borde es su sitio, no se toca', () => {
    const hoja = [
      'background: var(--syn-color-state-danger-soft, transparent);',
      'background-color: var(--syn-color-state-danger-surface);',
      'border-color: var(--syn-color-state-danger-border);',
      'color: var(--syn-color-state-danger-text, #dc2626);',
    ].join('\n');
    expect(lavadosComoTinta(hoja)).toEqual([]);
  });

  it('la prosa que EXPLICA el defecto no cuenta', () => {
    const hoja = [
      '// antes: color: var(--syn-color-state-danger-surface) daba 1,15:1',
      '/* color: var(--syn-color-state-warning-surface) */',
      'color: var(--syn-color-state-warning-text, #8a6a12);',
    ].join('\n');
    expect(lavadosComoTinta(hoja)).toEqual([]);
  });

  it('caza también el estilo en línea de un componente', () => {
    const ts = "styles: [`.x { color: var(--syn-color-state-danger-surface); }`],";
    expect(lavadosComoTinta(ts)).toHaveLength(1);
  });
});
