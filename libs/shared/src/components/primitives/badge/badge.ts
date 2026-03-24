import { ChangeDetectionStrategy, Component, input } from '@angular/core';

type BadgeTone = 'neutral' | 'brand' | 'inverse';

@Component({
  selector: 'syn-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="syn-badge"
      [class.syn-badge--neutral]="tone() === 'neutral'"
      [class.syn-badge--brand]="tone() === 'brand'"
      [class.syn-badge--inverse]="tone() === 'inverse'"
      role="status"
      [attr.aria-label]="ariaLabel() || text()"
    >
      {{ text() }}
    </span>
  `,
  styleUrl: './badge.scss',
})
export class BadgeComponent {
  readonly text = input('');
  readonly ariaLabel = input('');
  readonly tone = input<BadgeTone>('neutral');
}