import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

type ButtonVariant = 'solid' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'syn-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      class="syn-button"
      [class.syn-button--solid]="variant() === 'solid'"
      [class.syn-button--outline]="variant() === 'outline'"
      [class.syn-button--ghost]="variant() === 'ghost'"
      [class.syn-button--sm]="size() === 'sm'"
      [class.syn-button--md]="size() === 'md'"
      [class.syn-button--lg]="size() === 'lg'"
      [type]="type()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel() || label() || null"
      (click)="onClick($event)"
    >
      @if (label()) {
        <span>{{ label() }}</span>
      } @else {
        <ng-content />
      }
    </button>
  `,
  styleUrl: './button.scss',
})
export class ButtonComponent {
  readonly label = input('');
  readonly ariaLabel = input('');
  readonly variant = input<ButtonVariant>('solid');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input(false);

  readonly pressed = output<MouseEvent>();

  onClick(event: MouseEvent): void {
    if (this.disabled()) {
      event.preventDefault();
      return;
    }

    this.pressed.emit(event);
  }
}