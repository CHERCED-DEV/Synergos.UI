import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { RatingStarsProps } from '@synergos/contracts';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * <synergos-rating-stars>: a star-rating control with two modes:
 *  - readonly: presents an average score as a row of stars (with optional
 *    half-star precision) plus an accessible label — used in product/listing
 *    cards and testimonials.
 *  - interactive: lets a visitor pick a whole-star rating with the mouse or
 *    keyboard (radiogroup semantics, arrow keys, Home/End). Selecting a value
 *    emits a `ratingchange` CustomEvent carrying the chosen value.
 *
 * El `config` que manda el CMS tiene la forma de `RatingStarsProps`, GENERADO del record C#
 * (ADR 0135): `value` y `max` como números y `label`. Esta cabecera decía «every CMS property
 * is a TypeScript input with the same alias», y era falso: la vista mandaba `valueNow`,
 * `maxStars` y `ariaLabel`, y el editor ponía un 4 y se leía «0 de 5 estrellas» (D1).
 * `readonly`, `allowHalf` y `showValue` no los autora el editor: son atributos del elemento,
 * que ganan sobre el `config`, que gana sobre los defaults (`resolveConfigValue`).
 */

interface RatingStar {
  /** 1-based position of this star in the row. */
  readonly position: number;
  /** Fill fraction for the readonly visual: 0, 0.5 or 1. */
  readonly fill: number;
}

const DEFAULT_MAX = 5;
const MAX_STARS_CAP = 10;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/** Coerce arbitrary input to a finite number, or null when unparseable. */
export function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Round to the nearest 0.5 step (half-star precision). */
export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * Build the row of stars for a given value/max, honoring half precision.
 * Pure so it can be unit-tested in isolation.
 */
export function buildStars(value: number, max: number, allowHalf: boolean): readonly RatingStar[] {
  const safeValue = clampNumber(allowHalf ? roundToHalf(value) : Math.round(value), 0, max);
  return Array.from({ length: max }, (_, index): RatingStar => {
    const position = index + 1;
    const delta = safeValue - index;
    let fill = 0;
    if (delta >= 1) {
      fill = 1;
    } else if (delta >= 0.5 && allowHalf) {
      fill = 0.5;
    } else if (delta >= 0.5 && !allowHalf) {
      fill = 1;
    }
    return { position, fill };
  });
}

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeRatingStarsConfig(value: Partial<RatingStarsProps>): Partial<RatingStarsProps> {
  return omitUndefinedProperties<RatingStarsProps>({
    value: readNumber(value.value) ?? undefined,
    max: readNumber(value.max) ?? undefined,
    label: coerceTrimmedStringInput(value.label),
  });
}

