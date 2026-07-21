import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceOptionalBooleanInput,
  coerceOptionalNumberInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynOtpInput</c>.
 *
 * A segmented one-time-code field: N single-character cells with smart paste
 * distribution, full keyboard navigation (arrows/Backspace/Home/End) and
 * ARIA. Built for login / 2FA / e-mail verification flows. The visitor types
 * one character per cell; focus advances automatically. Pasting a code spreads
 * it across the cells from the focused position. When every cell is filled a
 * `complete` CustomEvent fires with the assembled value; every edit fires a
 * `codechange` CustomEvent.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export type OtpInputMode = 'numeric' | 'alphanumeric';

export interface OtpInputRuntimeConfig {
  readonly label?: string;
  readonly length?: number;
  readonly mode?: OtpInputMode;
  readonly mask?: boolean;
  readonly autoSubmit?: boolean;
  readonly disabled?: boolean;
}

/** Emitted on the `codechange` CustomEvent and the typed Angular output. */
export interface OtpInputChangeDetail {
  readonly value: string;
  readonly complete: boolean;
}

/** Emitted on the `complete` CustomEvent when every cell is filled. */
export interface OtpInputCompleteDetail {
  readonly value: string;
}

interface OtpCell {
  readonly index: number;
  readonly value: string;
  readonly label: string;
}

const OTP_MODES: readonly OtpInputMode[] = ['numeric', 'alphanumeric'];

const DEFAULT_LENGTH = 6;
const MIN_LENGTH = 2;
const MAX_LENGTH = 12;
const DEFAULT_LABEL = 'Código de verificación';

const NUMERIC_CHAR = /[0-9]/;
const ALPHANUMERIC_CHAR = /[a-zA-Z0-9]/;

/** Clamp a requested cell count into the supported range. */
export function clampLength(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_LENGTH;
  }
  const rounded = Math.round(value);
  return Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, rounded));
}

/** Keep only the characters allowed by the active mode. */
export function sanitizeCode(raw: string, mode: OtpInputMode): string {
  const allowed = mode === 'numeric' ? NUMERIC_CHAR : ALPHANUMERIC_CHAR;
  let result = '';
  for (const char of raw) {
    if (allowed.test(char)) {
      result += mode === 'numeric' ? char : char.toUpperCase();
    }
  }
  return result;
}

function sanitizeOtpConfig(value: Partial<OtpInputRuntimeConfig>): OtpInputRuntimeConfig {
  return omitUndefinedProperties<OtpInputRuntimeConfig>({
    label: coerceTrimmedStringInput(value.label),
    length: coerceOptionalNumberInput(value.length),
    mode: coerceStringEnumInput<OtpInputMode>(value.mode, OTP_MODES),
    mask: coerceOptionalBooleanInput(value.mask),
    autoSubmit: coerceOptionalBooleanInput(value.autoSubmit),
    disabled: coerceOptionalBooleanInput(value.disabled),
  });
}

