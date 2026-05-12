import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FocusVisibleDirective } from '../../../directives/focus-visible.directive';
import { classNames } from '../../../utils/class-names.util';
import {
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '../../../utils/config-input.util';

type LinkTone = 'brand' | 'neutral' | 'inverse';

export interface LinkConfig {
  readonly href?: string;
  readonly label?: string;
  readonly ariaLabel?: string;
  readonly tone?: LinkTone;
  readonly underline?: boolean;
  readonly target?: string;
  readonly rel?: string;
  readonly disabled?: boolean;
}

function sanitizeLinkConfig(value: Partial<LinkConfig>): Partial<LinkConfig> {
  return omitUndefinedProperties<LinkConfig>({
    href: coerceTrimmedStringInput(value.href),
    label: coerceTrimmedStringInput(value.label),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
    tone: coerceStringEnumInput(value.tone, ['brand', 'neutral', 'inverse'] as const),
    underline: coerceOptionalBooleanInput(value.underline),
    target: coerceTrimmedStringInput(value.target),
    rel: coerceTrimmedStringInput(value.rel),
    disabled: coerceOptionalBooleanInput(value.disabled),
  });
}

@Component({
  selector: 'syn-link',
  standalone: true,
  imports: [FocusVisibleDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (href()) {
      <a
        synFocusVisible
        class="syn-link"
        [class]="linkClass()"
        [href]="disabled() ? null : href()"
        [target]="target() || null"
        [rel]="resolvedRel() || null"
        [attr.aria-label]="ariaLabel() || label() || null"
        [attr.aria-disabled]="disabled() ? 'true' : null"
        [attr.tabindex]="disabled() ? -1 : null"
        (click)="onActivate($event)"
      >
        @if (label()) {
          {{ label() }}
        } @else {
          <ng-content />
        }
      </a>
    } @else {
      <button
        synFocusVisible
        type="button"
        class="syn-link syn-link--button"
        [class]="linkClass()"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel() || label() || null"
        (click)="onActivate($event)"
      >
        @if (label()) {
          {{ label() }}
        } @else {
          <ng-content />
        }
      </button>
    }
  `,
  styleUrl: './link.scss',
})
export class LinkComponent {
  readonly config = input<Partial<LinkConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<LinkConfig>(sanitizeLinkConfig),
  });
  readonly hrefInput = input<string | undefined>(undefined, { alias: 'href' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly toneInput = input<LinkTone | undefined>(undefined, { alias: 'tone' });
  readonly underlineInput = input<boolean | undefined>(undefined, { alias: 'underline' });
  readonly targetInput = input<string | undefined>(undefined, { alias: 'target' });
  readonly relInput = input<string | undefined>(undefined, { alias: 'rel' });
  readonly disabledInput = input<boolean | undefined>(undefined, { alias: 'disabled' });

  readonly href = computed(() =>
    resolveConfigValue(this.hrefInput(), this.config()?.href, ''),
  );
  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, ''),
  );
  readonly tone = computed(() =>
    resolveConfigValue(this.toneInput(), this.config()?.tone, 'brand'),
  );
  readonly underline = computed(() =>
    resolveConfigValue(this.underlineInput(), this.config()?.underline, true),
  );
  readonly target = computed(() =>
    resolveConfigValue(this.targetInput(), this.config()?.target, ''),
  );
  readonly rel = computed(() =>
    resolveConfigValue(this.relInput(), this.config()?.rel, ''),
  );
  readonly disabled = computed(() =>
    resolveConfigValue(this.disabledInput(), this.config()?.disabled, false),
  );

  readonly activated = output<MouseEvent>();

  readonly resolvedRel = computed(() => {
    if (this.rel()) {
      return this.rel();
    }

    return this.target() === '_blank' ? 'noopener noreferrer' : '';
  });

  readonly linkClass = computed(() =>
    classNames(
      'syn-link',
      `syn-link--${this.tone()}`,
      this.underline() && 'syn-link--underline',
      this.disabled() && 'syn-link--disabled',
    ),
  );

  onActivate(event: MouseEvent): void {
    if (this.disabled()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.activated.emit(event);
  }
}
