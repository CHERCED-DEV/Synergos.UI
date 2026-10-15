import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SELLO, contarFicheros, sellar, revisarSalida } from './sello-del-cdn.mjs';
import { MARCA_SIN_CONSERVAR } from './conservar-runtime.mjs';

/**
 * El sello de `build:cdn` y la puerta de `wrangler deploy` que lo exige (002-produccion).
 *
 * Lo medido: Workers Builds corría `wrangler deploy` sin construir y la puerta decía «se puede
 * desplegar» sobre un `public/` que no existía. Lo de acá prueba que la puerta sólo deja pasar una
 * salida que `build:cdn` terminó, para este commit y sin tocar después — y que lo dice nombrando al
 * publicador.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMMIT = 'a'.repeat(40);
const OTRO = 'b'.repeat(40);

let dir;
let salida;

/** Una salida mínima con forma de CDN: dos ficheros en dos niveles. */
function armarSalida() {
  mkdirSync(path.join(salida, 'synergos', 'academy', 'angular', 'latest'), { recursive: true });
  writeFileSync(path.join(salida, 'synergos', 'registry.json'), '{}');
  writeFileSync(path.join(salida, 'synergos', 'academy', 'angular', 'latest', 'meta.json'), '{}');
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sello-'));
  salida = path.join(dir, 'public');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('sellar', () => {
  it('cuenta los ficheros de la salida sin contarse a sí mismo', async () => {
    armarSalida();
    const sello = await sellar({ salida, fs: fsp, commit: COMMIT, ahora: new Date('2026-10-15T00:00:00Z') });
    expect(sello).toEqual({ commit: COMMIT, generado: '2026-10-15T00:00:00.000Z', ficheros: 2 });
    expect(JSON.parse(readFileSync(path.join(salida, SELLO), 'utf8'))).toEqual(sello);
    // Sellar otra vez no cambia la cuenta: el sello no es parte de lo construido.
    expect((await sellar({ salida, fs: fsp, commit: COMMIT })).ficheros).toBe(2);
    expect(await contarFicheros({ salida, fs: fsp })).toBe(2);
  });

  it('sin git, el commit queda en null y no se inventa', async () => {
    armarSalida();
    expect((await sellar({ salida, fs: fsp, commit: '' })).commit).toBeNull();
  });
});

describe('revisarSalida', () => {
  it('una salida que no existe NO se despliega, y el motivo nombra al publicador', async () => {
    const r = await revisarSalida({ salida, fs: fsp, commit: COMMIT });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/no existe/);
    expect(r.motivo).toMatch(/despliegue-cdn\.yml/);
    expect(r.motivo).toMatch(/Workers Builds/);
  });

  it('una ruta que no es un directorio NO se despliega', async () => {
    writeFileSync(salida, 'x');
    expect((await revisarSalida({ salida, fs: fsp, commit: COMMIT })).ok).toBe(false);
  });

  it('una salida sin sello —a medio construir— NO se despliega', async () => {
    armarSalida();
    const r = await revisarSalida({ salida, fs: fsp, commit: COMMIT });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/no lleva sello-del-cdn\.json/);
    expect(r.motivo).toMatch(/reemplazaría la CDN entera/);
  });

  it('un sello que no es JSON NO vale', async () => {
    armarSalida();
    writeFileSync(path.join(salida, SELLO), '{roto');
    expect((await revisarSalida({ salida, fs: fsp, commit: COMMIT })).ok).toBe(false);
  });

  it('un sello sin la cuenta NO vale', async () => {
    armarSalida();
    writeFileSync(path.join(salida, SELLO), JSON.stringify({ commit: COMMIT }));
    expect((await revisarSalida({ salida, fs: fsp, commit: COMMIT })).ok).toBe(false);
  });

  it('una salida tocada después de sellar NO se despliega', async () => {
    armarSalida();
    await sellar({ salida, fs: fsp, commit: COMMIT });
    writeFileSync(path.join(salida, 'synergos', 'colado.js'), '');
    const r = await revisarSalida({ salida, fs: fsp, commit: COMMIT });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/tiene 3 ficheros y `build:cdn` dejó 2/);
  });

  it('la salida de OTRO commit NO se despliega con el nombre de éste', async () => {
    armarSalida();
    await sellar({ salida, fs: fsp, commit: OTRO });
    const r = await revisarSalida({ salida, fs: fsp, commit: COMMIT });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/se construyó en bbbbbbb y se está desplegando aaaaaaa/);
  });

  it('sin git de un lado, pasa con la cuenta y lo dice', async () => {
    armarSalida();
    await sellar({ salida, fs: fsp, commit: null });
    const r = await revisarSalida({ salida, fs: fsp, commit: COMMIT });
    expect(r.ok).toBe(true);
    expect(r.aviso).toMatch(/no se pudo comparar el commit/);
  });

  it('una salida terminada, de este commit y sin tocar, pasa', async () => {
    armarSalida();
    await sellar({ salida, fs: fsp, commit: COMMIT });
    const r = await revisarSalida({ salida, fs: fsp, commit: COMMIT });
    expect(r).toEqual({ ok: true, sello: expect.objectContaining({ commit: COMMIT, ficheros: 2 }) });
  });
});

describe('la puerta de `wrangler deploy` (tools/cdn-desplegable.mjs), de verdad', () => {
  const puerta = (args) =>
    spawnSync(process.execPath, [path.join(ROOT, 'tools', 'cdn-desplegable.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
  const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();

  it('sin construir sale 1 y dice quién publica (lo que veía Workers Builds)', () => {
    const r = puerta(['--salida', salida]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no existe/);
    expect(r.stderr).toMatch(/despliegue-cdn\.yml/);
  });

  it('a medio construir sale 1', () => {
    armarSalida();
    expect(puerta(['--salida', salida]).status).toBe(1);
  });

  it('terminada para HEAD sale 0', async () => {
    armarSalida();
    await sellar({ salida, fs: fsp, commit: head() });
    const r = puerta(['--salida', salida]);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('terminada pero SIN conservar el runtime sigue saliendo 1 (ADR 0141)', async () => {
    armarSalida();
    writeFileSync(path.join(salida, MARCA_SIN_CONSERVAR), JSON.stringify({ porque: '--sin-conservar' }));
    await sellar({ salida, fs: fsp, commit: head() });
    const r = puerta(['--salida', salida]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/SIN conservar/);
  });
});

describe('build:cdn sella al FINAL', () => {
  it('el sello va después de la última comprobación (el presupuesto de tamaño), y una sola vez', () => {
    const fuente = readFileSync(path.join(ROOT, 'tools', 'build-cdn.mjs'), 'utf8');
    const llamadas = [...fuente.matchAll(/await sellar\(/g)];
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].index).toBeGreaterThan(fuente.lastIndexOf('check-size-budget.mjs'));
    expect(llamadas[0].index).toBeGreaterThan(fuente.lastIndexOf('process.exit(1)'));
  });
});
