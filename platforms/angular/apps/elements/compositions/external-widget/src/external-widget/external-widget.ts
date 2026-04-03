import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
} from '@angular/core';
import type { ExternalWidgetElementConfig } from '@synergos/contracts';
import {
  CustomElementHostService,
  InitialDataService,
  ScriptService,
} from '@synergos/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

@Component({
  selector: 'sg-external-widget',
  templateUrl: './external-widget.html',
  styleUrl: './external-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-external-widget' },
})
export class ExternalWidgetElementComponent implements OnDestroy {
  readonly #elementRef = inject(ElementRef<HTMLElement>);
  readonly #hostService = inject(CustomElementHostService);
  readonly #initialData = inject(InitialDataService);
  readonly #scriptService = inject(ScriptService);

  readonly config = input<Partial<ExternalWidgetElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<ExternalWidgetElementConfig>,
  });
  readonly srcInput = input<string | undefined>(undefined, { alias: 'src' });
  readonly typeInput = input<string | undefined>(undefined, { alias: 'type' });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly endpointInput = input<string | undefined>(undefined, { alias: 'endpoint' });
  readonly tagNameInput = input<string | undefined>(undefined, { alias: 'tagName' });
  readonly scriptSrcInput = input<string | undefined>(undefined, { alias: 'scriptSrc' });
  readonly propsInput = input<string | undefined>(undefined, { alias: 'props' });
  readonly textContentInput = input<string | undefined>(undefined, { alias: 'textContent' });

  readonly tagName = computed(() =>
    resolveConfigValue(
      this.typeInput(),
      this.config()?.type,
      resolveConfigValue(this.tagNameInput(), undefined, ''),
    ),
  );
  readonly scriptSrc = computed(() =>
    resolveConfigValue(
      this.srcInput(),
      this.config()?.src,
      resolveConfigValue(this.scriptSrcInput(), undefined, ''),
    ),
  );
  readonly endpoint = computed(() =>
    resolveConfigValue(this.endpointInput(), this.config()?.endpoint, ''),
  );
  readonly textContent = computed(() =>
    resolveConfigValue(
      this.titleInput(),
      this.config()?.title,
      resolveConfigValue(this.textContentInput(), undefined, ''),
    ),
  );
  readonly #parsedProps = computed<Record<string, unknown>>(() => {
    const endpoint = this.endpoint().trim();

    if (this.propsInput() !== undefined) {
      return {
        ...(endpoint ? { endpoint } : {}),
        ...(this.#initialData.parseValue<Record<string, unknown>>(this.propsInput()) ?? {}),
      };
    }

    return endpoint ? { endpoint } : {};
  });

  constructor() {
    effect(() => {
      const container = this.#elementRef.nativeElement.querySelector('.external-widget__container');
      if (!(container instanceof HTMLElement)) {
        return;
      }

      if (this.scriptSrc().trim()) {
        this.#scriptService.addScript({
          src: this.scriptSrc(),
          target: 'body',
          async: true,
          defer: true,
        });
      }

      if (!this.tagName().trim()) {
        this.#hostService.unmount(container);
        return;
      }

      this.#hostService.mount(container, {
        tagName: this.tagName(),
        props: this.#parsedProps(),
        textContent: this.textContent(),
      });
    });
  }

  ngOnDestroy(): void {
    const container = this.#elementRef.nativeElement.querySelector('.external-widget__container');
    if (container instanceof HTMLElement) {
      this.#hostService.unmount(container);
    }
  }
}
