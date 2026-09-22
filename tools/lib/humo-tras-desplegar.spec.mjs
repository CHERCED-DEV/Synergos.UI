import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { revisarHumoTrasDesplegar, sinComentarios } from './humo-tras-desplegar.mjs';
import { ROOT } from './synergos-config.mjs';

/**
 * Que un humo que ESPERA un commit cuelgue de quien lo publica (#74).
 *
 * Medido el 2026-09-22: `humo-cdn.yml` corría en cada push, derivaba
 * `git rev-parse --short HEAD` y exigía que el CDN sirviera ese commit; ningún
 * workflow del repo publicaba, y el CDN llevaba diez días sirviendo un build
 * cuyo commit no está en ninguna rama. Cuatro corridas rojas seguidas.
 *
 * Ningún test podía verlo: nada en `tools/lib` leía los workflows, y las dos
 * mitades —el humo y el despliegue— estaban en ficheros distintos, cada una
 * correcta por su cuenta. El hueco estaba justo en medio.
 */

// ── El cruce, con dobles ────────────────────────────────────────────────────

const HUMO_A_PEDIDO = {
  nombre: 'humo-cdn.yml',
  yaml: [
    'on:',
    '  workflow_dispatch:',
    '    inputs:',
    '      sha:',
    "        default: ''",
    'jobs:',
    '  humo:',
    '    steps:',
    '      - run: node tools/humo-cdn.mjs "$URL" --sha "$SHA"',
  ].join('\n'),
};

const DESPLIEGUE = {
  nombre: 'despliegue-cdn.yml',
  yaml: [
    'on:',
    '  push:',
    'jobs:',
    '  desplegar:',
    '    steps:',
    '      - run: npx wrangler deploy',
    '      - run: |',
    '          SHA="$(git rev-parse --short HEAD)"',
    '          node tools/humo-cdn.mjs "$URL" --sha "$SHA"',
  ].join('\n'),
};

describe('el humo y el despliegue se cruzan', () => {
  it('pasa cuando quien deriva el SHA es quien publica', () => {
    expect(revisarHumoTrasDesplegar([HUMO_A_PEDIDO, DESPLIEGUE])).toEqual([]);
  });

  // ── Diente 1 — EL DEFECTO, tal cual estaba ────────────────────────────
  it('rechaza un humo que se inventa el SHA sin publicar nada', () => {
    const comoEstaba = {
      nombre: 'humo-cdn.yml',
      yaml: [
        'on:',
        '  push:',
        'jobs:',
        '  humo:',
        '    steps:',
        '      - run: |',
        '          SHA="$(git rev-parse --short HEAD)"',
        '          node tools/humo-cdn.mjs "$URL" --sha "$SHA" --intentos 30',
      ].join('\n'),
    };

    const motivos = revisarHumoTrasDesplegar([comoEstaba]);
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toContain('humo-cdn.yml');
    expect(motivos[0]).toContain('git rev-parse');
  });

  // ── Diente 2 — publicar sin comprobar es el issue #9 ──────────────────
  it('rechaza un despliegue que publica y no corre el humo', () => {
    const mudo = {
      nombre: 'despliegue-cdn.yml',
      yaml: ['jobs:', '  desplegar:', '    steps:', '      - run: npx wrangler deploy'].join('\n'),
    };

    const motivos = revisarHumoTrasDesplegar([mudo, HUMO_A_PEDIDO]);
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toContain('issue #9');
  });

  // ── El límite, escrito como test para que nadie confíe de más ─────────
  it('NO sigue la variable: derivar un SHA para otra cosa también se marca', () => {
    // Este caso es un falso positivo y está aceptado. El gate mira si el
    // workflow nombra las dos piezas, no si el SHA derivado acaba en `--sha`;
    // seguirlo exigiría interpretar el shell de cada `run:`. El error barato
    // —pedirle explicarse a quien junta las dos cosas— se prefiere al caro,
    // que es dejar pasar el #74 otra vez. El arreglo, si aparece, es partir
    // ese `run:` en dos pasos, no relajar el diente.
    const inocente = {
      nombre: 'humo-cdn.yml',
      yaml: [
        'jobs:',
        '  humo:',
        '    steps:',
        '      - run: |',
        '          echo "corriendo desde $(git rev-parse --short HEAD)"',
        '          node tools/humo-cdn.mjs "$URL"',
      ].join('\n'),
    };

    expect(revisarHumoTrasDesplegar([inocente])).toHaveLength(1);
  });

  it('rechaza que nadie corra el humo', () => {
    const solo = { nombre: 'tests-ui.yml', yaml: 'jobs:\n  tests:\n    steps:\n      - run: npm test' };
    expect(revisarHumoTrasDesplegar([solo])[0]).toContain('sin que nadie lo comprobara');
  });

  // ── La red de seguridad ───────────────────────────────────────────────
  //
  // Sin esto, el día que el descubrimiento deje de ver, el cruce pasa en verde
  // sobre una lista vacía. Un rojo se arregla; un verde sobre el vacío se
  // hereda.
  it('sin workflows que leer, FALLA — no pasa por «no aplica»', () => {
    expect(revisarHumoTrasDesplegar([])[0]).toContain('no tiene sujeto');
  });
});

