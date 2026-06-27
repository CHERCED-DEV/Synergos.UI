import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynCodeBlock</c>.
 *
 * A monospace code block with a copy-to-clipboard button and optional line
 * numbering. Built for editorial / docs content where a snippet must be shown
 * verbatim and copied reliably. Copying emits a `codecopy` CustomEvent (and a
 * typed Angular output) carrying the copied text and the success flag.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface CodeBlockRuntimeConfig {
  readonly code?: string;
  readonly language?: string;
  readonly filename?: string;
  readonly showLineNumbers?: boolean;
  readonly copyLabel?: string;
  readonly copiedLabel?: string;
}

interface CodeLine {
  readonly number: number;
  readonly text: string;
}

/** Emitted on the `codecopy` CustomEvent and the typed Angular output. */
export interface CodeCopyDetail {
  readonly code: string;
  readonly success: boolean;
}

const DEFAULT_COPY_LABEL = 'Copiar';
const DEFAULT_COPIED_LABEL = 'Copiado';

/** Window the "Copiado" confirmation stays visible (ms). */
const COPIED_FEEDBACK_MS = 2000;

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

/**
 * Split raw code into line records. Preserves blank lines and trims a single
 * leading/trailing blank line (common when authoring multiline strings) so the
 * gutter stays tidy without mutating interior whitespace.
 */
export function splitCodeLines(value: unknown): readonly CodeLine[] {
  const raw = readString(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (raw.length === 0) {
    return [];
  }

  const lines = raw.split('\n');
  while (lines.length > 1 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 1 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  return lines.map((text, index) => ({ number: index + 1, text }));
}

function sanitizeCodeBlockConfig(value: Partial<CodeBlockRuntimeConfig>): CodeBlockRuntimeConfig {
  return omitUndefinedProperties<CodeBlockRuntimeConfig>({
    code: coerceTrimmedStringInput(value.code),
    language: coerceTrimmedStringInput(value.language),
    filename: coerceTrimmedStringInput(value.filename),
    showLineNumbers: coerceOptionalBooleanInput(value.showLineNumbers),
    copyLabel: coerceTrimmedStringInput(value.copyLabel),
    copiedLabel: coerceTrimmedStringInput(value.copiedLabel),
  });
}

@Component({
  selector: 'sg-code-block',
  standalone: true,
  templateUrl: './code-block.html',
  styleUrl: './code-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-code-block' },
})
export class CodeBlockElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<CodeBlockRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CodeBlockRuntimeConfig>(sanitizeCodeBlockConfig),
  });
  readonly codeInput = input<string | undefined>(undefined, { alias: 'code' });
  readonly languageInput = input<string | undefined>(undefined, { alias: 'language' });
  readonly filenameInput = input<string | undefined>(undefined, { alias: 'filename' });
  readonly showLineNumbersInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'showLineNumbers',
    transform: coerceOptionalBooleanInput,
  });
  readonly copyLabelInput = input<string | undefined>(undefined, { alias: 'copyLabel' });
  readonly copiedLabelInput = input<string | undefined>(undefined, { alias: 'copiedLabel' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `codecopy` CustomEvent. */
  readonly codecopy = output<CodeCopyDetail>();

  /** Raw code resolved from input JSON/string or config. */
  readonly code = computed(() =>
    readString(this.resolveSource(this.codeInput(), this.config()?.code)),
  );

  readonly language = computed(() =>
    resolveConfigValue(this.languageInput(), this.config()?.language, ''),
  );

  readonly filename = computed(() =>
    resolveConfigValue(this.filenameInput(), this.config()?.filename, ''),
  );

  readonly showLineNumbers = computed(() =>
    resolveConfigValue(this.showLineNumbersInput(), this.config()?.showLineNumbers, false),
  );

  readonly copyLabel = computed(() =>
    resolveConfigValue(this.copyLabelInput(), this.config()?.copyLabel, DEFAULT_COPY_LABEL),
  );

  readonly copiedLabel = computed(() =>
    resolveConfigValue(this.copiedLabelInput(), this.config()?.copiedLabel, DEFAULT_COPIED_LABEL),
  );

  readonly lines = computed<readonly CodeLine[]>(() => splitCodeLines(this.code()));

  readonly hasCode = computed(() => this.lines().length > 0);

  readonly lineCount = computed(() => this.lines().length);

  /** Header is rendered only when there is something to show in it. */
  readonly hasHeader = computed(
    () => this.filename().length > 0 || this.language().length > 0 || this.hasCode(),
  );

  /** True while the post-copy confirmation label is showing. */
  readonly #copied = signal(false);
  readonly copied = this.#copied.asReadonly();

  /** Label the copy button currently shows. */
  readonly copyButtonLabel = computed(() =>
    this.#copied() ? this.copiedLabel() : this.copyLabel(),
  );

  #copiedTimer: ReturnType<typeof setTimeout> | null = null;

  async copy(): Promise<void> {
    const text = this.code();
    if (!text) {
      return;
    }

    const success = await this.writeToClipboard(text);
    this.codecopy.emit({ code: text, success });

    if (success) {
      this.flagCopied();
    }
  }

  private flagCopied(): void {
    this.#copied.set(true);
    if (this.#copiedTimer !== null) {
      clearTimeout(this.#copiedTimer);
    }
    if (typeof setTimeout === 'function') {
      this.#copiedTimer = setTimeout(() => {
        this.#copied.set(false);
        this.#copiedTimer = null;
      }, COPIED_FEEDBACK_MS);
    }
  }

  private async writeToClipboard(text: string): Promise<boolean> {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (clipboard && typeof clipboard.writeText === 'function') {
      try {
        await clipboard.writeText(text);
        return true;
      } catch {
        return this.legacyCopy(text);
      }
    }

    return this.legacyCopy(text);
  }

  /** Fallback for browsers / contexts without the async clipboard API. */
  private legacyCopy(text: string): boolean {
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
      return false;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    let success = false;
    try {
      success = document.execCommand('copy');
    } catch {
      success = false;
    }

    document.body.removeChild(textarea);
    return success;
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      // Code may be a plain string (most common) or a JSON-encoded string.
      const parsed = this.#initialData.parseValue<unknown>(rawInput);
      return typeof parsed === 'string' ? parsed : rawInput;
    }
    return configValue;
  }
}
