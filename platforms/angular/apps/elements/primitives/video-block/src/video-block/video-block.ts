import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

export interface VideoBlockConfig {
  readonly src?: string;
  readonly title?: string;
  readonly poster?: string;
  readonly controls?: boolean;
  readonly autoplay?: boolean;
  readonly muted?: boolean;
  readonly loop?: boolean;
}

@Component({
  selector: 'sg-video-block',
  templateUrl: './video-block.html',
  styleUrl: './video-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-video-block' },
})
export class VideoBlockComponent {
  readonly configInput = input<Partial<VideoBlockConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<VideoBlockConfig>,
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
  readonly poster = computed(() =>
    resolveConfigValue(this.posterInput(), this.configInput()?.poster, ''),
  );
  readonly controls = computed(() =>
    resolveConfigValue(this.controlsInput(), this.configInput()?.controls, true),
  );
  readonly autoplay = computed(() =>
    resolveConfigValue(this.autoplayInput(), this.configInput()?.autoplay, false),
  );
  readonly muted = computed(() =>
    resolveConfigValue(this.mutedInput(), this.configInput()?.muted, false),
  );
  readonly loop = computed(() =>
    resolveConfigValue(this.loopInput(), this.configInput()?.loop, false),
  );
  readonly hasTitle = computed(() => this.title().trim().length > 0);
}
