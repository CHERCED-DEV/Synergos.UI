import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FocusVisibleDirective } from '../../../directives/focus-visible.directive';
import { classNames } from '../../../utils/class-names.util';

type LinkTone = 'brand' | 'neutral' | 'inverse';

@Component({
  selector: 'syn-link',
  standalone: true,
  imports: [FocusVisibleDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (href()) {
      <a
        synFocusVisible
        class="syn-link"
        [class]="linkClass()"
        [href]="disabled() ? null : href()"
        [target]="target() || null"
        [rel]="resolvedRel() || null"
        [attr.aria-label]="ariaLabel() || label() || null"
        [attr.aria-disabled]="disabled() ? 'true' : null"
        [attr.tabindex]="disabled() ? -1 : null"
        (click)="onActivate($event)"
      >
        @if (label()) {
          {{ label() }}
        } @else {
          <ng-content />
        }
      </a>
    } @else {
      <button
        synFocusVisible
        type="button"
        class="syn-link syn-link--button"
        [class]="linkClass()"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel() || label() || null"
        (click)="onActivate($event)"
      >
        @if (label()) {
          {{ label() }}
        } @else {
          <ng-content />
        }
      </button>
    }
  `,
  styleUrl: './link.scss',
})
export class LinkComponent {
  readonly href = input('');
  readonly label = input('');
  readonly ariaLabel = input('');
  readonly tone = input<LinkTone>('brand');
  readonly underline = input(true);
  readonly target = input('');
  readonly rel = input('');
  readonly disabled = input(false);

  readonly activated = output<MouseEvent>();

  readonly resolvedRel = computed(() => {
    if (this.rel()) {
      return this.rel();
    }

    return this.target() === '_blank' ? 'noopener noreferrer' : '';
  });

  readonly linkClass = computed(() =>
    classNames(
      'syn-link',
      `syn-link--${this.tone()}`,
      this.underline() && 'syn-link--underline',
      this.disabled() && 'syn-link--disabled',
    ),
  );

  onActivate(event: MouseEvent): void {
    if (this.disabled()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.activated.emit(event);
  }
}
