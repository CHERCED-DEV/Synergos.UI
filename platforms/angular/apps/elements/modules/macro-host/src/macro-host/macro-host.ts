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
import type { MacroHostElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import { coerceConfigInput, resolveConfigValue } from '@synergos/shared';
import { ElementMounter } from '@synergos/rendering';

@Component({
  selector: 'sg-macro-host',
  templateUrl: './macro-host.html',
  styleUrl: './macro-host.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-macro-host' },
})
export class MacroHostComponent implements OnDestroy {
  readonly #elementRef = inject(ElementRef<HTMLElement>);
  readonly #initialData = inject(InitialDataService);
  readonly #mounter = inject(ElementMounter);

  readonly configInput = input<Partial<MacroHostElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<MacroHostElementConfig>,
  });
  readonly contentTypeInput = input<string | undefined>(undefined, { alias: 'contentType' });
  readonly contentDataInput = input<string | undefined>(undefined, { alias: 'contentData' });

  readonly contentType = computed(() =>
    resolveConfigValue(this.contentTypeInput(), this.configInput()?.contentType, ''),
  );
  readonly contentData = computed(() =>
    resolveConfigValue(this.contentDataInput(), undefined, ''),
  );
  readonly resolvedTag = computed(() => this.contentType().trim());

  readonly #parsedData = computed<Record<string, unknown> | null>(() => {
    if (this.contentDataInput() !== undefined) {
      return this.#initialData.parseValue<Record<string, unknown>>(this.contentData()) ?? null;
    }
    return this.configInput()?.contentData ?? null;
  });

  #mountedElement: HTMLElement | null = null;

  constructor() {
    effect(() => {
      this.#remount(this.contentType(), this.#parsedData());
    });
  }

  ngOnDestroy(): void {
    this.#unmount();
  }

  #remount(contentTypeAlias: string, data: Record<string, unknown> | null): void {
    this.#unmount();

    if (!contentTypeAlias) {
      return;
    }

    const container = this.#elementRef.nativeElement.querySelector('.macro-host__container');
    if (!container) {
      return;
    }

    this.#mountedElement = this.#mounter.mountBlock(container as HTMLElement, {
      type: contentTypeAlias,
      blockClass: '',
      data: data ?? {},
    });
  }

  #unmount(): void {
    if (this.#mountedElement) {
      this.#mountedElement.remove();
      this.#mountedElement = null;
    }
  }
}
