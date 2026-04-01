import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'syn-visually-hidden',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styleUrl: './visually-hidden.scss',
  host: {
    class: 'syn-visually-hidden',
    '[class.syn-visually-hidden--focusable]': 'focusable()',
  },
})
export class VisuallyHiddenComponent {
  readonly focusable = input(false);
}
