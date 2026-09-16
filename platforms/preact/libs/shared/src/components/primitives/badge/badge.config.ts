/**
 * La API del `badge` como design system — y la primera prueba real de lo que
 * #36 dejó abierto sobre el **grupo B**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO ES UNA COPIA DE `platforms/angular/…/badge/badge.ts`, Y ESTÁ MEDIDA.
 *
 * `FRONTERA_VITALS.md` §5 clasifica los 13 `sanitize*Config` co-locados como
 * grupo B y deja la decisión escrita sin tomar: el `*Config` de un componente
 * describe **la API del design system**, no lo que emite el CMS, así que mudarlo
 * a `vitals` haría que `vitals` declarase la forma de componentes de UI — justo
 * lo que la frontera dice que no. La propuesta de #36 es **partirlos**: el
 * `sanitize*` a `vitals` y el tipo `*Config` al `shared` de cada framework.
 *
 * **#63 dejó el grupo B fuera a propósito, y esta HU no lo abre**: partir 13
 * ficheros por un elemento sería decidir una conversación entera de refilón. Lo
 * que sí aporta es el DATO que hasta hoy no existía, porque no había segunda
 * plataforma con la que medirlo:
 *
 *   · el tipo `BadgeConfig` (3 campos, 5 líneas) es de ESTE design system y
 *     tenía que escribirse igual;
 *   · `sanitizeBadgeConfig` (8 líneas) salió **idéntico**, llamada por llamada,
 *     a la de Angular — es puro normalizador del CMS.
 *
 * O sea que la propuesta de #36 la confirma la práctica: la mitad que se repite
 * es la que él quería mudar y la mitad que no, la que quería dejar. Con 13
 * componentes son ~104 líneas de normalizador duplicadas contra ~65 de tipos que
 * no lo son.
 *
 * ⚠ **Y el gate `normalizador-unico` NO caza esto**, que es la mitad que hay que
 * saber: vigila los 20 nombres que EXPORTA `vitals/core/src/inputs/`, y
 * `sanitizeBadgeConfig` no es uno de ellos. Decirlo es más honesto que insinuar
 * que la duplicación está cubierta — no lo está, y por eso el grupo B sigue
 * siendo trabajo y no una nota.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  omitUndefinedProperties,
} from '@synergos/core/inputs';

export type BadgeTone = 'neutral' | 'brand' | 'inverse';

export const BADGE_TONES: readonly BadgeTone[] = ['neutral', 'brand', 'inverse'] as const;

export interface BadgeConfig {
  readonly text?: string;
  readonly ariaLabel?: string;
  readonly tone?: BadgeTone;
}

export function sanitizeBadgeConfig(value: Partial<BadgeConfig>): Partial<BadgeConfig> {
  return omitUndefinedProperties<BadgeConfig>({
    text: coerceTrimmedStringInput(value.text),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
    tone: coerceStringEnumInput(value.tone, BADGE_TONES),
  });
}
