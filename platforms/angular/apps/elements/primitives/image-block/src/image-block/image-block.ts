import type { ImageBlockElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

function sanitizeImageBlockConfig(value: Partial<ImageBlockElementConfig>): Partial<ImageBlockElementConfig> {
  return omitUndefinedProperties<Partial<ImageBlockElementConfig>>({
    src: coerceTrimmedStringInput(value.src),
    alt: coerceTrimmedStringInput(value.alt),
    caption: coerceTrimmedStringInput(value.caption),
    aspectRatio: coerceTrimmedStringInput(value.aspectRatio),
    loading: coerceTrimmedStringInput(value.loading),
  });
}

@Component({
  selector: 'sg-image-block',
  imports: [],
  templateUrl: './image-block.html',
  styleUrl: './image-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-image-block' },
})
export class ImageBlockComponent {
  readonly config = input<Partial<ImageBlockElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<ImageBlockElementConfig>>(sanitizeImageBlockConfig),
  });
  readonly srcInput = input<string | undefined>(undefined, { alias: 'src' });
  readonly altInput = input<string | undefined>(undefined, { alias: 'alt' });
  readonly captionInput = input<string | undefined>(undefined, { alias: 'caption' });
  readonly aspectRatioInput = input<string | undefined>(undefined, { alias: 'aspectRatio' });
  readonly loadingInput = input<string | undefined>(undefined, { alias: 'loading' });

  readonly src = computed(() =>
    resolveConfigValue(this.srcInput(), this.config()?.src, ''),
  );
  readonly alt = computed(() =>
    resolveConfigValue(this.altInput(), this.config()?.alt, ''),
  );
  readonly caption = computed(() => resolveConfigValue(this.captionInput()?.trim(), this.config()?.caption, ''));
  readonly aspectRatio = computed(() => resolveConfigValue(this.aspectRatioInput()?.trim(), this.config()?.aspectRatio, 'auto'));
  readonly loading = computed(() => resolveConfigValue(this.loadingInput()?.trim(), this.config()?.loading, 'lazy'));

  readonly hasCaption = computed(() => !!this.caption());
}
