import type { GalleryItemElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

@Component({
  selector: 'sg-gallery-item',
  templateUrl: './gallery-item.html',
  styleUrl: './gallery-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-gallery-item' },
})
export class GalleryItemElementComponent {
  readonly configInput = input<Partial<GalleryItemElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<GalleryItemElementConfig>,
  });
  readonly srcInput = input<string | undefined>(undefined, { alias: 'src' });
  readonly altInput = input<string | undefined>(undefined, { alias: 'alt' });
  readonly captionInput = input<string | undefined>(undefined, { alias: 'caption' });
  readonly aspectRatioInput = input<string | undefined>(undefined, { alias: 'aspectRatio' });

  readonly src = computed(() =>
    resolveConfigValue(this.srcInput(), this.configInput()?.src, ''),
  );
  readonly alt = computed(() =>
    resolveConfigValue(this.altInput(), this.configInput()?.alt, ''),
  );
  readonly caption = computed(() =>
    resolveConfigValue(this.captionInput(), this.configInput()?.caption, ''),
  );
  readonly aspectRatio = computed(() => this.aspectRatioInput()?.trim() || '4 / 3');
  readonly hasCaption = computed(() => this.caption().trim().length > 0);
  readonly resolvedAlt = computed(() => this.alt().trim() || this.caption().trim() || 'Gallery item');
}
