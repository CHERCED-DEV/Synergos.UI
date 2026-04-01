import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { FocusManagerService } from './focus-manager.service';
import { LiveAnnouncerService } from './live-announcer.service';

export interface DialogConfig<TPayload = unknown> {
  readonly description?: string;
  readonly dismissible?: boolean;
  readonly id?: string;
  readonly initialFocusSelector?: string;
  readonly payload?: TPayload;
  readonly restoreFocus?: boolean;
  readonly title?: string;
}

export interface DialogInstance<TPayload = unknown> extends DialogConfig<TPayload> {
  readonly id: string;
  readonly openedAt: number;
  readonly restoreFocusTo: HTMLElement | null;
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly #document = inject(DOCUMENT);
  readonly #focusManager = inject(FocusManagerService);
  readonly #liveAnnouncer = inject(LiveAnnouncerService);
  readonly #dialogs = signal<readonly DialogInstance[]>([]);
  readonly #containers = new Map<string, HTMLElement>();

  readonly dialogs = this.#dialogs.asReadonly();
  readonly activeDialog = computed(() => {
    const currentDialogs = this.#dialogs();
    return currentDialogs[currentDialogs.length - 1] ?? null;
  });
  readonly hasOpenDialogs = computed(() => this.#dialogs().length > 0);
  readonly count = computed(() => this.#dialogs().length);

  open<TPayload>(config: DialogConfig<TPayload> = {}): string {
    const id = config.id ?? this.createId();
    const restoreFocusTo =
      this.#document.activeElement instanceof HTMLElement ? this.#document.activeElement : null;
    const dialog: DialogInstance<TPayload> = {
      ...config,
      dismissible: config.dismissible ?? true,
      id,
      openedAt: Date.now(),
      restoreFocus: config.restoreFocus ?? true,
      restoreFocusTo,
    };

    this.#dialogs.update((dialogs) => [...dialogs, dialog]);
    this.#liveAnnouncer.announce(config.title ? `${config.title} dialog opened` : 'Dialog opened');
    queueMicrotask(() => {
      this.focusDialog(id);
    });

    return id;
  }

  close(id: string): boolean {
    const dialog = this.#dialogs().find((entry) => entry.id === id);
    if (!dialog) {
      return false;
    }

    this.#dialogs.update((dialogs) => dialogs.filter((entry) => entry.id !== id));
    this.#containers.delete(id);
    this.#liveAnnouncer.announce(dialog.title ? `${dialog.title} dialog closed` : 'Dialog closed');

    queueMicrotask(() => {
      const nextActiveDialog = this.activeDialog();
      if (nextActiveDialog) {
        this.focusDialog(nextActiveDialog.id);
        return;
      }

      if (dialog.restoreFocus !== false) {
        this.#focusManager.focus(dialog.restoreFocusTo);
      }
    });

    return true;
  }

  closeActive(): boolean {
    const activeDialog = this.activeDialog();
    return activeDialog ? this.close(activeDialog.id) : false;
  }

  closeAll(): void {
    const dialogs = this.#dialogs();
    const lastDialog = dialogs[dialogs.length - 1] ?? null;

    this.#dialogs.set([]);
    this.#containers.clear();

    if (lastDialog?.restoreFocus !== false) {
      queueMicrotask(() => {
        this.#focusManager.focus(lastDialog.restoreFocusTo);
      });
    }
  }

  isOpen(id: string): boolean {
    return this.#dialogs().some((dialog) => dialog.id === id);
  }

  registerContainer(id: string, container: HTMLElement): void {
    this.#containers.set(id, container);

    if (this.activeDialog()?.id === id) {
      queueMicrotask(() => {
        this.focusDialog(id);
      });
    }
  }

  unregisterContainer(id: string): void {
    this.#containers.delete(id);
  }

  focusDialog(id: string): boolean {
    const dialog = this.#dialogs().find((entry) => entry.id === id);
    const container = this.#containers.get(id);

    if (!dialog || !container) {
      return false;
    }

    if (dialog.initialFocusSelector) {
      const initialFocusElement = container.querySelector<HTMLElement>(dialog.initialFocusSelector);
      if (initialFocusElement && this.#focusManager.isFocusableElement(initialFocusElement)) {
        this.#focusManager.focus(initialFocusElement);
        return true;
      }
    }

    return this.#focusManager.focusFirst(container);
  }

  private createId(): string {
    return `syn-dialog-${Math.random().toString(36).slice(2, 10)}`;
  }
}