@Component({
  selector: 'sg-otp-input',
  standalone: true,
  templateUrl: './otp-input.html',
  styleUrl: './otp-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-otp-input' },
})
export class OtpInputElementComponent {
  readonly config = input<OtpInputRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<OtpInputRuntimeConfig>(sanitizeOtpConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly lengthInput = input<number | undefined, unknown>(undefined, {
    alias: 'length',
    transform: coerceOptionalNumberInput,
  });
  readonly modeInput = input<OtpInputMode | undefined, unknown>(undefined, {
    alias: 'mode',
    transform: (value: unknown) => coerceStringEnumInput<OtpInputMode>(value, OTP_MODES),
  });
  readonly maskInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'mask',
    transform: coerceOptionalBooleanInput,
  });
  readonly autoSubmitInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'autoSubmit',
    transform: coerceOptionalBooleanInput,
  });
  readonly disabledInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'disabled',
    transform: coerceOptionalBooleanInput,
  });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular outputs mirroring the native CustomEvents. */
  readonly codechange = output<OtpInputChangeDetail>();
  readonly complete = output<OtpInputCompleteDetail>();

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, DEFAULT_LABEL),
  );
  readonly length = computed(() =>
    clampLength(resolveConfigValue(this.lengthInput(), this.config()?.length, DEFAULT_LENGTH)),
  );
  readonly mode = computed<OtpInputMode>(() =>
    resolveConfigValue(this.modeInput(), this.config()?.mode, 'numeric'),
  );
  readonly mask = computed(() =>
    resolveConfigValue(this.maskInput(), this.config()?.mask, false),
  );
  readonly autoSubmit = computed(() =>
    resolveConfigValue(this.autoSubmitInput(), this.config()?.autoSubmit, true),
  );
  readonly disabled = computed(() =>
    resolveConfigValue(this.disabledInput(), this.config()?.disabled, false),
  );

  /** Per-cell characters; length tracks the configured cell count. */
  readonly #digits = signal<readonly string[]>(this.makeEmpty(DEFAULT_LENGTH));

  /** The cells rendered by the template. */
  readonly cells = computed<readonly OtpCell[]>(() => {
    const digits = this.#digits();
    const total = this.length();
    const label = this.label();
    return Array.from({ length: total }, (_, index) => ({
      index,
      value: digits[index] ?? '',
      label: `${label} — dígito ${index + 1} de ${total}`,
    }));
  });

  /** The assembled code, only as long as cells are contiguously filled. */
  readonly value = computed(() => {
    const digits = this.#digits();
    const total = this.length();
    let result = '';
    for (let index = 0; index < total; index++) {
      const char = digits[index];
      if (!char) {
        break;
      }
      result += char;
    }
    return result;
  });

  readonly isComplete = computed(() => this.value().length === this.length());

  /** Cell that should carry tabindex=0 (roving): first empty, else last. */
  readonly activeIndex = computed(() => {
    const digits = this.#digits();
    const total = this.length();
    for (let index = 0; index < total; index++) {
      if (!digits[index]) {
        return index;
      }
    }
    return total - 1;
  });

  /** Type used by the underlying inputs (drives soft keyboard + masking). */
  readonly inputType = computed(() => (this.mask() ? 'password' : 'text'));
  readonly inputMode = computed(() => (this.mode() === 'numeric' ? 'numeric' : 'text'));

  constructor() {
    // Re-shape the digit buffer whenever the configured length changes,
    // preserving already-entered characters that still fit.
    effect(() => {
      const total = this.length();
      const current = this.#digits();
      if (current.length === total) {
        return;
      }
      const next = this.makeEmpty(total);
      for (let index = 0; index < total; index++) {
        next[index] = current[index] ?? '';
      }
      this.#digits.set(next);
    });
  }

  /** Handle a value typed/inserted into a single cell. */
  onInput(event: Event, index: number): void {
    if (this.disabled()) {
      return;
    }
    const target = event.target as HTMLInputElement;
    const sanitized = sanitizeCode(target.value, this.mode());

    if (sanitized.length > 1) {
      // A multi-character insert (paste landing on an input) spreads forward.
      this.distribute(sanitized, index);
      target.value = this.#digits()[index] ?? '';
      return;
    }

    const char = sanitized.slice(-1);
    target.value = char;
    this.setDigit(index, char);

    if (char) {
      this.focusCell(Math.min(index + 1, this.length() - 1));
    }
  }

  /** Distribute a pasted code across the cells from the focused position. */
  onPaste(event: ClipboardEvent, index: number): void {
    if (this.disabled()) {
      return;
    }
    event.preventDefault();
    const text = event.clipboardData?.getData('text') ?? '';
    const sanitized = sanitizeCode(text, this.mode());
    if (!sanitized) {
      return;
    }
    this.distribute(sanitized, index);
  }

  /** Keyboard navigation + editing helpers. */
  onKeydown(event: KeyboardEvent, index: number): void {
    if (this.disabled()) {
      return;
    }
    const total = this.length();

    switch (event.key) {
      case 'Backspace': {
        event.preventDefault();
        if (this.#digits()[index]) {
          this.setDigit(index, '');
        } else if (index > 0) {
          this.setDigit(index - 1, '');
          this.focusCell(index - 1);
        }
        return;
      }
      case 'Delete': {
        event.preventDefault();
        this.setDigit(index, '');
        return;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        this.focusCell(Math.max(index - 1, 0));
        return;
      }
      case 'ArrowRight': {
        event.preventDefault();
        this.focusCell(Math.min(index + 1, total - 1));
        return;
      }
      case 'Home': {
        event.preventDefault();
        this.focusCell(0);
        return;
      }
      case 'End': {
        event.preventDefault();
        this.focusCell(total - 1);
        return;
      }
      default:
        return;
    }
  }

  /** Clear every cell and return focus to the first. */
  reset(): void {
    this.#digits.set(this.makeEmpty(this.length()));
    this.emitChange();
    this.focusCell(0);
  }

  trackCell(_index: number, cell: OtpCell): number {
    return cell.index;
  }

  private setDigit(index: number, char: string): void {
    const next = [...this.#digits()];
    next[index] = char;
    this.#digits.set(next);
    this.emitChange();
  }

  private distribute(code: string, startIndex: number): void {
    const total = this.length();
    const next = [...this.#digits()];
    let cursor = startIndex;
    for (const char of code) {
      if (cursor >= total) {
        break;
      }
      next[cursor] = char;
      cursor++;
    }
    this.#digits.set(next);
    this.emitChange();
    this.focusCell(Math.min(cursor, total - 1));
  }

  private emitChange(): void {
    const value = this.value();
    const complete = this.isComplete();
    this.codechange.emit({ value, complete });
    if (complete && this.autoSubmit()) {
      this.complete.emit({ value });
    }
  }

  private focusCell(index: number): void {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const host = document.querySelector('sg-otp-input, synergos-otp-input');
      const root = host?.shadowRoot ?? document;
      const cell = (root as ParentNode).querySelector<HTMLInputElement>(
        `[data-otp-cell="${index}"]`,
      );
      cell?.focus();
      cell?.select();
    });
  }

  private makeEmpty(length: number): string[] {
    return Array.from({ length }, () => '');
  }
}