@Component({
  selector: 'sg-rating-stars',
  standalone: true,
  templateUrl: './rating-stars.html',
  styleUrl: './rating-stars.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-rating-stars' },
})
export class RatingStarsElementComponent {
  readonly config = input<Partial<RatingStarsProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<RatingStarsProps>(sanitizeRatingStarsConfig),
  });
  readonly valueInput = input<string | number | undefined>(undefined, { alias: 'value' });
  readonly maxInput = input<string | number | undefined>(undefined, { alias: 'max' });
  readonly readonlyInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'readonly',
    transform: coerceOptionalBooleanInput,
  });
  readonly allowHalfInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'allowHalf',
    transform: coerceOptionalBooleanInput,
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly showValueInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'showValue',
    transform: coerceOptionalBooleanInput,
  });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `ratingchange` CustomEvent. */
  readonly ratingchange = output<number>();

  readonly max = computed(() => {
    const resolved = resolveConfigValue(
      readNumber(this.maxInput()) ?? undefined,
      this.config()?.max,
      DEFAULT_MAX,
    );
    return clampNumber(Math.round(resolved), 1, MAX_STARS_CAP);
  });

  readonly readonly = computed(() => this.readonlyInput() ?? false);

  readonly allowHalf = computed(() => this.allowHalfInput() ?? false);

  readonly showValue = computed(() => this.showValueInput() ?? false);

  /** Value supplied via config/attributes (the readonly source of truth). */
  readonly configuredValue = computed(() =>
    clampNumber(
      resolveConfigValue(readNumber(this.valueInput()) ?? undefined, this.config()?.value, 0),
      0,
      this.max(),
    ),
  );

  /** Visitor-picked value in interactive mode (null until first pick). */
  readonly #pickedValue = signal<number | null>(null);
  readonly pickedValue = this.#pickedValue.asReadonly();

  /** Star index currently hovered/previewed in interactive mode (0 = none). */
  readonly #hoverValue = signal(0);

  /** The effective rating shown: hover preview > picked > configured. */
  readonly currentValue = computed(() => {
    if (!this.readonly()) {
      const hover = this.#hoverValue();
      if (hover > 0) {
        return hover;
      }
      const picked = this.#pickedValue();
      if (picked !== null) {
        return picked;
      }
    }
    return this.configuredValue();
  });

  readonly stars = computed<readonly RatingStar[]>(() =>
    buildStars(this.currentValue(), this.max(), this.readonly() && this.allowHalf()),
  );

  readonly label = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.labelInput()), this.config()?.label, ''),
  );

  /** Accessible description of the current state (e.g. "3 de 5 estrellas"). */
  readonly ariaLabel = computed(() => {
    const base = this.label();
    const stateText = `${this.formattedValue()} de ${this.max()} estrellas`;
    return base ? `${base}: ${stateText}` : stateText;
  });

  /** Human-readable value for the optional inline number. */
  readonly formattedValue = computed(() => {
    const value = this.currentValue();
    return Number.isInteger(value) ? `${value}` : value.toFixed(1);
  });

  /** The picked whole-star value used for radiogroup checked state. */
  readonly selectedPosition = computed(() => {
    const picked = this.#pickedValue();
    if (picked !== null) {
      return picked;
    }
    return Math.round(this.configuredValue());
  });

  pick(position: number): void {
    if (this.readonly()) {
      return;
    }
    const clamped = clampNumber(position, 0, this.max());
    this.#pickedValue.set(clamped);
    this.#hoverValue.set(0);
    this.ratingchange.emit(clamped);
  }

  preview(position: number): void {
    if (this.readonly()) {
      return;
    }
    this.#hoverValue.set(clampNumber(position, 0, this.max()));
  }

  clearPreview(): void {
    this.#hoverValue.set(0);
  }

  isChecked(position: number): boolean {
    return position === this.selectedPosition();
  }

  /** Roving tabindex target: the checked star, or the first when none. */
  isFocusTarget(position: number): boolean {
    const selected = this.selectedPosition();
    return selected > 0 ? position === selected : position === 1;
  }

  onStarKeydown(event: KeyboardEvent, position: number): void {
    if (this.readonly()) {
      return;
    }

    const max = this.max();
    const current = this.selectedPosition() || position;
    const handlers: Record<string, () => void> = {
      ArrowRight: () => this.pickAndFocus(Math.min(current + 1, max)),
      ArrowUp: () => this.pickAndFocus(Math.min(current + 1, max)),
      ArrowLeft: () => this.pickAndFocus(Math.max(current - 1, 1)),
      ArrowDown: () => this.pickAndFocus(Math.max(current - 1, 1)),
      Home: () => this.pickAndFocus(1),
      End: () => this.pickAndFocus(max),
      Enter: () => this.pick(position),
      ' ': () => this.pick(position),
      Backspace: () => this.pickAndFocus(0),
      Delete: () => this.pickAndFocus(0),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  private pickAndFocus(position: number): void {
    this.pick(position);
    if (position < 1) {
      return;
    }
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const host = document.querySelector('sg-rating-stars, synergos-rating-stars');
      const root = host?.shadowRoot ?? document;
      const cell = (root as ParentNode).querySelector<HTMLElement>(
        `[data-position="${position}"]`,
      );
      cell?.focus();
    });
  }
}
