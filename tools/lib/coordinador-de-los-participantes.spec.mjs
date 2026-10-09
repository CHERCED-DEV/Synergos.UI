import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { PLATAFORMAS, descubrirFuentes } from './element-sources.mjs';
import { apiDelParticipante, importadoDeVitals, revisarEntrada } from './coordinador-de-los-participantes.mjs';

/**
 * Cada participante de un flujo define `<synergos-flujo>` al cargar, antes de registrarse (ADR
 * 0140 F4, decisión 2). La razón está en la cabecera de `coordinador-de-los-participantes.mjs`.
 */

const REPO = path.resolve(import.meta.dirname, '../..');
const FLUJOS = path.join(REPO, 'vitals/core/src/flujos');

const API = apiDelParticipante(
  readdirSync(FLUJOS)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => readFileSync(path.join(FLUJOS, f), 'utf8')),
);

function codigo(dir, salida = []) {
  if (!existsSync(dir)) return salida;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(node_modules|dist|\..*)$/.test(e.name)) codigo(full, salida);
    } else if (/\.tsx?$/.test(e.name) && !/\.(spec|d)\.tsx?$/.test(e.name)) {
      salida.push(readFileSync(full, 'utf8'));
    }
  }
  return salida;
}

/** Los elementos que importan de `@synergos/vitals-core` algo con lo que se le habla al coordinador. */
const participantes = [
  ...descubrirFuentes({
    listar: (d) => {
      const abs = path.resolve(REPO, d);
      return existsSync(abs) && statSync(abs).isDirectory()
        ? readdirSync(abs, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
        : [];
    },
    existe: (r) => existsSync(path.resolve(REPO, r)),
  }),
]
  .map(([nombre, { framework, dir }]) => {
    const usa = new Set(codigo(path.resolve(REPO, dir)).flatMap((f) => [...importadoDeVitals(f)].filter((n) => API.has(n))));
    const entrada = PLATAFORMAS.find((p) => p.framework === framework)?.entrada;
    return { nombre, usa: [...usa].sort(), entrada: path.resolve(REPO, dir, entrada ?? '') };
  })
  .filter((p) => p.usa.length > 0);

describe('cada participante de un flujo define <synergos-flujo> al cargar (ADR 0140 F4)', () => {
  it('hay sujeto: la API del participante se deriva de los flujos, y Eventos participa', () => {
    expect([...API]).toEqual(
      expect.arrayContaining(['pedirAlFlujo', 'hayCoordinador', 'abrirCompraDeEventos', 'cerrarCompraDeEventos', 'consultarCompraDeEventos']),
    );
    expect(participantes.map((p) => p.nombre)).toContain('eventos');
  });

  it('la entrada de cada participante llama definirCoordinador() antes de registrar su elemento', () => {
    const malos = participantes.flatMap((p) => {
      const razon = existsSync(p.entrada) ? revisarEntrada(readFileSync(p.entrada, 'utf8')) : 'no tiene entrada';
      return razon ? [`${p.nombre} (usa ${p.usa.join(', ')}): ${razon}`] : [];
    });
    expect(
      malos,
      'Sin coordinador definido, cada pedido contesta cliente.sin_coordinador y la compra dice «no ' +
        'disponible» sin tocar la red, con todo lo demás en verde:',
    ).toEqual([]);
  });
});

describe('el detector', () => {
  it('deriva la API: las raíces y lo que las llama, sin contar lo que sólo las nombra en un comentario', () => {
    const api = apiDelParticipante([
      'export function pedirAlFlujo() {}\nexport function hayCoordinador() {}',
      "export async function abrir(d) { return leida(await pedirAlFlujo(d, 'f', 'abrir', {})); }\n" +
        'export function envuelve(d) { return abrir(d); }\n' +
        '/** usa pedirAlFlujo( por dentro */\nexport function suelta() { return 1; }',
    ]);
    expect([...api].sort()).toEqual(['abrir', 'envuelve', 'hayCoordinador', 'pedirAlFlujo']);
  });

  it('lee lo que se importa de @synergos/vitals-core, con alias y tipos', () => {
    const fuente = "import { aMenores, abrirCompraDeEventos as abrir, type Flujo } from '@synergos/vitals-core';\n// import { hayCoordinador } from '@synergos/vitals-core';";
    expect([...importadoDeVitals(fuente)].sort()).toEqual(['Flujo', 'aMenores', 'abrirCompraDeEventos']);
  });

  it('la entrada: definir antes de registrar está bien; sin definir, o después, o sólo en un comentario, no', () => {
    const importa = "import { registrarElementoAngular } from '@synergos/core';\nimport { definirCoordinador } from '@synergos/vitals-core';\n";
    expect(revisarEntrada(`${importa}definirCoordinador();\nregistrarElementoAngular('synergos-x', X, c);`)).toBeNull();
    expect(revisarEntrada(`${importa}registrarElementoAngular('synergos-x', X, c);`)).toMatch(/no llama/);
    expect(revisarEntrada(`${importa}registrarElementoAngular('synergos-x', X, c);\ndefinirCoordinador();`)).toMatch(/DESPUÉS/);
    expect(revisarEntrada(`${importa}// definirCoordinador();\nregistrarElementoAngular('synergos-x', X, c);`)).toMatch(/no llama/);
  });
});
