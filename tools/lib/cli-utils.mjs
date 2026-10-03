/**
 * CLI utility functions shared by all tools/ scripts.
 *
 * Centralizes argument parsing, dry-run detection, and log prefix formatting
 * so each script doesn't re-implement the same helpers.
 */

const args = process.argv.slice(2);

/**
 * Lee el valor de una bandera sobre un `argv` DADO, en las dos formas: `--flag valor` y
 * `--flag=valor`. Es la parte pura de {@link getArg}, para que se pueda probar (UI#69).
 *
 * La bandera que sigue NO es un valor: con `--cdn --dry-run`, `--cdn` no tiene valor.
 *
 * @param {readonly string[]} argv — los argumentos, sin `node` ni el script
 * @param {string} flag — el nombre sin `--`
 * @param {*} [fallback=null] — lo que se devuelve si no viene
 * @returns {string | *}
 */
export function leerBandera(argv, flag, fallback = null) {
  const prefix = `--${flag}=`;
  const eqMatch = argv.find((a) => a.startsWith(prefix));
  if (eqMatch) return eqMatch.slice(prefix.length);

  const spaceIdx = argv.indexOf(`--${flag}`);
  return spaceIdx !== -1 && argv[spaceIdx + 1] && !argv[spaceIdx + 1].startsWith('--')
    ? argv[spaceIdx + 1]
    : fallback;
}

/**
 * Read a named CLI flag value.
 * Supports both `--flag value` and `--flag=value` formats.
 *
 * @param {string} flag — flag name without `--` prefix
 * @param {*} [fallback=null] — value if flag is missing
 * @returns {string | *}
 */
export function getArg(flag, fallback = null) {
  return leerBandera(args, flag, fallback);
}

/**
 * Lo que una herramienta NO entiende de su línea de órdenes, para rechazarlo en vez de
 * ignorarlo (UI#69).
 *
 * `publish-runtime.mjs --cdn public` publicaba a `C:\LOCAL_CDN` porque sólo leía `--cdn=`, y
 * `--cnd public` daba lo mismo: las dos salían con «Done». Una bandera que se ignora en silencio
 * convierte una errata en «hacé lo de siempre», que es la forma más cara de equivocarse — el
 * resultado se parece a uno bueno. Devuelve un mensaje por problema; vacío es «está bien».
 *
 * @param {readonly string[]} argv — los argumentos, sin `node` ni el script
 * @param {{ conValor?: readonly string[], sinValor?: readonly string[] }} conocidas
 *   las banderas que la herramienta entiende, sin `--`
 * @returns {string[]}
 */
export function revisarBanderas(argv, { conValor = [], sinValor = [] }) {
  const todas = [...conValor, ...sinValor].map((nombre) => `--${nombre}`).join(', ');
  const errores = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      errores.push(`argumento suelto: «${arg}» — esta herramienta sólo entiende ${todas}.`);
      continue;
    }
    const igual = arg.indexOf('=');
    const nombre = arg.slice(2, igual === -1 ? undefined : igual);

    if (sinValor.includes(nombre)) {
      if (igual !== -1) {
        errores.push(`--${nombre} no lleva valor: se escribe sola.`);
      }
      continue;
    }

    if (conValor.includes(nombre)) {
      if (igual !== -1) {
        if (arg.slice(igual + 1) === '') {
          errores.push(`--${nombre} sin valor: --${nombre}=VALOR o --${nombre} VALOR.`);
        }
        continue;
      }
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith('--')) {
        errores.push(`--${nombre} sin valor: --${nombre}=VALOR o --${nombre} VALOR.`);
        continue;
      }
      i += 1; // el valor ya es de esta bandera
      continue;
    }

    errores.push(`bandera desconocida: --${nombre} — esta herramienta entiende ${todas}.`);
    // `--cnd public`: lo que sigue es, casi seguro, el valor de la bandera mal escrita. Se da
    // por suyo para que el error sea UNO y nombre la errata, no dos que despistan.
    if (igual === -1 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
      i += 1;
    }
  }

  return errores;
}

/** Whether `--dry-run` was passed */
export const DRY_RUN = args.includes('--dry-run');

/** Log prefix — prepends `[DRY RUN] ` when applicable */
export const LOG_PREFIX = DRY_RUN ? '[DRY RUN] ' : '';
