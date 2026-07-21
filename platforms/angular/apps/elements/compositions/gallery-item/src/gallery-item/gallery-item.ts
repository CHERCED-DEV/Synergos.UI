import type { GalleryItemElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

function sanitizeGalleryItemConfig(
  value: Partial<GalleryItemElementConfig>,
): Partial<GalleryItemElementConfig> {
  return omitUndefinedProperties<Partial<GalleryItemElementConfig>>({
    src: coerceTrimmedStringInput(value.src),
    alt: coerceTrimmedStringInput(value.alt),
    caption: coerceTrimmedStringInput(value.caption),
    aspectRatio: coerceTrimmedStringInput(value.aspectRatio),
  });
}

@Component({
  selector: 'sg-gallery-item',
  templateUrl: './gallery-item.html',
  styleUrl: './gallery-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-gallery-item' },
})
export class GalleryItemElementComponent {
  readonly config = input<Partial<GalleryItemElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<Partial<GalleryItemElementConfig>>(sanitizeGalleryItemConfig),
  });
  readonly srcInput = input<string | undefined>(undefined, { alias: 'src' });
  readonly altInput = input<string | undefined>(undefined, { alias: 'alt' });
  readonly captionInput = input<string | undefined>(undefined, { alias: 'caption' });
  readonly aspectRatioInput = input<string | undefined>(undefined, { alias: 'aspectRatio' });

  readonly src = computed(() =>
    resolveConfigValue(this.srcInput(), this.config()?.src, ''),
  );
  readonly alt = computed(() =>
    resolveConfigValue(this.altInput(), this.config()?.alt, ''),
  );
  readonly caption = computed(() =>
    resolveConfigValue(this.captionInput(), this.config()?.caption, ''),
  );
  readonly aspectRatio = computed(() =>
    resolveConfigValue(this.aspectRatioInput()?.trim(), this.config()?.aspectRatio, '4 / 3'),
  );
  readonly hasCaption = computed(() => this.caption().trim().length > 0);
  readonly resolvedAlt = computed(() => this.alt().trim() || this.caption().trim() || 'Gallery item');
}
