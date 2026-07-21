import {
  ChangeDetectionStrategy,
  Component,
  type TemplateRef,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  SynSkeletonComponent,
  SynEmptyStateComponent,
  SynErrorStateComponent,
  SynStatusBannerComponent,
} from '@synergos/shared';

/**
 * SH-7 — `syn-message-center` **v1** (catálogo §1.3 doc 21).
 *
 * The reusable P7 organism, first rung of the ladder (v1 hilos simples → v2 DM
 * completo → v3 In Basket): a two-pane conversation-list + thread layout with a
 * built-in reply composer. **Domain-free:** threads are opaque `TThread`s —
 * "pregunta de comprador", "DM", "lead-thread" and "mensaje In Basket" are all
 * the same shell with different templates. The consumer owns selection: the
 * shell emits `threadselect`, the consumer loads/derives the active thread
 * (with its domain-shaped messages) and feeds it back via `activeThread`,
 * rendered through `detailTemplate`. `send` hands the reply text back for the
 * consumer to resolve against its messaging seam.
 */

/** Copy config. Everything optional — sane neutral defaults. */
export interface MessageCenterConfig {
  readonly heading?: string;
  readonly listLabel?: string;
  readonly emptyMessage?: string;
  readonly loadingMessage?: string;
  readonly detailPlaceholder?: string;
  // ── State surfaces (Fase 2) — all optional, additive ─────────────────────────
  /** Title + CTA for the `first-use` empty conversation list. */
  readonly emptyTitle?: string;
  readonly emptyActionLabel?: string;
  readonly emptyActionHref?: string;
  /** When set, the list renders `syn-error-state` (with an inline retry). */
  readonly errorMessage?: string;
  readonly errorTitle?: string;
  readonly composerLabel?: string;
  readonly composerPlaceholder?: string;
  readonly sendLabel?: string;
  readonly sendingLabel?: string;
}

/** Template context for one conversation-list row. */
export interface MessageThreadContext<TThread> {
  readonly $implicit: TThread;
  readonly index: number;
  readonly selected: boolean;
}

/** Template context for the active thread pane. */
export interface MessageDetailContext<TThread> {
  readonly $implicit: TThread;
}

/** Emitted when the composer submits a reply. */
export interface MessageSendEvent<TThread> {
  readonly thread: TThread;
  readonly body: string;
}

let messageCenterInstanceId = 0;

