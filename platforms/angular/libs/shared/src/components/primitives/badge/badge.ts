import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';
import {
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/vitals-core/inputs';

type BadgeTone = 'neutral' | 'brand' | 'inverse';

export interface BadgeConfig {
  readonly text?: string;
  readonly ariaLabel?: string;
  readonly tone?: BadgeTone;
}

function sanitizeBadgeConfig(value: Partial<BadgeConfig>): Partial<BadgeConfig> {
  return omitUndefinedProperties<BadgeConfig>({
    text: coerceTrimmedStringInput(value.text),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
    tone: coerceStringEnumInput(value.tone, ['neutral', 'brand', 'inverse'] as const),
  });
}

@Component({
  selector: 'syn-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="syn-badge"
      [class.syn-badge--neutral]="tone() === 'neutral'"
      [class.syn-badge--brand]="tone() === 'brand'"
      [class.syn-badge--inverse]="tone() === 'inverse'"
      [attr.role]="live() ? 'status' : null"
    >
      <!--
        Una insignia es una etiqueta, no un anuncio: la región viva va sólo con «live» (014-despiece-tienda). Sin rol,
        el aria-label de un <span> no lo lee nadie, así que el nombre que difiere del texto va escrito y oculto a la vista.
      -->
      @if (ariaLabel() && ariaLabel() !== text()) {
        <span aria-hidden="true">{{ text() }}</span>
        <span class="syn-badge__sr">{{ ariaLabel() }}</span>
      } @else {
        {{ text() }}
      }
    </span>
  `,
  styleUrl: './badge.scss',
})
export class BadgeComponent {
  readonly config = input<Partial<BadgeConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<BadgeConfig>(sanitizeBadgeConfig),
  });
  readonly textInput = input<string | undefined>(undefined, { alias: 'text' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly toneInput = input<BadgeTone | undefined>(undefined, { alias: 'tone' });
  /** Para un contador que cambia y TIENE que anunciarse: `role="status"`. Por defecto, una etiqueta callada. */
  readonly live = input(false, { transform: booleanAttribute });

  readonly text = computed(() =>
    resolveConfigValue(this.textInput(), this.config()?.text, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, ''),
  );
  readonly tone = computed(() =>
    resolveConfigValue(this.toneInput(), this.config()?.tone, 'neutral'),
  );
}
