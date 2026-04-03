import type { VideoBlockElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

@Component({
  selector: 'sg-video-block',
  templateUrl: './video-block.html',
  styleUrl: './video-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-video-block' },
})
export class VideoBlockComponent {
  readonly configInput = input<Partial<VideoBlockElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<VideoBlockElementConfig>,
  });
  readonly srcInput = input<string | undefined>(undefined, { alias: 'src' });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly posterInput = input<string | undefined>(undefined, { alias: 'poster' });
  readonly controlsInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'controls',
    transform: coerceOptionalBooleanInput,
  });
  readonly autoplayInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'autoplay',
    transform: coerceOptionalBooleanInput,
  });
  readonly mutedInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'muted',
    transform: coerceOptionalBooleanInput,
  });
  readonly loopInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'loop',
    transform: coerceOptionalBooleanInput,
  });

  readonly src = computed(() =>
    resolveConfigValue(this.srcInput(), this.configInput()?.src, ''),
  );
  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.configInput()?.title, ''),
  );
  readonly poster = computed(() => this.posterInput()?.trim() || '');
  readonly controls = computed(() => this.controlsInput() ?? true);
  readonly autoplay = computed(() => this.autoplayInput() ?? false);
  readonly muted = computed(() => this.mutedInput() ?? false);
  readonly loop = computed(() => this.loopInput() ?? false);
  readonly hasTitle = computed(() => this.title().trim().length > 0);
}
