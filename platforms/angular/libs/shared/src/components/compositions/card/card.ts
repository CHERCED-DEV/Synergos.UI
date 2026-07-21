import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'syn-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="syn-card"
      [class.syn-card--interactive]="interactive()"
      [attr.role]="interactive() ? 'button' : 'article'"
      [attr.tabindex]="interactive() ? 0 : null"
      [attr.aria-label]="ariaLabel() || title() || null"
      (click)="onActivate()"
      (keydown)="onKeydown($event)"
    >
      @if (title()) {
        <header class="syn-card__header">
          <h3 class="syn-card__title">{{ title() }}</h3>
          @if (subtitle()) {
            <p class="syn-card__subtitle">{{ subtitle() }}</p>
          }
        </header>
      }

      <div class="syn-card__body">
        <ng-content />
      </div>
    </article>
  `,
  styleUrl: './card.scss',
})
export class CardComponent {
  readonly title = input('');
  readonly subtitle = input('');
  readonly ariaLabel = input('');
  readonly interactive = input(false);

  readonly selected = output<void>();

  onActivate(): void {
    if (!this.interactive()) {
      return;
    }

    this.selected.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.interactive()) {
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    this.selected.emit();
  }
}