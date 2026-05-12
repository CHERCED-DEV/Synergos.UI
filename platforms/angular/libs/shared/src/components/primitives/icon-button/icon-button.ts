import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

type IconButtonVariant = 'filled' | 'outline' | 'ghost' | 'danger';
type IconButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'syn-icon-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      class="syn-icon-button"
      [class.syn-icon-button--filled]="variant() === 'filled'"
      [class.syn-icon-button--outline]="variant() === 'outline'"
      [class.syn-icon-button--ghost]="variant() === 'ghost'"
      [class.syn-icon-button--danger]="variant() === 'danger'"
      [class.syn-icon-button--sm]="size() === 'sm'"
      [class.syn-icon-button--lg]="size() === 'lg'"
      [disabled]="disabled()"
      [type]="type()"
      [attr.aria-label]="ariaLabel()"
      (click)="onClick($event)"
    >
      <span class="syn-icon-button__icon" aria-hidden="true">{{ icon() }}</span>
    </button>
  `,
  styleUrl: './icon-button.scss',
})
export class IconButtonComponent {
  readonly icon = input.required<string>();
  readonly ariaLabel = input.required<string>();
  readonly disabled = input(false);
  readonly variant = input<IconButtonVariant>('filled');
  readonly size = input<IconButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');

  readonly pressed = output<MouseEvent>();

  onClick(event: MouseEvent): void {
    if (this.disabled()) {
      event.preventDefault();
      return;
    }

    this.pressed.emit(event);
  }
}
