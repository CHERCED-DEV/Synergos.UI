import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynPopover</c>.
 *
 * A positioned popover: a trigger button reveals a floating panel of
 * content, dismissible with Escape, an outside click, or a close button.
 * Focus is trapped while open and restored to the trigger on close.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface PopoverRuntimeConfig {
  readonly triggerLabel?: string;
  readonly popoverContent?: string;
  readonly heading?: string;
  readonly placement?: string;
  readonly closeLabel?: string;
}

/** Where the panel is anchored relative to the trigger. */
export type PopoverPlacement = 'top' | 'bottom' | 'left' | 'right';

/** Emitted on the `popovertoggle` CustomEvent and the typed Angular output. */
export interface PopoverToggleDetail {
  readonly open: boolean;
}

const PLACEMENTS: readonly PopoverPlacement[] = ['top', 'bottom', 'left', 'right'];
const DEFAULT_PLACEMENT: PopoverPlacement = 'bottom';
const DEFAULT_TRIGGER_LABEL = 'Más información';
const DEFAULT_CLOSE_LABEL = 'Cerrar';

/** Coerce arbitrary input to a known placement, falling back to the default. */
export function normalizePlacement(value: unknown): PopoverPlacement {
  const candidate = coerceTrimmedStringInput(
    typeof value === 'string' ? value.toLowerCase() : value,
  ) as PopoverPlacement | undefined;
  return candidate && PLACEMENTS.includes(candidate) ? candidate : DEFAULT_PLACEMENT;
}

function sanitizePopoverConfig(value: Partial<PopoverRuntimeConfig>): PopoverRuntimeConfig {
  return omitUndefinedProperties<PopoverRuntimeConfig>({
    triggerLabel: coerceTrimmedStringInput(value.triggerLabel),
    popoverContent: coerceTrimmedStringInput(value.popoverContent),
    heading: coerceTrimmedStringInput(value.heading),
    placement: coerceTrimmedStringInput(value.placement),
    closeLabel: coerceTrimmedStringInput(value.closeLabel),
  });
}

let popoverInstanceCounter = 0;

