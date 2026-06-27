import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynCopyButton</c>.
 *
 * A copy-to-clipboard button: it copies `copyText` to the system clipboard
 * and surfaces a transient "copiado" confirmation announced via an
 * `aria-live` region. Built as a primitive reusable across verticals
 * (share links, coupon codes, API keys, snippets).
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 * Selecting copy emits a `syncopy` CustomEvent carrying the copied text and
 * whether the clipboard write succeeded.
 */
export interface CopyButtonRuntimeConfig {
  readonly copyText?: string;
  readonly buttonLabel?: string;
  readonly feedbackLabel?: string;
  readonly errorLabel?: string;
  readonly resetDelay?: number;
}

/** Emitted on the `syncopy` CustomEvent and the typed Angular output. */
export interface CopyButtonCopyDetail {
  readonly text: string;
  readonly success: boolean;
}

type CopyState = 'idle' | 'copied' | 'error';

const DEFAULT_BUTTON_LABEL = 'Copiar';
const DEFAULT_FEEDBACK_LABEL = 'Copiado';
const DEFAULT_ERROR_LABEL = 'No se pudo copiar';
const DEFAULT_RESET_DELAY = 2000;
const MIN_RESET_DELAY = 500;

function sanitizeCopyButtonConfig(
  value: Partial<CopyButtonRuntimeConfig>,
): CopyButtonRuntimeConfig {
  return omitUndefinedProperties<CopyButtonRuntimeConfig>({
    copyText: coerceTrimmedStringInput(value.copyText),
    buttonLabel: coerceTrimmedStringInput(value.buttonLabel),
    feedbackLabel: coerceTrimmedStringInput(value.feedbackLabel),
    errorLabel: coerceTrimmedStringInput(value.errorLabel),
    resetDelay: coerceOptionalNumberInput(value.resetDelay),
  });
}

@Component({
  selector: 'sg-copy-button',
  standalone: true,
  templateUrl: './copy-button.html',
  styleUrl: './copy-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-copy-button' },
})
export class CopyButtonElementComponent {
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<CopyButtonRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CopyButtonRuntimeConfig>(sanitizeCopyButtonConfig),
  });
  readonly copyTextInput = input<string | undefined>(undefined, { alias: 'copyText' });
  readonly buttonLabelInput = input<string | undefined>(undefined, { alias: 'buttonLabel' });
  readonly feedbackLabelInput = input<string | undefined>(undefined, { alias: 'feedbackLabel' });
  readonly errorLabelInput = input<string | undefined>(undefined, { alias: 'errorLabel' });
  readonly resetDelayInput = input<number | undefined, unknown>(undefined, {
    alias: 'resetDelay',
    transform: coerceOptionalNumberInput,
  });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `syncopy` CustomEvent. */
  readonly syncopy = output<CopyButtonCopyDetail>();

  readonly copyText = computed(() =>
    resolveConfigValue(this.copyTextInput(), this.config()?.copyText, ''),
  );
  readonly buttonLabel = computed(() =>
    resolveConfigValue(this.buttonLabelInput(), this.config()?.buttonLabel, DEFAULT_BUTTON_LABEL),
  );
  readonly feedbackLabel = computed(() =>
    resolveConfigValue(
      this.feedbackLabelInput(),
      this.config()?.feedbackLabel,
      DEFAULT_FEEDBACK_LABEL,
    ),
  );
  readonly errorLabel = computed(() =>
    resolveConfigValue(this.errorLabelInput(), this.config()?.errorLabel, DEFAULT_ERROR_LABEL),
  );
  readonly resetDelay = computed(() => {
    const resolved = resolveConfigValue(
      this.resetDelayInput(),
      this.config()?.resetDelay,
      DEFAULT_RESET_DELAY,
    );
    return Number.isFinite(resolved) && resolved >= MIN_RESET_DELAY ? resolved : DEFAULT_RESET_DELAY;
  });

  /** Disabled when there is nothing to copy. */
  readonly disabled = computed(() => this.copyText().length === 0);

  readonly #state = signal<CopyState>('idle');
  readonly state = this.#state.asReadonly();

  readonly isCopied = computed(() => this.#state() === 'copied');
  readonly isError = computed(() => this.#state() === 'error');

  /** Visible label on the trigger reflects the transient state. */
  readonly currentLabel = computed(() => {
    switch (this.#state()) {
      case 'copied':
        return this.feedbackLabel();
      case 'error':
        return this.errorLabel();
      default:
        return this.buttonLabel();
    }
  });

  /** Text announced by the polite aria-live region; empty while idle. */
  readonly liveMessage = computed(() => {
    switch (this.#state()) {
      case 'copied':
        return this.feedbackLabel();
      case 'error':
        return this.errorLabel();
      default:
        return '';
    }
  });

  #resetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.#destroyRef.onDestroy(() => this.#clearTimer());
  }

  async copy(): Promise<void> {
    if (this.disabled()) {
      return;
    }

    const text = this.copyText();
    const success = await this.#writeToClipboard(text);

    this.#state.set(success ? 'copied' : 'error');
    this.syncopy.emit({ text, success });
    this.#scheduleReset();
  }

  async #writeToClipboard(text: string): Promise<boolean> {
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      try {
        await clipboard.writeText(text);
        return true;
      } catch {
        return this.#writeWithFallback(text);
      }
    }

    return this.#writeWithFallback(text);
  }

  /** Legacy fallback for insecure contexts without the async clipboard API. */
  #writeWithFallback(text: string): boolean {
    const doc = globalThis.document;
    if (!doc?.body || typeof doc.execCommand !== 'function') {
      return false;
    }

    const textarea = doc.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    doc.body.appendChild(textarea);
    textarea.select();

    let ok = false;
    try {
      ok = doc.execCommand('copy');
    } catch {
      ok = false;
    } finally {
      doc.body.removeChild(textarea);
    }

    return ok;
  }

  #scheduleReset(): void {
    this.#clearTimer();
    this.#resetTimer = setTimeout(() => {
      this.#state.set('idle');
      this.#resetTimer = null;
    }, this.resetDelay());
  }

  #clearTimer(): void {
    if (this.#resetTimer !== null) {
      clearTimeout(this.#resetTimer);
      this.#resetTimer = null;
    }
  }
}
