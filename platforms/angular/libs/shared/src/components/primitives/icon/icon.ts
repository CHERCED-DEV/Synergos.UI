import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';

export type IconSize = 'sm' | 'md' | 'lg';
export type IconTone = 'neutral' | 'brand' | 'inverse';

@Component({
  selector: 'syn-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="syn-icon"
      [class]="iconClass()"
      [attr.role]="decorative() ? null : 'img'"
      [attr.aria-label]="decorative() ? null : label() || name() || symbol() || null"
      [attr.aria-hidden]="decorative() ? 'true' : null"
    >
      {{ symbol() || name() }}
    </span>
  `,
  styleUrl: './icon.scss',
})
export class IconComponent {
  readonly name = input('');
  readonly symbol = input('');
  readonly label = input('');
  readonly size = input<IconSize>('md');
  readonly tone = input<IconTone>('neutral');
  readonly decorative = input(true);

  iconClass(): string {
    return classNames('syn-icon', `syn-icon--${this.size()}`, `syn-icon--${this.tone()}`);
  }
}
