import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * `syn-empty-state` — the empty surface, differentiated by cause (doc 22 §6,
 * item 3). A single "No hay registros" is an anti-pattern: the empty surface is
 * a **state of the ViewState contract**, and *why* it is empty changes the copy
 * and the CTA. Three canonical kinds:
 *
 *  - `first-use`  → onboarding; nothing exists yet → CTA to **create** the first one.
 *  - `no-results` → filters/search excluded everything → echo the criteria in
 *                   `message` + a "Limpiar filtros" CTA.
 *  - `no-access`  → the viewer lacks permission → explain, no create CTA.
 *
 * Domain-free: copy (title / message / actionLabel) comes in as inputs (Fase 2
 * wires them from the es-CO Dictionary). A11y: a real `<h2>` heading carries the
 * meaning (never colour alone); the icon is decorative (`aria-hidden`).
 */
export type EmptyStateKind = 'first-use' | 'no-results' | 'no-access';

const DEFAULT_ICON: Record<EmptyStateKind, string> = {
  'first-use': '✨',
  'no-results': '🔍',
  'no-access': '🔒',
};

@Component({
  selector: 'syn-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'syn-empty-state',
    '[attr.data-kind]': 'kind()',
  },
  styleUrl: './empty-state.scss',
  template: `
    <div class="syn-empty">
      <span class="syn-empty__icon" aria-hidden="true">{{ resolvedIcon() }}</span>
      <h2 class="syn-empty__title">{{ title() }}</h2>
      @if (message()) {
        <p class="syn-empty__message">{{ message() }}</p>
      }
      @if (actionLabel(); as label) {
        @if (actionHref(); as href) {
          <a class="syn-empty__action" [href]="href">{{ label }}</a>
        } @else {
          <button type="button" class="syn-empty__action" (click)="action.emit()">
            {{ label }}
          </button>
        }
      }
    </div>
  `,
})
export class SynEmptyStateComponent {
  /** Why the surface is empty — drives the default icon and the intended CTA. */
  readonly kind = input<EmptyStateKind>('no-results');
  /** Decorative glyph/emoji. Falls back to a per-kind default. */
  readonly icon = input<string>();
  /** Required heading — the meaning of the empty state (not colour alone). */
  readonly title = input.required<string>();
  /** Supporting copy — e.g. the echoed search criteria for `no-results`. */
  readonly message = input<string>();
  /** CTA label. When absent, no CTA renders. */
  readonly actionLabel = input<string>();
  /** When set, the CTA is a link (`<a href>`); otherwise it is a button that
   *  emits `action`. */
  readonly actionHref = input<string>();

  /** Emitted when the (button) CTA is pressed — e.g. "crear" or "limpiar filtros". */
  readonly action = output<void>();

  readonly resolvedIcon = computed(() => this.icon() ?? DEFAULT_ICON[this.kind()]);
}
