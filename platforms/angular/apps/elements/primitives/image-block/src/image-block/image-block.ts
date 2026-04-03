import type { ImageBlockElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

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
    transform: coerceConfigInput<ImageBlockElementConfig>,
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
  readonly caption = computed(() => this.captionInput()?.trim() || '');
  readonly aspectRatio = computed(() => this.aspectRatioInput()?.trim() || 'auto');
  readonly loading = computed(() => this.loadingInput()?.trim() || 'lazy');

  readonly hasCaption = computed(() => !!this.caption());
}
