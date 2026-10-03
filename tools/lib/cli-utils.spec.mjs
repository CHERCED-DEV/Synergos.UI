import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { leerBandera, revisarBanderas } from './cli-utils.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * UI#69 — `--cdn RUTA`, la forma que `publish-runtime.mjs` documentaba en su cabecera, se
 * ignoraba EN SILENCIO: sólo se leía `--cdn=RUTA`, y con la otra se publicaba a
 * `SYNERGOS_CDN` o a `C:\LOCAL_CDN` imprimiendo «✓» en cada fichero y «Done». En Linux creaba
 * una carpeta con ese nombre literal dentro del repo; en la máquina del arquitecto, donde esa
 * ruta existe, no dejaba ni ese rastro. Una bandera con otra letra (`--cnd`) daba lo mismo.
 */
describe('leerBandera — las dos formas o ninguna', () => {
  it('`--cdn RUTA` y `--cdn=RUTA` leen lo mismo', () => {
    expect(leerBandera(['--cdn', 'D:\\MyCDN'], 'cdn')).toBe('D:\\MyCDN');
    expect(leerBandera(['--cdn=D:\\MyCDN'], 'cdn')).toBe('D:\\MyCDN');
  });

  it('sin la bandera devuelve el respaldo que pidió quien llama', () => {
    expect(leerBandera(['--dry-run'], 'cdn')).toBeNull();
    expect(leerBandera([], 'cdn', 'public')).toBe('public');
  });

  it('la bandera que sigue NO es el valor de la anterior', () => {
    expect(leerBandera(['--cdn', '--dry-run'], 'cdn')).toBeNull();
  });

  it('no confunde una bandera con otra que empieza igual', () => {
    expect(leerBandera(['--cdnn=x'], 'cdn')).toBeNull();
    expect(leerBandera(['--cdnn', 'x'], 'cdn')).toBeNull();
  });
});

describe('revisarBanderas — lo que no se entiende se RECHAZA, no se ignora', () => {
  const PUBLISH_RUNTIME = { conValor: ['cdn', 'base'], sinValor: ['dry-run'] };

  it('las formas buenas no dicen nada', () => {
    expect(revisarBanderas([], PUBLISH_RUNTIME)).toEqual([]);
    expect(revisarBanderas(['--cdn', 'public', '--base', '/synergos', '--dry-run'], PUBLISH_RUNTIME)).toEqual([]);
    expect(revisarBanderas(['--cdn=public', '--base=/synergos'], PUBLISH_RUNTIME)).toEqual([]);
  });

  it('una bandera desconocida se nombra junto a las que sí existen', () => {
    const [error, ...resto] = revisarBanderas(['--cnd', 'public'], PUBLISH_RUNTIME);
    expect(resto).toEqual([]);
    expect(error).toContain('--cnd');
    expect(error).toContain('--cdn');
    expect(error).toContain('--dry-run');
  });

  it('una bandera con valor que llega sin él es un error, no el valor por defecto', () => {
    expect(revisarBanderas(['--cdn'], PUBLISH_RUNTIME)).toEqual([expect.stringContaining('--cdn')]);
    expect(revisarBanderas(['--cdn', '--dry-run'], PUBLISH_RUNTIME)).toEqual([expect.stringContaining('--cdn')]);
    expect(revisarBanderas(['--cdn='], PUBLISH_RUNTIME)).toEqual([expect.stringContaining('--cdn')]);
  });

  it('una bandera sin valor no se lleva uno, y un argumento suelto tampoco se traga', () => {
    expect(revisarBanderas(['--dry-run=si'], PUBLISH_RUNTIME)).toEqual([expect.stringContaining('--dry-run')]);
    expect(revisarBanderas(['public'], PUBLISH_RUNTIME)).toEqual([expect.stringContaining('public')]);
  });
});

/**
 * Las herramientas de verdad, no sólo la función (regla 5: un test que llama al método no ve
 * que falte el llamador). `publish-runtime.mjs` corre en un proceso aparte, SIEMPRE con
 * `--dry-run` —en ese modo no crea ni copia ni escribe nada: sólo lee `dist/runtime/`— y con
 * `SYNERGOS_CDN` apuntando a una carpeta temporal, así que ni el código de antes, que se
 * tragaba las banderas, podría publicar en `C:\LOCAL_CDN`. Lo que se mira es la línea
 * «Destino», que sale ANTES de buscar el runtime: así el caso no depende de que haya un
 * runtime construido en el árbol. El tope lo explica `TOPES_DECLARADOS`: son procesos de verdad.
 */
describe('publish-runtime.mjs lee `--cdn` en las dos formas (UI#69)', { timeout: 30_000 }, () => {
  const temporales = [];
  const temporal = () => {
    const ruta = mkdtempSync(join(tmpdir(), 'ui69-'));
    temporales.push(ruta);
    return ruta;
  };

  afterEach(() => {
    for (const ruta of temporales.splice(0)) {
      rmSync(ruta, { recursive: true, force: true });
    }
  });

  function publicarEnSimulacro(argv, entorno) {
    return spawnSync(process.execPath, [join(ROOT, 'tools', 'publish-runtime.mjs'), ...argv, '--dry-run'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, SYNERGOS_CDN: entorno },
    });
  }

  const destino = (salida) => salida.stdout.split('\n').find((linea) => linea.startsWith('Destino:'));

  it('`--cdn RUTA` y `--cdn=RUTA` publican al MISMO sitio, y lo dicen', () => {
    const pedida = temporal();
    const delEntorno = temporal();

    const conEspacio = destino(publicarEnSimulacro(['--cdn', pedida], delEntorno));
    const conIgual = destino(publicarEnSimulacro([`--cdn=${pedida}`], delEntorno));

    expect(conEspacio).toBe(`Destino: ${pedida} (--cdn)`);
    expect(conIgual).toBe(conEspacio);
  });

  it('sin `--cdn` dice que el destino salió de SYNERGOS_CDN', () => {
    const delEntorno = temporal();
    expect(destino(publicarEnSimulacro([], delEntorno))).toBe(`Destino: ${delEntorno} (SYNERGOS_CDN)`);
  });

  it('una bandera mal escrita sale con 2, nombra la buena, y no llega a publicar', () => {
    const salida = publicarEnSimulacro(['--cnd', temporal()], temporal());

    expect(salida.status).toBe(2);
    expect(salida.stderr).toContain('--cnd');
    expect(salida.stderr).toContain('--cdn');
    expect(destino(salida)).toBeUndefined();
  });

  it('build-cdn lee `--salida` por el mismo sitio, no a mano', () => {
    // `build-cdn.mjs` no se ejecuta acá: construye y escribe `public/`. Lo que se mira es que
    // ya no lee la bandera con `process.argv.indexOf('--salida')`, que ignoraba
    // `--salida=RUTA` y construía en `public/` sin decir nada (la misma forma, UI#69).
    const fuente = readFileSync(join(ROOT, 'tools', 'build-cdn.mjs'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(fuente).not.toMatch(/argv\.indexOf\(\s*['"]--salida['"]\s*\)/);
    expect(fuente).toMatch(/getArg\(\s*['"]salida['"]/);
  });
});
