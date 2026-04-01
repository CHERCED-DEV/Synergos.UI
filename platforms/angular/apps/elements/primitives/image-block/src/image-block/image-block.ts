import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

export interface ImageBlockConfig {
  readonly src?: string;
  readonly alt?: string;
  readonly caption?: string;
  readonly aspectRatio?: string;
  readonly loading?: string;
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
  readonly configInput = input<Partial<ImageBlockConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<ImageBlockConfig>,
  });
  readonly srcInput = input<string | undefined>(undefined, { alias: 'src' });
  readonly altInput = input<string | undefined>(undefined, { alias: 'alt' });
  readonly captionInput = input<string | undefined>(undefined, { alias: 'caption' });
  readonly aspectRatioInput = input<string | undefined>(undefined, { alias: 'aspectRatio' });
  readonly loadingInput = input<string | undefined>(undefined, { alias: 'loading' });

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
    resolveConfigValue(this.aspectRatioInput(), this.configInput()?.aspectRatio, 'auto'),
  );
  readonly loading = computed(() =>
    resolveConfigValue(this.loadingInput(), this.configInput()?.loading, 'lazy'),
  );

  readonly hasCaption = computed(() => !!this.caption());
}
