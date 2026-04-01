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
import { CustomElementHostService, InitialDataService } from '@synergos/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

export interface AngularHostConfig {
  readonly tagName?: string;
  readonly props?: Record<string, unknown>;
  readonly textContent?: string;
}

@Component({
  selector: 'sg-angular-host',
  standalone: true,
  templateUrl: './angular-host.html',
  styleUrl: './angular-host.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-angular-host' },
})
export class AngularHostElementComponent implements OnDestroy {
  readonly #elementRef = inject(ElementRef<HTMLElement>);
  readonly #hostService = inject(CustomElementHostService);
  readonly #initialData = inject(InitialDataService);

  readonly configInput = input<Partial<AngularHostConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<AngularHostConfig>,
  });
  readonly tagNameInput = input<string | undefined>(undefined, { alias: 'tagName' });
  readonly propsInput = input<string | undefined>(undefined, { alias: 'props' });
  readonly textContentInput = input<string | undefined>(undefined, { alias: 'textContent' });

  readonly tagName = computed(() =>
    resolveConfigValue(this.tagNameInput(), this.configInput()?.tagName, ''),
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
      const container = this.#elementRef.nativeElement.querySelector('.angular-host__container');
      if (!(container instanceof HTMLElement)) {
        return;
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
    const container = this.#elementRef.nativeElement.querySelector('.angular-host__container');
    if (container instanceof HTMLElement) {
      this.#hostService.unmount(container);
    }
  }
}
