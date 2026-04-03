import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import type { ScriptEmbedElementConfig } from '@synergos/contracts';
import { ScriptService } from '@synergos/core';
import {
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

type ScriptTarget = 'head' | 'body';

function resolveTarget(value: string | undefined): ScriptTarget {
  return value === 'head' ? 'head' : 'body';
}

function looksLikeScriptUrl(value: string): boolean {
  const trimmedValue = value.trim();
  return /^https?:\/\//u.test(trimmedValue)
    || trimmedValue.startsWith('//')
    || trimmedValue.startsWith('/')
    || /\.m?js(?:[?#].*)?$/iu.test(trimmedValue);
}

function resolveScriptMimeType(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue || trimmedValue === 'external' || trimmedValue === 'url') {
    return 'text/javascript';
  }

  return trimmedValue;
}

@Component({
  selector: 'sg-script-embed',
  templateUrl: './script-embed.html',
  styleUrl: './script-embed.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-script-embed' },
})
export class ScriptEmbedElementComponent {
  readonly #scriptService = inject(ScriptService);
  readonly #loaded = signal(false);

  readonly config = input<Partial<ScriptEmbedElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<ScriptEmbedElementConfig>,
  });
  readonly scriptTypeInput = input<string | undefined>(undefined, { alias: 'scriptType' });
  readonly contentInput = input<string | undefined>(undefined, { alias: 'content' });
  readonly srcInput = input<string | undefined>(undefined, { alias: 'src' });
  readonly typeInput = input<string | undefined>(undefined, { alias: 'type' });
  readonly inlineScriptInput = input<string | undefined>(undefined, { alias: 'inlineScript' });
  readonly targetInput = input<string | undefined>(undefined, { alias: 'target' });
  readonly asyncInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'async',
    transform: coerceOptionalBooleanInput,
  });
  readonly deferInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'defer',
    transform: coerceOptionalBooleanInput,
  });

  readonly scriptType = computed(() =>
    resolveConfigValue(
      this.scriptTypeInput(),
      this.config()?.scriptType,
      resolveConfigValue(this.typeInput(), undefined, 'text/javascript'),
    ),
  );
  readonly content = computed(() =>
    resolveConfigValue(
      this.contentInput(),
      this.config()?.content,
      resolveConfigValue(this.inlineScriptInput(), undefined, resolveConfigValue(this.srcInput(), undefined, '')),
    ),
  );
  readonly src = computed(() => {
    if (this.srcInput() !== undefined) {
      return this.srcInput()?.trim() ?? '';
    }

    const content = this.content().trim();
    return looksLikeScriptUrl(content) ? content : '';
  });
  readonly type = computed(() =>
    resolveScriptMimeType(this.scriptType()),
  );
  readonly inlineScript = computed(() => {
    if (this.inlineScriptInput() !== undefined) {
      return this.inlineScriptInput()?.trim() ?? '';
    }

    return this.src().trim() ? '' : this.content().trim();
  });
  readonly target = computed<ScriptTarget>(() =>
    resolveTarget(resolveConfigValue(this.targetInput(), undefined, 'body')),
  );
  readonly async = computed(() =>
    resolveConfigValue(this.asyncInput(), undefined, false),
  );
  readonly defer = computed(() =>
    resolveConfigValue(this.deferInput(), undefined, true),
  );
  readonly hasDefinition = computed(() => this.src().trim().length > 0 || this.inlineScript().trim().length > 0);

  constructor() {
    effect(() => {
      if (this.#loaded() || !this.hasDefinition()) {
        return;
      }

      this.#scriptService.addScript({
        id: this.src().trim().length > 0 ? undefined : 'synergos-inline-script-embed',
        src: this.src(),
        body: this.inlineScript(),
        async: this.async(),
        defer: this.defer(),
        target: this.target(),
        attributes: [{ name: 'type', value: this.type() }],
      });
      this.#loaded.set(true);
    });
  }
}
