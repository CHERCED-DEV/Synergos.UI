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
import { CustomElementHostService, InitialDataService, ScriptService } from '@synergos/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';

export interface MfHostConfig {
  readonly remoteEntry?: string;
  readonly tagName?: string;
  readonly props?: Record<string, unknown>;
}

@Component({
  selector: 'sg-mf-host',
  standalone: true,
  templateUrl: './mf-host.html',
  styleUrl: './mf-host.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-mf-host' },
})
export class MfHostElementComponent implements OnDestroy {
  readonly #elementRef = inject(ElementRef<HTMLElement>);
  readonly #hostService = inject(CustomElementHostService);
  readonly #initialData = inject(InitialDataService);
  readonly #scriptService = inject(ScriptService);

  readonly configInput = input<Partial<MfHostConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<MfHostConfig>,
  });
  readonly remoteEntryInput = input<string | undefined>(undefined, { alias: 'remoteEntry' });
  readonly tagNameInput = input<string | undefined>(undefined, { alias: 'tagName' });
  readonly propsInput = input<string | undefined>(undefined, { alias: 'props' });

  readonly remoteEntry = computed(() =>
    resolveConfigValue(this.remoteEntryInput(), this.configInput()?.remoteEntry, ''),
  );
  readonly tagName = computed(() =>
    resolveConfigValue(this.tagNameInput(), this.configInput()?.tagName, ''),
  );
  readonly #parsedProps = computed<Record<string, unknown>>(() => {
    if (this.propsInput() !== undefined) {
      return this.#initialData.parseValue<Record<string, unknown>>(this.propsInput()) ?? {};
    }

    return this.configInput()?.props ?? {};
  });

  constructor() {
    effect(() => {
      const container = this.#elementRef.nativeElement.querySelector('.mf-host__container');
      if (!(container instanceof HTMLElement)) {
        return;
      }

      if (this.remoteEntry().trim()) {
        this.#scriptService.addScript({
          src: this.remoteEntry(),
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
      });
    });
  }

  ngOnDestroy(): void {
    const container = this.#elementRef.nativeElement.querySelector('.mf-host__container');
    if (container instanceof HTMLElement) {
      this.#hostService.unmount(container);
    }
  }
}
