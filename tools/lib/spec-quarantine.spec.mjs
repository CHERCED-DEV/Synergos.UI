import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * La cuarentena de specs no puede crecer sola (issue #1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE ESTE GATE, Y POR QUÉ SIGUE EXISTIENDO CON LA LISTA VACÍA.
 *
 * Al reconectar los 240 specs, 14 quedaron en rojo. Ninguno por el harness: 11
 * porque el DOM que asertaban ya no existía —el template se refactorizó
 * mientras los tests no corrían, que es lo que el ticket predijo (#13)— y 3
 * porque encontraron defectos y desacuerdos de verdad (#10, #11, #12).
 *
 * Se saltaron en vez de reescribirlos, porque reescribir una aserción para que
 * coincida con el código convierte un desacuerdo real en verde y borra el
 * hallazgo. Pero una cuarentena sin techo es peor que no tenerla:
 *
 *   > Un `skip` es gratis de añadir y nadie audita la lista. A los seis meses
 *   > son 40, la suite está verde y no prueba nada.
 *
 * Los 14 se cerraron uno a uno y hoy la lista está en CERO. El gate se queda,
 * porque cero es el único número que se defiende solo: con la lista vacía,
 * cualquier `skip` que aparezca tiene que justificarse en el commit que lo trae
 * — que es exactamente la conversación que este fichero existe para forzar.
 *
 * Las dos direcciones cuestan lo mismo a propósito. Si sólo doliera subir, la
 * lista nunca bajaría; fue bajar de 14 a 0 lo que probó que la simetría sirve.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const REPO = path.resolve(import.meta.dirname, '../..');
const APPS = path.join(REPO, 'platforms/angular/apps');
const LIBS = path.join(REPO, 'platforms/angular/libs');

/**
 * Lo que queda en cuarentena. Sube este número sólo con un ticket que lo diga.
 *
 *   14 → 13  el NG0904 de `media-explorer` (#10) — el único roto en producción
 *   13 → 12  el `id="null"` de `container-block` (#11)
 *   12 →  1  los 11 specs que asertaban contra un DOM que ya no existía (#13)
 *    1 →  0  `icon-block` decorativo por defecto (#12) — lo decidió el arquitecto
 *
 * El último no era deuda técnica sino una decisión sin tomar, y por eso fue el
 * que más tardó: el spec decía `role="presentation"` y el componente
 * `role="img"`. Ponerlo verde eligiendo el lado cómodo habría borrado la
 * pregunta en vez de contestarla.
 */
const EN_CUARENTENA = 0;

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

  it(`hay exactamente ${EN_CUARENTENA} test${EN_CUARENTENA === 1 ? '' : 's'} saltado${EN_CUARENTENA === 1 ? '' : 's'}, ni uno más`, () => {
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
