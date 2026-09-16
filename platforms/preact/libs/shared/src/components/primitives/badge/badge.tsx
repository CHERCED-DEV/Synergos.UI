/**
 * El `badge` del design system, en Preact — el gemelo de
 * `platforms/angular/libs/shared/.../badge/badge.ts`.
 *
 * `badge.scss` se reusa **byte a byte**: son `@use` sobre `vitals/core-assets` y
 * clases `.syn-badge--*` planas, sin una sola construcción de framework. La
 * épica #37 hablaba de «reescribir el design system»; lo que se reescribe es su
 * CABLEADO —23 líneas— y no su ASPECTO —50 líneas de SCSS que se copian sin
 * tocar—. Ése es el hallazgo barato de esta HU y conviene decirlo alto.
 */

import type { BadgeConfig } from './badge.config';
import { resolveConfigValue } from '@synergos/core/inputs';

export interface BadgeProps {
  readonly config?: Partial<BadgeConfig>;
  readonly text?: string;
  readonly ariaLabel?: string;
  readonly tone?: BadgeConfig['tone'];
}

export function Badge({ config, text, ariaLabel, tone }: BadgeProps) {
  const textoFinal = resolveConfigValue(text, config?.text, '');
  const etiqueta = resolveConfigValue(ariaLabel, config?.ariaLabel, '');
  const tono = resolveConfigValue(tone, config?.tone, 'neutral');

  return (
    <span class={`syn-badge syn-badge--${tono}`} role="status" aria-label={etiqueta || textoFinal}>
      {textoFinal}
    </span>
  );
}
