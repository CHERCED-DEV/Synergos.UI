import type { IframeEmbedElementConfig } from '@synergos/contracts';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, input, viewChild } from '@angular/core';
import {
  coerceConfigInput,
  coerceOptionalBooleanInput,
  resolveConfigValue,
} from '@synergos/shared';

@Component({
  selector: 'sg-iframe-embed',
  templateUrl: './iframe-embed.html',
  styleUrl: './iframe-embed.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-iframe-embed' },
})
export class IframeEmbedElementComponent {
  readonly frameRef = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  readonly configInput = input<Partial<IframeEmbedElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<IframeEmbedElementConfig>,
  });
  readonly srcInput = input<string | undefined>(undefined, { alias: 'src' });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly loadingInput = input<string | undefined>(undefined, { alias: 'loading' });
  readonly allowFullscreenInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'allowFullscreen',
    transform: coerceOptionalBooleanInput,
  });
  readonly heightInput = input<string | undefined>(undefined, { alias: 'height' });

  readonly src = computed(() =>
    resolveConfigValue(this.srcInput(), this.configInput()?.src, ''),
  );
  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.configInput()?.title, ''),
  );
  readonly loading = computed(() => this.loadingInput()?.trim() || 'lazy');
  readonly allowFullscreen = computed(() =>
    this.allowFullscreenInput() ?? this.configInput()?.allowFullscreen ?? true,
  );
  readonly height = computed(() =>
    this.heightInput()?.trim() || this.configInput()?.height?.trim() || '480',
  );

  constructor() {
    effect(() => {
      const frame = this.frameRef();
      if (!frame) {
        return;
      }

      const src = this.src().trim();
      if (!src) {
        frame.nativeElement.removeAttribute('src');
        return;
      }

      frame.nativeElement.setAttribute('src', src);
    });
  }
}
