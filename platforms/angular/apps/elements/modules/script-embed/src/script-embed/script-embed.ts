import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { ScriptService } from '@synergos/core';
import {
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

type ScriptTarget = 'head' | 'body';

export interface ScriptEmbedConfig {
  readonly src?: string;
  readonly type?: string;
  readonly inlineScript?: string;
  readonly target?: ScriptTarget;
  readonly async?: boolean;
  readonly defer?: boolean;
}

function resolveTarget(value: string | undefined): ScriptTarget {
  return value === 'head' ? 'head' : 'body';
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

  readonly configInput = input<Partial<ScriptEmbedConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<ScriptEmbedConfig>,
  });
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

  readonly src = computed(() =>
    resolveConfigValue(this.srcInput(), this.configInput()?.src, ''),
  );
  readonly type = computed(() =>
    resolveConfigValue(this.typeInput(), this.configInput()?.type, 'text/javascript'),
  );
  readonly inlineScript = computed(() =>
    resolveConfigValue(this.inlineScriptInput(), this.configInput()?.inlineScript, ''),
  );
  readonly target = computed<ScriptTarget>(() =>
    resolveTarget(resolveConfigValue(this.targetInput(), this.configInput()?.target, 'body')),
  );
  readonly async = computed(() =>
    resolveConfigValue(this.asyncInput(), this.configInput()?.async, false),
  );
  readonly defer = computed(() =>
    resolveConfigValue(this.deferInput(), this.configInput()?.defer, true),
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
