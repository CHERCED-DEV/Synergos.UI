import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * La cuarentena de specs no puede crecer sola (issue #1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTE GATE.
 *
 * Al reconectar los 240 specs, 14 quedaron en rojo. Ninguno por el harness: 12
 * porque el DOM que asertan ya no existe —el template se refactorizó mientras
 * los tests no corrían, que es exactamente lo que el ticket predijo— y 2 porque
 * encontraron defectos de verdad.
 *
 * Se saltaron en vez de reescribirlos, porque reescribir una aserción para que
 * coincida con el código convierte un desacuerdo real en verde y borra el
 * hallazgo. Pero una cuarentena sin techo es peor que no tenerla:
 *
 *   > Un `skip` es gratis de añadir y nadie audita la lista. A los seis meses
 *   > son 40, la suite está verde y no prueba nada.
 *
 * Así que el número está escrito acá. Añadir el 15º pone el build en rojo y
 * obliga a justificarlo; arreglar uno también, y obliga a bajar el número. Las
 * dos direcciones cuestan lo mismo a propósito — si sólo doliera subir, la
 * lista nunca bajaría.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const REPO = path.resolve(import.meta.dirname, '../..');
const APPS = path.join(REPO, 'platforms/angular/apps');
const LIBS = path.join(REPO, 'platforms/angular/libs');

/** Lo que había el día que se reconectaron los specs. Baja este número al arreglar uno. */
const EN_CUARENTENA = 14;

function specs(raiz) {
  const encontrados = [];
  if (!existsSync(raiz)) return encontrados;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (/^(node_modules|dist|\.cdn-out|\.test-out)$/.test(e.name)) continue;
        walk(full);
      } else if (e.name.endsWith('.spec.ts')) encontrados.push(full);
    }
  };
  walk(raiz);
  return encontrados;
}

const todos = [...specs(APPS), ...specs(LIBS)];

describe('cuarentena de specs Angular', () => {
  it('los specs siguen en el árbol y se encuentran', () => {
    // Si esto baja de golpe es que alguien movió o borró specs — que es el otro
    // modo de que una suite se quede callada.
    expect(todos.length).toBeGreaterThanOrEqual(240);
  });

  it(`hay exactamente ${EN_CUARENTENA} tests saltados, ni uno más`, () => {
    const saltados = todos.flatMap((f) => {
      const src = readFileSync(f, 'utf8');
      return [...src.matchAll(/^\s*(?:it|test)\.skip\(/gm)].map(() => path.relative(REPO, f));
    });

    expect(saltados.length, `saltados en:\n  ${[...new Set(saltados)].join('\n  ')}`).toBe(
      EN_CUARENTENA,
    );
  });

  it('y cada uno dice por qué, con su ticket', () => {
    // Un skip sin motivo es un skip que nadie va a poder retomar: dentro de seis
    // meses no se sabe si sobra el test o falta el arreglo.
    for (const f of todos) {
      const lineas = readFileSync(f, 'utf8').split('\n');
      lineas.forEach((linea, i) => {
        if (!/^\s*(?:it|test)\.skip\(/.test(linea)) return;
        const antes = lineas.slice(Math.max(0, i - 4), i).join('\n');
        expect(antes, `${path.relative(REPO, f)}:${i + 1} — skip sin motivo`).toMatch(
          /CUARENTENA #\d+/,
        );
      });
    }
  });
});
