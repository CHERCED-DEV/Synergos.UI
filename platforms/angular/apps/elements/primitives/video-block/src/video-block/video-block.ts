import type { VideoBlockElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

function sanitizeVideoBlockConfig(
  value: Partial<VideoBlockElementConfig>,
): Partial<VideoBlockElementConfig> {
  return omitUndefinedProperties<Partial<VideoBlockElementConfig>>({
    src: coerceTrimmedStringInput(value.src),
    title: coerceTrimmedStringInput(value.title),
    poster: coerceTrimmedStringInput(value.poster),
    controls: coerceOptionalBooleanInput(value.controls),
    autoplay: coerceOptionalBooleanInput(value.autoplay),
    muted: coerceOptionalBooleanInput(value.muted),
    loop: coerceOptionalBooleanInput(value.loop),
  });
}

@Component({
  selector: 'sg-video-block',
  templateUrl: './video-block.html',
  styleUrl: './video-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-video-block' },
})
export class VideoBlockComponent {
  readonly config = input<Partial<VideoBlockElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<VideoBlockElementConfig>>(sanitizeVideoBlockConfig),
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
    resolveConfigValue(this.srcInput(), this.config()?.src, ''),
  );
  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly poster = computed(() => resolveConfigValue(this.posterInput()?.trim(), this.config()?.poster, ''));
  readonly controls = computed(() => resolveConfigValue(this.controlsInput(), this.config()?.controls, true));
  readonly autoplay = computed(() => resolveConfigValue(this.autoplayInput(), this.config()?.autoplay, false));
  readonly muted = computed(() => resolveConfigValue(this.mutedInput(), this.config()?.muted, false));
  readonly loop = computed(() => resolveConfigValue(this.loopInput(), this.config()?.loop, false));
  readonly hasTitle = computed(() => this.title().trim().length > 0);
}
