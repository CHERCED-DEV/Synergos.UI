/**
 * `<synergos-badge>` en Preact — el envoltorio que el CMS coloca.
 *
 * Es el gemelo de `platforms/angular/apps/elements/primitives/badge/src/badge/
 * badge.ts`, y hace exactamente lo mismo: lee lo que el editor escribió, lo
 * normaliza y delega en la pieza del design system. Lo que NO hace es registrar
 * el tag — de eso se encarga `registrarElementoPreact`, que es el único sitio de
 * esta plataforma que llama a `customElements.define` y hay gate que lo exige
 * (obligación 8, #62).
 *
 * `BadgeElementConfig` sale de `@synergos/contracts`, o sea de `vitals/`: es el
 * contrato con el CMS y es el MISMO para las dos plataformas. Los `coerce*` y
 * `resolveConfigValue` salen de `@synergos/core`, o sea también de `vitals/`,
 * porque bajaron ahí en #63 — sin esa mudanza este fichero habría copiado el
 * normalizador que comparten 122 elementos de Angular, y dos normalizadores que
 * se separan es cómo una clave deja de cruzar en silencio.
 */

import type { BadgeElementConfig } from '@synergos/contracts';
import {
  coerceConfigInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/core/inputs';
import { Badge, BADGE_TONES, instalarEstilos } from '@synergos/preact-shared';

/** Los atributos que el CMS puede escribir. Es lo que observa el custom element. */
export const ATRIBUTOS = ['config', 'text', 'ariaLabel', 'tone'] as const;

export interface BadgeElementProps extends Record<string, unknown> {
  readonly config?: unknown;
  readonly text?: unknown;
  readonly ariaLabel?: unknown;
  readonly tone?: unknown;
}

function sanear(value: Partial<BadgeElementConfig>): Partial<BadgeElementConfig> {
  return omitUndefinedProperties<BadgeElementConfig>({
    text: coerceTrimmedStringInput(value.text),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
    tone: coerceStringEnumInput(value.tone, BADGE_TONES),
  });
}

export function BadgeElement(props: BadgeElementProps) {
  instalarEstilos();

  // `config` llega como cadena JSON desde el atributo, o como objeto si alguien
  // lo asigna por propiedad. `coerceConfigInput` resuelve las dos y devuelve
  // `undefined` ante basura — no `{}`, que afirmaría que el editor no puso nada.
  const config = coerceConfigInput<BadgeElementConfig>(props.config);
  const saneado = config ? sanear(config) : undefined;

  return (
    <Badge
      config={saneado}
      text={coerceTrimmedStringInput(props.text)}
      ariaLabel={coerceTrimmedStringInput(props.ariaLabel)}
      tone={coerceStringEnumInput(props.tone, BADGE_TONES)}
    />
  );
}

/** El valor por defecto, para que `resolveConfigValue` no lo tenga que adivinar. */
export const TONO_POR_DEFECTO = resolveConfigValue(undefined, undefined, 'neutral' as const);
