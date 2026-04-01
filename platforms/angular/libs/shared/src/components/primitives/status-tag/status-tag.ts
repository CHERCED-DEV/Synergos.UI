import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';

export type StatusTagStyle = 'outline' | 'filled';
export type StatusTagTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'critical'
  | 'pending'
  | 'inactive'
  | 'blocked';

@Component({
  selector: 'syn-status-tag',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="syn-status-tag" [class]="tagClass()" role="status">
      {{ label() }}
    </span>
  `,
  styleUrl: './status-tag.scss',
})
export class StatusTagComponent {
  readonly label = input('');
  readonly tone = input<StatusTagTone>('neutral');
  readonly style = input<StatusTagStyle>('outline');

  tagClass(): string {
    return classNames(
      'syn-status-tag',
      `syn-status-tag--${this.tone()}`,
      `syn-status-tag--${this.style()}`,
    );
  }
}
