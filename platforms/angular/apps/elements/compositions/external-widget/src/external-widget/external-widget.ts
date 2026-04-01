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
import {
  CustomElementHostService,
  InitialDataService,
  ScriptService,
} from '@synergos/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

export interface ExternalWidgetConfig {
  readonly tagName?: string;
  readonly scriptSrc?: string;
  readonly props?: Record<string, unknown>;
  readonly textContent?: string;
}

@Component({
  selector: 'sg-external-widget',
  standalone: true,
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

  readonly configInput = input<Partial<ExternalWidgetConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<ExternalWidgetConfig>,
  });
  readonly tagNameInput = input<string | undefined>(undefined, { alias: 'tagName' });
  readonly scriptSrcInput = input<string | undefined>(undefined, { alias: 'scriptSrc' });
  readonly propsInput = input<string | undefined>(undefined, { alias: 'props' });
  readonly textContentInput = input<string | undefined>(undefined, { alias: 'textContent' });

  readonly tagName = computed(() =>
    resolveConfigValue(this.tagNameInput(), this.configInput()?.tagName, ''),
  );
  readonly scriptSrc = computed(() =>
    resolveConfigValue(this.scriptSrcInput(), this.configInput()?.scriptSrc, ''),
  );
  readonly textContent = computed(() =>
    resolveConfigValue(this.textContentInput(), this.configInput()?.textContent, ''),
  );
  readonly #parsedProps = computed<Record<string, unknown>>(() => {
    if (this.propsInput() !== undefined) {
      return this.#initialData.parseValue<Record<string, unknown>>(this.propsInput()) ?? {};
    }

    return this.configInput()?.props ?? {};
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
