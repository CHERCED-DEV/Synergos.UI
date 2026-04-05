/**
 * CLI utility functions shared by all tools/ scripts.
 *
 * Centralizes argument parsing, dry-run detection, and log prefix formatting
 * so each script doesn't re-implement the same helpers.
 */

const args = process.argv.slice(2);

/**
 * Read a named CLI flag value.
 * Supports both `--flag value` and `--flag=value` formats.
 *
 * @param {string} flag — flag name without `--` prefix
 * @param {*} [fallback=null] — value if flag is missing
 * @returns {string | *}
 */
export function getArg(flag, fallback = null) {
  const prefix = `--${flag}=`;
  const eqMatch = args.find((a) => a.startsWith(prefix));
  if (eqMatch) return eqMatch.slice(prefix.length);

  const spaceIdx = args.indexOf(`--${flag}`);
  return spaceIdx !== -1 && args[spaceIdx + 1] && !args[spaceIdx + 1].startsWith('--')
    ? args[spaceIdx + 1]
    : fallback;
}

/** Whether `--dry-run` was passed */
export const DRY_RUN = args.includes('--dry-run');

/** Log prefix — prepends `[DRY RUN] ` when applicable */
export const LOG_PREFIX = DRY_RUN ? '[DRY RUN] ' : '';
