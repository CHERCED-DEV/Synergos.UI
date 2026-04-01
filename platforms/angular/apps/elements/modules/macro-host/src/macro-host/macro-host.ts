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
import { InitialDataService } from '@synergos/core';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  readonly contentType = input<string>('');
  readonly contentData = input<string>('');

  readonly parsedData = computed<Record<string, unknown> | null>(() => {
    const parsedValue = this.#initialData.parseValue<unknown>(this.contentData());
    return isRecord(parsedValue) ? parsedValue : null;
  });

  readonly resolvedTag = computed(() => {
    const type = this.contentType();
    if (!type) {
      return null;
    }

    const cleaned = type
      .replace(/^elementComp/, '')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase();

    return `synergos-${cleaned}`;
  });

  #mountedElement: HTMLElement | null = null;

  constructor() {
    effect(() => {
      this.#mount(this.resolvedTag(), this.parsedData());
    });
  }

  ngOnDestroy(): void {
    this.#unmount();
  }

  #mount(tag: string | null, data: Record<string, unknown> | null): void {
    this.#unmount();

    if (!tag) {
      return;
    }

    const container = this.#elementRef.nativeElement.querySelector('.macro-host__container');
    if (!container) {
      return;
    }

    const element = document.createElement(tag);

    if (data) {
      this.#applyInputs(element, data);
    }

    container.appendChild(element);
    this.#mountedElement = element;
  }

  #unmount(): void {
    if (this.#mountedElement) {
      this.#mountedElement.remove();
      this.#mountedElement = null;
    }
  }

  #applyInputs(element: HTMLElement, data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (isRecord(value)) {
        this.#applyInputs(element, value);
        continue;
      }

      const attr = key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      element.setAttribute(attr, String(value));
    }
  }
}
