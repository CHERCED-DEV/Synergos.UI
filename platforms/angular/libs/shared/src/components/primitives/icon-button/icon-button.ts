import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent, type IconSize } from '../icon/icon';
import { trazosDeIcono } from '../icon/icon-set';

type IconButtonVariant = 'filled' | 'outline' | 'ghost' | 'danger';
type IconButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'syn-icon-button',
  standalone: true,
  imports: [IconComponent],
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
      [class.syn-icon-button--selected]="selected() === true"
      [disabled]="disabled()"
      [type]="type()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-pressed]="selected() ?? null"
      (click)="onClick($event)"
    >
      <!-- Un nombre del set se pinta en SVG (014-despiece-tienda, T003); otro texto, como glifo, como siempre. -->
      @if (delSet()) {
        <syn-icon class="syn-icon-button__icon" [name]="icon()" [size]="iconSize()" />
      } @else {
        <span class="syn-icon-button__icon" aria-hidden="true">{{ icon() }}</span>
      }
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
  /** A toggle's state (a favourite): `aria-pressed` and the selected look. Undefined = not a toggle. */
  readonly selected = input<boolean | undefined>(undefined);

  readonly pressed = output<MouseEvent>();

  readonly delSet = computed(() => trazosDeIcono(this.icon()) !== null);
  readonly iconSize = computed<IconSize>(() => this.size());

  onClick(event: MouseEvent): void {
    if (this.disabled()) {
      event.preventDefault();
      return;
    }

    this.pressed.emit(event);
  }
}
