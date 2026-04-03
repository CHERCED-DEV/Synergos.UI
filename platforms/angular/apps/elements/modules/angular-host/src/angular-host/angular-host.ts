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
  type AngularHostElementConfig,
} from '@synergos/contracts';
import {
  CustomElementHostService,
  InitialDataService,
  ScriptService,
} from '@synergos/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

@Component({
  selector: 'sg-angular-host',
  templateUrl: './angular-host.html',
  styleUrl: './angular-host.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-angular-host' },
})
export class AngularHostElementComponent implements OnDestroy {
  readonly #elementRef = inject(ElementRef<HTMLElement>);
  readonly #hostService = inject(CustomElementHostService);
  readonly #initialData = inject(InitialDataService);
  readonly #scriptService = inject(ScriptService);

  readonly config = input<Partial<AngularHostElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<AngularHostElementConfig>,
  });
  readonly componentInput = input<string | undefined>(undefined, { alias: 'component' });
  readonly endpointInput = input<string | undefined>(undefined, { alias: 'endpoint' });
  readonly paramsInput = input<string | undefined>(undefined, { alias: 'params' });
  readonly scriptSrcInput = input<string | undefined>(undefined, { alias: 'scriptSrc' });
  readonly tagNameInput = input<string | undefined>(undefined, { alias: 'tagName' });
  readonly propsInput = input<string | undefined>(undefined, { alias: 'props' });
  readonly textContentInput = input<string | undefined>(undefined, { alias: 'textContent' });

  readonly component = computed(() =>
    resolveConfigValue(this.componentInput(), this.config()?.component, ''),
  );
  readonly endpoint = computed(() =>
    resolveConfigValue(this.endpointInput(), this.config()?.endpoint, ''),
  );
  readonly scriptSrc = computed(() =>
    resolveConfigValue(this.scriptSrcInput(), undefined, ''),
  );
  readonly #legacyTagName = computed(() =>
    resolveConfigValue(this.tagNameInput(), undefined, ''),
  );
  readonly textContent = computed(() =>
    resolveConfigValue(this.textContentInput(), undefined, ''),
  );
  readonly #parsedParams = computed<Record<string, string>>(() => {
    if (this.paramsInput() !== undefined) {
      return this.#initialData.parseValue<Record<string, string>>(this.paramsInput()) ?? {};
    }

    return this.config()?.params ?? {};
  });
  readonly #parsedProps = computed<Record<string, unknown>>(() => {
    if (this.propsInput() !== undefined) {
      return this.#initialData.parseValue<Record<string, unknown>>(this.propsInput()) ?? {};
    }

    return {};
  });
  readonly #resolvedProps = computed<Record<string, unknown>>(() => {
    const endpoint = this.endpoint().trim();

    return {
      ...this.#parsedParams(),
      ...this.#parsedProps(),
      ...(endpoint ? { endpoint } : {}),
    };
  });

  constructor() {
    effect(() => {
      const container = this.#elementRef.nativeElement.querySelector('.angular-host__container');
      if (!(container instanceof HTMLElement)) {
        return;
      }

      const component = this.component().trim();
      const tagName = this.#legacyTagName().trim();
      const scriptSrc = this.scriptSrc().trim();

      if (scriptSrc) {
        this.#scriptService.addScript({
          src: scriptSrc,
          target: 'body',
          async: true,
          defer: true,
        });
      }

      if (!component && !tagName) {
        this.#hostService.unmount(container);
        return;
      }

      this.#hostService.mount(container, {
        component,
        tagName,
        props: this.#resolvedProps(),
        textContent: this.textContent(),
      });
    });
  }

  ngOnDestroy(): void {
    const container = this.#elementRef.nativeElement.querySelector('.angular-host__container');
    if (container instanceof HTMLElement) {
      this.#hostService.unmount(container);
    }
  }
}
