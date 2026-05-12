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
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import { ElementMounter } from '@synergos/rendering';

function sanitizeUnknownRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? omitUndefinedProperties(value as Record<string, unknown>)
    : undefined;
}

function sanitizeMacroHostConfig(
  value: Partial<MacroHostElementConfig>,
): Partial<MacroHostElementConfig> {
  return omitUndefinedProperties<MacroHostElementConfig>({
    contentType: coerceTrimmedStringInput(value.contentType),
    contentData: sanitizeUnknownRecord(value.contentData),
  });
}

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

  readonly config = input<Partial<MacroHostElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<MacroHostElementConfig>(sanitizeMacroHostConfig),
  });
  readonly contentTypeInput = input<string | undefined>(undefined, { alias: 'contentType' });
  readonly contentDataInput = input<string | undefined>(undefined, { alias: 'contentData' });

  readonly contentType = computed(() =>
    resolveConfigValue(this.contentTypeInput(), this.config()?.contentType, ''),
  );
  readonly contentData = computed(() =>
    resolveConfigValue(this.contentDataInput(), undefined, ''),
  );
  readonly resolvedTag = computed(() => this.contentType().trim());

  readonly #parsedData = computed<Record<string, unknown> | null>(() => {
    if (this.contentDataInput() !== undefined) {
      return this.#initialData.parseValue<Record<string, unknown>>(this.contentData()) ?? null;
    }
    return this.config()?.contentData ?? null;
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