// ── Los comentarios, y contra qué protegen de verdad ────────────────────────
//
// NO es que sin el barrido el gate se quede ciego: medido, hoy ningún token
// aparece sólo en prosa, así que apagarlo no cambia el cruce sobre este disco.
// Lo que evita es un FALSO POSITIVO — que el gate acuse al fichero que EXPLICA
// el defecto de estar cometiéndolo—, y ése sí es el caso que viene: las dos
// cabeceras de este arreglo nombran las formas prohibidas a propósito.
//
// Un gate que se pone rojo por su propia explicación enseña a ignorarlo, que es
// exactamente el daño de #74.
describe('los comentarios no cuentan como código', () => {
  it('una cabecera que NARRA el defecto no lo comete', () => {
    const narra = {
      nombre: 'humo-cdn.yml',
      yaml: [
        '# Antes esto hacía `git rev-parse --short HEAD` y se lo pasaba a --sha;',
        '# hoy publica `despliegue-cdn.yml`, que corre `wrangler deploy` y el humo.',
        'jobs:',
        '  humo:',
        '    steps:',
        '      - run: node tools/humo-cdn.mjs "$URL"',
      ].join('\n'),
    };

    // Con la prosa contando, éste saldría acusado por el diente 1 —deriva el
    // SHA y no publica— siendo correcto. Comprobado apagando el barrido.
    const motivos = revisarHumoTrasDesplegar([narra]);
    expect(motivos).toEqual([]);
  });

  it('no se come un `#` que va dentro de comillas', () => {
    expect(sinComentarios('  - run: echo "a # b"')).toBe('  - run: echo "a # b"');
    expect(sinComentarios("  - run: echo 'a # b' # y esto no")).toBe("  - run: echo 'a # b' ");
  });

  it('un `#` pegado a un carácter no abre comentario (es una almohadilla)', () => {
    expect(sinComentarios('  ref: refs/tags/v1#2')).toBe('  ref: refs/tags/v1#2');
  });
});

// ── Y contra el disco de verdad ─────────────────────────────────────────────
describe('los workflows de este repo', () => {
  const dir = join(ROOT, '.github', 'workflows');

  it('cruzan', () => {
    expect(existsSync(dir)).toBe(true);

    const workflows = readdirSync(dir)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map((nombre) => ({ nombre, yaml: readFileSync(join(dir, nombre), 'utf8') }));

    // La misma red de seguridad, acá arriba: si el `readdirSync` deja de ver,
    // `revisar` ya falla, pero conviene que el mensaje lo diga.
    expect(workflows.length).toBeGreaterThan(0);

    expect(revisarHumoTrasDesplegar(workflows)).toEqual([]);
  });
});
