import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

export interface GalleryItemConfig {
  readonly src?: string;
  readonly alt?: string;
  readonly caption?: string;
  readonly aspectRatio?: string;
}

@Component({
  selector: 'sg-gallery-item',
  standalone: true,
  templateUrl: './gallery-item.html',
  styleUrl: './gallery-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-gallery-item' },
})
export class GalleryItemElementComponent {
  readonly configInput = input<Partial<GalleryItemConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<GalleryItemConfig>,
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
  readonly aspectRatio = computed(() =>
    resolveConfigValue(this.aspectRatioInput(), this.configInput()?.aspectRatio, '4 / 3'),
  );
  readonly hasCaption = computed(() => this.caption().trim().length > 0);
  readonly resolvedAlt = computed(() => this.alt().trim() || this.caption().trim() || 'Gallery item');
}