@Component({
  selector: 'sg-popover',
  standalone: true,
  templateUrl: './popover.html',
  styleUrl: './popover.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-popover' },
})
export class PopoverElementComponent {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<PopoverRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<PopoverRuntimeConfig>(sanitizePopoverConfig),
  });
  readonly triggerLabelInput = input<string | undefined>(undefined, { alias: 'triggerLabel' });
  readonly popoverContentInput = input<string | undefined>(undefined, { alias: 'popoverContent' });
  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });
  readonly placementInput = input<string | undefined>(undefined, { alias: 'placement' });
  readonly closeLabelInput = input<string | undefined>(undefined, { alias: 'closeLabel' });
  readonly integration = input<string | undefined>(undefined);

  /**
   * Emitted as the `popovertoggle` CustomEvent.
   *
   * NO se llama `toggle`: ese es un evento DOM nativo (`<details>` y la Popover API) y sería
   * indistinguible del nuestro en el host. Convención de la casa, igual que `tooltiptoggle`.
   */
  readonly popovertoggle = output<PopoverToggleDetail>();

  /** Stable ids tying the trigger to the panel for aria-controls / labelling. */
  readonly #instanceId = ++popoverInstanceCounter;
  readonly panelId = `syn-popover-panel-${this.#instanceId}`;
  readonly headingId = `syn-popover-heading-${this.#instanceId}`;

  readonly #open = signal(false);
  readonly open = this.#open.asReadonly();

  readonly triggerLabel = computed(() =>
    resolveConfigValue(this.triggerLabelInput(), this.config()?.triggerLabel, DEFAULT_TRIGGER_LABEL),
  );
  readonly popoverContent = computed(() =>
    resolveConfigValue(this.popoverContentInput(), this.config()?.popoverContent, ''),
  );
  readonly heading = computed(() =>
    resolveConfigValue(this.headingInput(), this.config()?.heading, ''),
  );
  readonly closeLabel = computed(() =>
    resolveConfigValue(this.closeLabelInput(), this.config()?.closeLabel, DEFAULT_CLOSE_LABEL),
  );
  readonly placement = computed<PopoverPlacement>(() =>
    normalizePlacement(resolveConfigValue(this.placementInput(), this.config()?.placement, DEFAULT_PLACEMENT)),
  );

  readonly hasHeading = computed(() => this.heading().trim().length > 0);
  readonly hasContent = computed(() => this.popoverContent().trim().length > 0);

  /** Panel labelling: prefer the heading, else fall back to the trigger label. */
  readonly panelAriaLabel = computed(() => (this.hasHeading() ? null : this.triggerLabel()));
  readonly panelAriaLabelledby = computed(() => (this.hasHeading() ? this.headingId : null));

  readonly #onDocumentPointerDown = (event: Event): void => {
    if (!this.#open()) {
      return;
    }
    const target = event.target as Node | null;
    if (target && !this.#host.nativeElement.contains(target)) {
      this.close();
    }
  };

  readonly #onDocumentKeydown = (event: KeyboardEvent): void => {
    if (this.#open() && event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  };

  constructor() {
    // Bind / unbind global dismiss listeners only while the popover is open.
    effect((onCleanup) => {
      if (!this.#open() || typeof document === 'undefined') {
        return;
      }
      document.addEventListener('pointerdown', this.#onDocumentPointerDown, true);
      document.addEventListener('keydown', this.#onDocumentKeydown, true);
      onCleanup(() => {
        document.removeEventListener('pointerdown', this.#onDocumentPointerDown, true);
        document.removeEventListener('keydown', this.#onDocumentKeydown, true);
      });
    });

    this.#destroyRef.onDestroy(() => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('pointerdown', this.#onDocumentPointerDown, true);
        document.removeEventListener('keydown', this.#onDocumentKeydown, true);
      }
    });
  }

  toggleOpen(): void {
    if (this.#open()) {
      this.close();
    } else {
      this.openPanel();
    }
  }

  openPanel(): void {
    if (this.#open()) {
      return;
    }
    this.#open.set(true);
    this.popovertoggle.emit({ open: true });
    this.#focusPanel();
  }

  close(): void {
    if (!this.#open()) {
      return;
    }
    this.#open.set(false);
    this.popovertoggle.emit({ open: false });
    this.#focusTrigger();
  }

  /** Trap Tab focus inside the panel while it is open. */
  onPanelKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }

    const focusables = this.#focusableElements();
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }

    const root = this.#root();
    const active = root.activeElement as HTMLElement | null;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private query<T extends Element>(selector: string): T | null {
    return this.#host.nativeElement.querySelector<T>(selector);
  }

  private queryAll<T extends Element>(selector: string): T[] {
    return Array.from(this.#host.nativeElement.querySelectorAll<T>(selector));
  }

  #root(): DocumentOrShadowRoot {
    return (this.#host.nativeElement.getRootNode() as ShadowRoot | Document) ?? document;
  }

  #focusableElements(): HTMLElement[] {
    const panel = this.query<HTMLElement>(`#${this.panelId}`);
    if (!panel) {
      return [];
    }
    const selector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]),' +
      ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(panel.querySelectorAll<HTMLElement>(selector)).filter(
      (element) => element.offsetParent !== null || element === this.#root().activeElement,
    );
  }

  #focusPanel(): void {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const closeButton = this.query<HTMLElement>('.popover__close');
      const firstFocusable = this.#focusableElements()[0];
      (closeButton ?? firstFocusable ?? this.query<HTMLElement>(`#${this.panelId}`))?.focus();
    });
  }

  #focusTrigger(): void {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      this.query<HTMLElement>('.popover__trigger')?.focus();
    });
  }
}
