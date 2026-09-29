/**
 * El ÚNICO sitio de `tools/` que lanza `npm` (#79).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE ESTO CIERRA, MEDIDO.
 *
 * En Windows `npm` no es un ejecutable: es `npm.cmd`, un script por lotes. Y desde
 * Node 20.12 (CVE-2024-27980) `execFile`/`spawn` se NIEGAN a lanzar un `.cmd` sin
 * `shell: true`. Resultado, en una máquina Windows con Node 20.19:
 *
 *     npm run setup    → spawnSync npm ENOENT        (tools/setup.mjs)
 *     npm run build:cdn → spawnSync npm ENOENT       (tools/build-cdn.mjs, en build:vitals)
 *     npm run dev:cdn  → muere a los ~11 s           (tools/dev-cdn.mjs, al rehacer el runtime)
 *
 * O sea que «lo PRIMERO en un clon limpio» no se podía teclear. Había OCHO llamadas
 * sueltas en tres ficheros, y cinco pasaban por un helper (`correr('npm', …)`) que un
 * barrido por la forma `spawn('npm'` no ve: hubo que barrer también por el literal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ `shell: true` SÓLO EN WINDOWS, Y POR QUÉ SE VALIDAN LOS ARGUMENTOS.
 *
 * Con `shell: true` Node no escapa nada: CONCATENA los argumentos en una línea de
 * `cmd.exe`. Ese es justamente el agujero del CVE. Por eso cada argumento tiene que
 * ser una palabra que el intérprete no reinterprete (ver `PALABRA_SEGURA`), y se exige
 * en TODOS los sistemas: un argumento que en Linux
 * pasa y en Windows se parte es exactamente la clase de defecto que este fichero cierra.
 * Las llamadas de `tools/` son todas del tipo `run build:runtime` o
 * `--prefix <carpeta-relativa>`, así que la regla no le cuesta nada a nadie hoy.
 *
 * Fuera de Windows no se usa intérprete: `npm` es un ejecutable y `execFile` basta.
 */

import { spawn, spawnSync } from 'node:child_process';

/**
 * Lo que puede ir en un argumento sin que `cmd.exe` lo reinterprete. Deja fuera a
 * propósito el espacio, las comillas, `& | < > ^ %` (`%` expande variables) y la coma
 * y el punto y coma (separadores de argumentos de un `.cmd`).
 */
const PALABRA_SEGURA = /^[A-Za-z0-9_@+=:./\\-]+$/;

/**
 * Cómo se lanza `npm` en una plataforma. Pura: la plataforma se inyecta para que el
 * spec pueda verla fallar en Linux Y en Windows sin cambiar de máquina.
 *
 * @param {string[]} args
 * @param {NodeJS.Platform} [plataforma]
 * @returns {{ comando: 'npm', args: string[], opciones: { shell?: boolean } }}
 */
export function invocacionDeNpm(args, plataforma = process.platform) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('npm sin argumentos: decí qué correr (p. ej. ["run", "build"]).');
  }
  const inseguros = args.filter((a) => typeof a !== 'string' || !PALABRA_SEGURA.test(a));
  if (inseguros.length > 0) {
    throw new Error(
      `argumento(s) de npm que un intérprete reinterpretaría: ${inseguros.map((a) => JSON.stringify(a)).join(', ')}. ` +
        'En Windows npm se lanza con shell y los argumentos NO se escapan (#79).',
    );
  }
  return {
    comando: 'npm',
    args: [...args],
    opciones: plataforma === 'win32' ? { shell: true } : {},
  };
}

/**
 * Corre `npm` y ESPERA. No lanza: devuelve lo mismo que `spawnSync` (`status`, `error`…),
 * para quien necesita seguir después de un rojo — el runner de `npm test`, por ejemplo.
 *
 * @param {string[]} args
 * @param {import('node:child_process').SpawnSyncOptions} [opciones]
 */
export function ejecutarNpm(args, opciones = {}) {
  const { comando, args: a, opciones: extra } = invocacionDeNpm(args);
  return spawnSync(comando, a, { stdio: 'inherit', ...opciones, ...extra });
}

/**
 * Corre `npm`, espera, y LANZA si no salió 0 — la semántica de `execFileSync`, que es la
 * que tenían `setup` y `build-cdn`: un paso que falla para el script entero.
 *
 * @param {string[]} args
 * @param {import('node:child_process').SpawnSyncOptions} [opciones]
 */
export function correrNpm(args, opciones = {}) {
  const r = ejecutarNpm(args, opciones);
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`npm ${args.join(' ')} salió con ${r.status ?? r.signal}`);
  }
  return r;
}

/**
 * Lanza `npm` SIN esperar y devuelve el proceso hijo. Quien lo use tiene que escuchar
 * `error` además de `exit`: un `spawn` que no puede arrancar emite `error`, y sin oyente
 * ese evento tumba el proceso padre — que es como moría `dev:cdn`.
 *
 * @param {string[]} args
 * @param {import('node:child_process').SpawnOptions} [opciones]
 */
export function lanzarNpm(args, opciones = {}) {
  const { comando, args: a, opciones: extra } = invocacionDeNpm(args);
  return spawn(comando, a, { stdio: 'inherit', ...opciones, ...extra });
}
