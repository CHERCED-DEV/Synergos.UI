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
  viewChild,
} from '@angular/core';
import {
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynDrawer</c>.
 *
 * A slide-in panel (off-canvas / side sheet) anchored to one edge of the
 * viewport. A trigger button opens it; a backdrop, the Escape key, or the
 * close button dismiss it. While open it behaves as a modal dialog:
 * `role="dialog"` + `aria-modal`, focus is trapped inside and restored to
 * the trigger on close, and body scroll is locked. The `open` state can be
 * driven declaratively (config/attribute) or imperatively (`open()` /
 * `close()` / `toggle()`). Opening/closing emits an `openchange`
 * CustomEvent.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export type DrawerSide = 'start' | 'end' | 'top' | 'bottom';

export interface DrawerRuntimeConfig {
  readonly triggerLabel?: string;
  readonly heading?: string;
  readonly drawerContent?: string;
  readonly side?: string;
  readonly open?: boolean;
}

/** Emitted on the `openchange` CustomEvent and the typed Angular output. */
export interface DrawerOpenChangeDetail {
  readonly open: boolean;
}

const DRAWER_SIDES: readonly DrawerSide[] = ['start', 'end', 'top', 'bottom'];

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function normalizeSide(value: unknown): DrawerSide {
  return coerceStringEnumInput(value, DRAWER_SIDES) ?? 'end';
}

function sanitizeDrawerConfig(value: Partial<DrawerRuntimeConfig>): DrawerRuntimeConfig {
  return omitUndefinedProperties<DrawerRuntimeConfig>({
    triggerLabel: coerceTrimmedStringInput(value.triggerLabel),
    heading: coerceTrimmedStringInput(value.heading),
    drawerContent: coerceTrimmedStringInput(value.drawerContent),
    side: coerceTrimmedStringInput(value.side),
    open: typeof value.open === 'boolean' ? value.open : undefined,
  });
}

@Component({
  selector: 'sg-drawer',
  standalone: true,
  templateUrl: './drawer.html',
  styleUrl: './drawer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-drawer' },
})
export class DrawerElementComponent {
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<DrawerRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<DrawerRuntimeConfig>(sanitizeDrawerConfig),
  });
  readonly triggerLabelInput = input<string | undefined>(undefined, { alias: 'triggerLabel' });
  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });
  readonly drawerContentInput = input<string | undefined>(undefined, { alias: 'drawerContent' });
  readonly sideInput = input<string | undefined>(undefined, { alias: 'side' });
  readonly openInput = input<string | undefined>(undefined, { alias: 'open' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `openchange` CustomEvent. */
  readonly openchange = output<DrawerOpenChangeDetail>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly closeButton = viewChild<ElementRef<HTMLElement>>('closeButton');

  readonly triggerLabel = computed(() =>
    resolveConfigValue(this.triggerLabelInput(), this.config()?.triggerLabel, 'Abrir panel'),
  );
  readonly heading = computed(() =>
    resolveConfigValue(this.headingInput(), this.config()?.heading, ''),
  );
  readonly drawerContent = computed(() =>
    resolveConfigValue(this.drawerContentInput(), this.config()?.drawerContent, ''),
  );
  readonly side = computed<DrawerSide>(() =>
    normalizeSide(resolveConfigValue(this.sideInput(), this.config()?.side, 'end')),
  );

  readonly hasHeading = computed(() => this.heading().trim().length > 0);

  /** Stable id for the heading → aria-labelledby wiring. */
  readonly headingId = `syn-drawer-title-${Math.random().toString(36).slice(2, 9)}`;

  /** Live open state; mutated by methods and the declarative `open` input. */
  readonly #open = signal(false);
  readonly isOpen = this.#open.asReadonly();

  /** Element that held focus when the drawer opened — restored on close. */
  #previouslyFocused: HTMLElement | null = null;

  constructor() {
    // Honor the declarative open state (config/attribute). Attribute presence
    // ("", "true") opens; "false" closes.
    effect(() => {
      const raw = resolveConfigValue(this.openInput(), undefined, undefined);
      const fromAttr =
        raw === undefined ? this.config()?.open : raw.trim().toLowerCase() !== 'false';
      if (typeof fromAttr === 'boolean') {
        this.#setOpen(fromAttr, false);
      }
    });

    // Manage the document-level side effects (scroll lock, focus, listeners).
    effect((onCleanup) => {
      if (!this.isOpen() || typeof document === 'undefined') {
        return;
      }

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const onKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.close();
          return;
        }
        if (event.key === 'Tab') {
          this.#trapFocus(event);
        }
      };

      document.addEventListener('keydown', onKeydown, true);
      this.#focusInitial();

      onCleanup(() => {
        document.removeEventListener('keydown', onKeydown, true);
        document.body.style.overflow = previousOverflow;
      });
    });

    this.#destroyRef.onDestroy(() => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
    });
  }

  open(): void {
    this.#setOpen(true, true);
  }

  close(): void {
    this.#setOpen(false, true);
  }

  toggle(): void {
    this.#setOpen(!this.isOpen(), true);
  }

  onBackdropClick(): void {
    this.close();
  }

  #setOpen(next: boolean, emit: boolean): void {
    if (next === this.isOpen()) {
      return;
    }

    if (next) {
      this.#previouslyFocused =
        typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    }

    this.#open.set(next);

    if (!next) {
      this.#restoreFocus();
    }

    if (emit) {
      this.openchange.emit({ open: next });
    }
  }

  #focusableElements(): HTMLElement[] {
    const panel = this.panel()?.nativeElement;
    if (!panel) {
      return [];
    }
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    );
  }

  #focusInitial(): void {
    if (typeof requestAnimationFrame !== 'function') {
      this.closeButton()?.nativeElement.focus();
      return;
    }
    requestAnimationFrame(() => {
      const target = this.closeButton()?.nativeElement ?? this.#focusableElements()[0];
      target?.focus();
    });
  }

  #restoreFocus(): void {
    const target = this.#previouslyFocused;
    this.#previouslyFocused = null;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }

  #trapFocus(event: KeyboardEvent): void {
    const focusable = this.#focusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