@Component({
  selector: 'syn-message-center',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    SynSkeletonComponent,
    SynEmptyStateComponent,
    SynErrorStateComponent,
    SynStatusBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-message-center' },
  styleUrl: './message-center.scss',
  template: `
    <div class="syn-messages">
      @if (config().heading) {
        <h1 class="syn-messages__heading">{{ config().heading }}</h1>
      }

      @if (degradedMessage(); as degraded) {
        <syn-status-banner class="syn-messages__banner" [message]="degraded" />
      }

      <div class="syn-messages__panes">
        <nav class="syn-messages__list-pane" [attr.aria-label]="config().listLabel || 'Conversaciones'">
          @if (config().errorMessage; as errorMessage) {
            <syn-error-state
              class="syn-messages__state"
              [title]="config().errorTitle || 'Algo salió mal'"
              [message]="errorMessage"
              (retry)="retry.emit()"
            />
          } @else if (loading()) {
            @if (loadingTemplate(); as tpl) {
              <ng-container [ngTemplateOutlet]="tpl" />
            } @else {
              <syn-skeleton
                class="syn-messages__state"
                variant="list"
                [rows]="6"
                [ariaLabel]="config().loadingMessage || 'Cargando…'"
              />
            }
          } @else if (threads().length === 0) {
            <syn-empty-state
              class="syn-messages__state"
              kind="first-use"
              [title]="resolvedEmptyTitle()"
              [message]="resolvedEmptyMessage()"
              [actionLabel]="config().emptyActionLabel"
              [actionHref]="config().emptyActionHref"
              (action)="emptyAction.emit()"
            />
          } @else {
            <ul class="syn-messages__list">
              @for (thread of threads(); track $index; let index = $index) {
                <li class="syn-messages__list-item">
                  <button
                    type="button"
                    class="syn-messages__row"
                    [class.is-selected]="isActive(thread)"
                    [attr.aria-pressed]="isActive(thread)"
                    (click)="selectThread(thread)"
                  >
                    <ng-container
                      [ngTemplateOutlet]="threadTemplate()"
                      [ngTemplateOutletContext]="threadContext(thread, index)"
                    />
                  </button>
                </li>
              }
            </ul>
          }
        </nav>

        <section class="syn-messages__thread-pane" aria-live="polite">
          @if (activeThread() !== null && detailTemplate(); as detail) {
            <div class="syn-messages__thread">
              <ng-container
                [ngTemplateOutlet]="detail"
                [ngTemplateOutletContext]="{ $implicit: activeThread() }"
              />
            </div>

            <form class="syn-messages__composer" (submit)="onComposerSubmit($event)">
              <label class="syn-messages__sr-only" [attr.for]="fieldId + '-reply'">
                {{ config().composerLabel || 'Responder' }}
              </label>
              <textarea
                class="syn-messages__input"
                rows="2"
                [id]="fieldId + '-reply'"
                [placeholder]="config().composerPlaceholder || 'Escribe una respuesta…'"
                [value]="composerBody()"
                [disabled]="sending()"
                (input)="onComposerInput($event)"
              ></textarea>
              <button
                type="submit"
                class="syn-messages__send"
                [disabled]="sendDisabled()"
              >
                {{ sending() ? config().sendingLabel || 'Enviando…' : config().sendLabel || 'Responder' }}
              </button>
            </form>
          } @else {
            <p class="syn-messages__placeholder">
              {{ config().detailPlaceholder || 'Selecciona una conversación para ver el hilo.' }}
            </p>
          }
        </section>
      </div>
    </div>
  `,
})
export class MessageCenterComponent<TThread> {
  // ─── Inputs ────────────────────────────────────────────────────────────────
  readonly config = input<MessageCenterConfig>({});
  readonly threads = input<readonly TThread[]>([]);
  /** The open thread (consumer-owned selection; same reference as in `threads`). */
  readonly activeThread = input<TThread | null>(null);
  readonly loading = input(false);
  /** `true` while the consumer resolves `send` against its messaging seam. */
  readonly sending = input(false);
  /** How to render one conversation-list row. */
  readonly threadTemplate = input.required<TemplateRef<MessageThreadContext<TThread>>>();
  /** How to render the active thread (header + messages). */
  readonly detailTemplate = input<TemplateRef<MessageDetailContext<TThread>> | null>(null);
  /** Optional custom loading surface; falls back to `syn-skeleton` (list). */
  readonly loadingTemplate = input<TemplateRef<unknown> | null>(null);
  /** When set, a persistent `syn-status-banner` ("datos de ejemplo") stacks on top. */
  readonly degradedMessage = input<string | undefined>(undefined);

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly threadselect = output<TThread>();
  readonly send = output<MessageSendEvent<TThread>>();
  /** Emitted when the inline error-state retry is pressed. */
  readonly retry = output<void>();
  /** Emitted when the empty-list CTA (button) is pressed. */
  readonly emptyAction = output<void>();

  readonly fieldId = `syn-messages-${(messageCenterInstanceId += 1)}`;

  // ─── State ─────────────────────────────────────────────────────────────────
  readonly composerBody = signal('');

  readonly sendDisabled = computed(() => this.sending() || this.composerBody().trim() === '');

  // ─── State surfaces (Fase 2) ────────────────────────────────────────────────
  readonly resolvedEmptyTitle = computed(() => this.config().emptyTitle ?? 'Sin conversaciones');
  readonly resolvedEmptyMessage = computed(
    () => this.config().emptyMessage ?? 'No hay conversaciones.',
  );

  // ─── Actions ───────────────────────────────────────────────────────────────
  isActive(thread: TThread): boolean {
    return this.activeThread() === thread;
  }

  selectThread(thread: TThread): void {
    if (this.isActive(thread)) {
      return;
    }
    this.composerBody.set('');
    this.threadselect.emit(thread);
  }

  onComposerInput(event: Event): void {
    this.composerBody.set((event.target as HTMLTextAreaElement | null)?.value ?? '');
  }

  onComposerSubmit(event: Event): void {
    event.preventDefault();
    const thread = this.activeThread();
    const body = this.composerBody().trim();
    if (thread === null || body === '' || this.sending()) {
      return;
    }
    this.send.emit({ thread, body });
    this.composerBody.set('');
  }

  threadContext(thread: TThread, index: number): MessageThreadContext<TThread> {
    return { $implicit: thread, index, selected: this.isActive(thread) };
  }
}
