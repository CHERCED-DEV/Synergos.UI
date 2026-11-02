import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import {
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/vitals-core/inputs';

/** `plain`: sin cromo (ni relleno, ni borde, ni fondo): una superficie clicable —una imagen, una fila— con el foco y el área táctil del botón. */
type ButtonVariant = 'solid' | 'outline' | 'ghost' | 'danger' | 'gradient' | 'plain';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonConfig {
  readonly label?: string;
  readonly ariaLabel?: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly type?: 'button' | 'submit' | 'reset';
  readonly disabled?: boolean;
  readonly loading?: boolean;
  /**
   * Announced to screen readers while `loading` is true, and — for users with
   * `prefers-reduced-motion` — painted inside the button in place of the spinner.
   * Keep it SHORT: it renders inside the footprint the label already reserved, so
   * the button never resizes; anything longer than that footprint gets clipped.
   */
  readonly loadingLabel?: string;
  /** Takes the full width of its container (a form's main action, a card's footer). */
  readonly block?: boolean;
  /**
   * Renders an `<a>` with the button's look: a call to action that navigates (sign in, go to the cart). It has no
   * `type` and no loading state; `disabled` drops the `href` and announces `aria-disabled`.
   */
  readonly href?: string;
}

function sanitizeButtonConfig(value: Partial<ButtonConfig>): Partial<ButtonConfig> {
  return omitUndefinedProperties<ButtonConfig>({
    label: coerceTrimmedStringInput(value.label),
    ariaLabel: coerceTrimmedStringInput(value.ariaLabel),
    variant: coerceStringEnumInput(value.variant, ['solid', 'outline', 'ghost', 'danger', 'gradient', 'plain'] as const),
    size: coerceStringEnumInput(value.size, ['sm', 'md', 'lg'] as const),
    type: coerceStringEnumInput(value.type, ['button', 'submit', 'reset'] as const),
    disabled: coerceOptionalBooleanInput(value.disabled),
    loading: coerceOptionalBooleanInput(value.loading),
    loadingLabel: coerceTrimmedStringInput(value.loadingLabel),
    block: coerceOptionalBooleanInput(value.block),
    href: coerceTrimmedStringInput(value.href),
  });
}

@Component({
  selector: 'syn-button',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.syn-button-host--block]': 'block()' },
  template: `
    <!-- One projection for both shapes: a second <ng-content> would only get the content once. -->
    <ng-template #contenido>
      <span class="syn-button__label">
        @if (label()) {
          {{ label() }}
        } @else {
          <ng-content />
        }
      </span>
    </ng-template>

    @if (href()) {
      <a
        [class]="classes()"
        [attr.href]="disabled() ? null : href()"
        [attr.aria-disabled]="disabled() ? 'true' : null"
        [attr.aria-current]="current() ? 'page' : null"
        [attr.aria-label]="ariaLabel() || label() || null"
        (click)="onClick($event)"
      >
        <ng-container [ngTemplateOutlet]="contenido" />
      </a>
    } @else {
      <button
        [class]="classes()"
        [type]="type()"
        [disabled]="disabled()"
        [attr.aria-disabled]="loading() ? 'true' : null"
        [attr.aria-busy]="loading() ? 'true' : null"
        [attr.aria-pressed]="selected() ?? null"
        [attr.aria-expanded]="expanded() ?? null"
        [attr.aria-controls]="controls() || null"
        [attr.aria-current]="current() ? 'page' : null"
        [attr.aria-label]="ariaLabel() || label() || null"
        (click)="onClick($event)"
      >
        <ng-container [ngTemplateOutlet]="contenido" />
        @if (loading()) {
          <!--
            Visual-only echo of the busy state for users with prefers-reduced-motion,
            where the spinner is suppressed (see button.scss). aria-hidden because the
            announcement is the live region below — without it this text would join the
            button's accessible name whenever the name comes from projected content.
          -->
          <span class="syn-button__busy-text" aria-hidden="true">{{ loadingLabel() }}</span>
        }
      </button>
    }
    <!--
      A spinner is invisible to a screen reader, so aria-busy alone would leave the
      user with silence. This region is rendered ALWAYS (empty at rest) and only its
      text changes — a live region created at the same time as its content is
      routinely missed by screen readers. It sits OUTSIDE the button so it can never
      leak into the button's accessible name, and outside the @if of the two shapes so
      it exists from the first render (the link shape never fills it: it never loads).
    -->
    <span class="syn-button__status" role="status" aria-live="polite" aria-atomic="true">{{
      statusMessage()
    }}</span>
  `,
  styleUrl: './button.scss',
})
export class ButtonComponent {
  readonly config = input<Partial<ButtonConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ButtonConfig>(sanitizeButtonConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly ariaLabelInput = input<string | undefined>(undefined, { alias: 'ariaLabel' });
  readonly variantInput = input<ButtonVariant | undefined>(undefined, { alias: 'variant' });
  readonly sizeInput = input<ButtonSize | undefined>(undefined, { alias: 'size' });
  readonly typeInput = input<'button' | 'submit' | 'reset' | undefined>(undefined, {
    alias: 'type',
  });
  readonly disabledInput = input<boolean | undefined>(undefined, { alias: 'disabled' });
  readonly loadingInput = input<boolean | undefined>(undefined, { alias: 'loading' });
  readonly loadingLabelInput = input<string | undefined>(undefined, { alias: 'loadingLabel' });

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, ''),
  );
  readonly ariaLabel = computed(() =>
    resolveConfigValue(this.ariaLabelInput(), this.config()?.ariaLabel, ''),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'solid'),
  );
  readonly size = computed(() =>
    resolveConfigValue(this.sizeInput(), this.config()?.size, 'md'),
  );
  readonly type = computed(() =>
    resolveConfigValue(this.typeInput(), this.config()?.type, 'button'),
  );
  readonly disabled = computed(() =>
    resolveConfigValue(this.disabledInput(), this.config()?.disabled, false),
  );
  readonly loading = computed(() =>
    resolveConfigValue(this.loadingInput(), this.config()?.loading, false),
  );
  readonly loadingLabel = computed(() =>
    resolveConfigValue(this.loadingLabelInput(), this.config()?.loadingLabel, 'Loading'),
  );
  readonly blockInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'block',
    transform: (value: unknown) => (value === undefined ? undefined : booleanAttribute(value)),
  });
  readonly hrefInput = input<string | undefined>(undefined, { alias: 'href' });
  readonly block = computed(() => resolveConfigValue(this.blockInput(), this.config()?.block, false));
  readonly href = computed(() => resolveConfigValue(this.hrefInput(), this.config()?.href, ''));

  /**
   * A toggle's state (a favourite, a filter chip, a variant): `aria-pressed` and the selected look. Left undefined, the
   * button is not a toggle and announces nothing.
   */
  readonly selected = input<boolean | undefined>(undefined);
  /** For a button that opens a panel (a cart drawer, a menu): `aria-expanded` plus the panel's id in `controls`. */
  readonly expanded = input<boolean | undefined>(undefined);
  readonly controls = input('');
  /** The current place in a navigation (`aria-current="page"`), with its look. */
  readonly current = input(false, { transform: booleanAttribute });
  /**
   * Where the content sits: centred (the default) or at the start — an item of a vertical navigation rail, or a trigger
   * that reads like a field («¿Qué estás pensando?») (012-blogs-social, T009).
   */
  readonly align = input<'center' | 'start'>('center');

  readonly classes = computed(() =>
    classNames(
      'syn-button',
      `syn-button--${this.variant()}`,
      `syn-button--${this.size()}`,
      this.loading() && !this.href() && 'syn-button--loading',
      this.block() && 'syn-button--block',
      this.selected() && 'syn-button--selected',
      this.current() && 'syn-button--current',
      this.align() === 'start' && 'syn-button--start',
    ),
  );

  /** Empty at rest so the live region only ever announces the transition INTO loading. */
  readonly statusMessage = computed(() => (this.loading() && !this.href() ? this.loadingLabel() : ''));

  readonly pressed = output<MouseEvent>();

  onClick(event: MouseEvent): void {
    if (this.disabled()) {
      event.preventDefault();
      return;
    }

    // Loading blocks the press through `aria-disabled` + this guard, NOT through the
    // native `disabled` attribute. A disabled button is removed from the tab order and
    // drops focus to <body>: a user who pressed with the keyboard would lose their
    // place mid-operation and the screen reader would go silent exactly when the
    // status region is trying to speak. aria-disabled keeps the button focused and
    // announced — but it also keeps it clickable, so the click must be stopped here,
    // including its propagation (an ancestor handler must not act on an inert press).
    if (this.loading()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.pressed.emit(event);
  }
}
