import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceOptionalBooleanInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynModalTrigger</c>.
 *
 * A self-contained modal/dialog composition: a trigger button opens an
 * accessible overlay dialog (<c>role="dialog"</c> + <c>aria-modal="true"</c>)
 * with a focus trap, Escape-to-close, backdrop dismissal and focus
 * restoration. Content is supplied as plain text/HTML-free copy via
 * <c>modalContent</c>; the size token controls the panel width.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface ModalTriggerRuntimeConfig {
  readonly triggerLabel?: string;
  readonly modalTitle?: string;
  readonly modalContent?: string;
  readonly modalSize?: string;
  readonly closeLabel?: string;
  readonly dismissible?: boolean;
}

export type ModalSize = 'sm' | 'md' | 'lg' | 'full';

/** Emitted on the `modaltoggle` CustomEvent and the typed Angular output. */
export interface ModalToggleDetail {
  readonly open: boolean;
}

const MODAL_SIZES: readonly ModalSize[] = ['sm', 'md', 'lg', 'full'];

const DEFAULT_TRIGGER_LABEL = 'Abrir';
const DEFAULT_CLOSE_LABEL = 'Cerrar';
const DEFAULT_SIZE: ModalSize = 'md';

/** Selector matching the focusable descendants inside the dialog. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function normalizeSize(value: unknown): ModalSize {
  return coerceStringEnumInput<ModalSize>(value, MODAL_SIZES) ?? DEFAULT_SIZE;
}

function sanitizeModalTriggerConfig(
  value: Partial<ModalTriggerRuntimeConfig>,
): ModalTriggerRuntimeConfig {
  return omitUndefinedProperties<ModalTriggerRuntimeConfig>({
    triggerLabel: coerceTrimmedStringInput(value.triggerLabel),
    modalTitle: coerceTrimmedStringInput(value.modalTitle),
    modalContent: coerceTrimmedStringInput(value.modalContent),
    modalSize: coerceTrimmedStringInput(value.modalSize),
    closeLabel: coerceTrimmedStringInput(value.closeLabel),
    dismissible: coerceOptionalBooleanInput(value.dismissible),
  });
}

@Component({
  selector: 'sg-modal-trigger',
  standalone: true,
  templateUrl: './modal-trigger.html',
  styleUrl: './modal-trigger.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-modal-trigger' },
})
export class ModalTriggerElementComponent {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly config = input<ModalTriggerRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ModalTriggerRuntimeConfig>(sanitizeModalTriggerConfig),
  });
  readonly triggerLabelInput = input<string | undefined>(undefined, { alias: 'triggerLabel' });
  readonly modalTitleInput = input<string | undefined>(undefined, { alias: 'modalTitle' });
  readonly modalContentInput = input<string | undefined>(undefined, { alias: 'modalContent' });
  readonly modalSizeInput = input<string | undefined>(undefined, { alias: 'modalSize' });
  readonly closeLabelInput = input<string | undefined>(undefined, { alias: 'closeLabel' });
  readonly dismissibleInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'dismissible',
    transform: coerceOptionalBooleanInput,
  });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `modaltoggle` CustomEvent. */
  readonly modaltoggle = output<ModalToggleDetail>();

  readonly triggerLabel = computed(() =>
    resolveConfigValue(this.triggerLabelInput(), this.config()?.triggerLabel, DEFAULT_TRIGGER_LABEL),
  );
  readonly modalTitle = computed(() =>
    resolveConfigValue(this.modalTitleInput(), this.config()?.modalTitle, ''),
  );
  readonly modalContent = computed(() =>
    resolveConfigValue(this.modalContentInput(), this.config()?.modalContent, ''),
  );
  readonly modalSize = computed<ModalSize>(() =>
    normalizeSize(resolveConfigValue(this.modalSizeInput(), this.config()?.modalSize, DEFAULT_SIZE)),
  );
  readonly closeLabel = computed(() =>
    resolveConfigValue(this.closeLabelInput(), this.config()?.closeLabel, DEFAULT_CLOSE_LABEL),
  );
  readonly dismissible = computed(() =>
    resolveConfigValue(this.dismissibleInput(), this.config()?.dismissible, true),
  );

  readonly hasTitle = computed(() => this.modalTitle().trim().length > 0);
  readonly hasContent = computed(() => this.modalContent().trim().length > 0);

  /** Stable ids wiring the dialog to its accessible name/description. */
  readonly titleId = `syn-modal-title-${Math.random().toString(36).slice(2, 8)}`;
  readonly contentId = `syn-modal-content-${Math.random().toString(36).slice(2, 8)}`;

  readonly #open = signal(false);
  readonly isOpen = this.#open.asReadonly();

  /** Element that held focus before opening, so we can restore it on close. */
  #restoreFocusTo: HTMLElement | null = null;

  open(): void {
    if (this.#open()) {
      return;
    }

    const active = this.#host.nativeElement.ownerDocument?.activeElement;
    this.#restoreFocusTo = active instanceof HTMLElement ? active : null;

    this.#open.set(true);
    this.modaltoggle.emit({ open: true });

    // Defer until the panel renders, then move focus into the dialog.
    this.#defer(() => this.#focusFirst());
  }

  close(): void {
    if (!this.#open()) {
      return;
    }

    this.#open.set(false);
    this.modaltoggle.emit({ open: false });

    const restore = this.#restoreFocusTo;
    this.#restoreFocusTo = null;
    this.#defer(() => restore?.focus());
  }

  /** Backdrop click closes only when dismissible. */
  onBackdropPointer(event: MouseEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (this.dismissible()) {
      this.close();
    }
  }

  /** Escape closes; Tab is trapped within the dialog. */
  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'Esc') {
      if (this.dismissible()) {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      }
      return;
    }

    if (event.key === 'Tab') {
      this.#trapTab(event);
    }
  }

  #trapTab(event: KeyboardEvent): void {
    const focusables = this.#focusableElements();
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const root = this.#dialogRoot();
    const active = root?.ownerDocument?.activeElement ?? null;

    if (event.shiftKey) {
      if (active === first || !root?.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last || !root?.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  #focusFirst(): void {
    const focusables = this.#focusableElements();
    (focusables[0] ?? this.#dialogRoot())?.focus();
  }

  #focusableElements(): HTMLElement[] {
    const root = this.#dialogRoot();
    if (!root) {
      return [];
    }
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.offsetParent !== null || element === root.ownerDocument?.activeElement,
    );
  }

  #dialogRoot(): HTMLElement | null {
    const host = this.#host.nativeElement;
    const root: ParentNode = host.shadowRoot ?? host;
    return root.querySelector<HTMLElement>('[data-modal-dialog]');
  }

  #defer(action: () => void): void {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => action());
    } else {
      queueMicrotask(action);
    }
  }
}
