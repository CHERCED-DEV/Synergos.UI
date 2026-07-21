import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';

export type LiveRegionTone = 'neutral' | 'brand';

@Component({
  selector: 'syn-live-region',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="syn-live-region"
      [class]="regionClass()"
      role="status"
      [attr.aria-live]="politeness()"
      [attr.aria-atomic]="atomic()"
    >
      {{ message() }}
    </span>
  `,
  styleUrl: './live-region.scss',
})
export class LiveRegionComponent {
  readonly message = input('');
  readonly politeness = input<'polite' | 'assertive'>('polite');
  readonly atomic = input(true);
  readonly visuallyHidden = input(true);
  readonly tone = input<LiveRegionTone>('neutral');

  regionClass(): string {
    return classNames(
      'syn-live-region',
      `syn-live-region--${this.tone()}`,
      this.visuallyHidden() && 'syn-live-region--hidden',
    );
  }
}
