import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

let tooltipId = 0;

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

@Component({
  selector: 'syn-tooltip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="syn-tooltip"
      tabindex="0"
      [attr.aria-describedby]="visible() ? id : null"
      (mouseenter)="show()"
      (mouseleave)="hide()"
      (focus)="show()"
      (blur)="hide()"
      (keydown)="onKeydown($event)"
    >
      <ng-content />

      @if (visible()) {
        <span
          class="syn-tooltip__bubble"
          [class.syn-tooltip__bubble--top]="position() === 'top'"
          [class.syn-tooltip__bubble--bottom]="position() === 'bottom'"
          [class.syn-tooltip__bubble--left]="position() === 'left'"
          [class.syn-tooltip__bubble--right]="position() === 'right'"
          [id]="id"
          role="tooltip"
        >
          {{ text() }}
        </span>
      }
    </span>
  `,
  styleUrl: './tooltip.scss',
})
export class TooltipComponent {
  readonly text = input.required<string>();
  readonly position = input<TooltipPosition>('top');

  readonly visible = signal(false);

  readonly id = `syn-tooltip-${tooltipId}`;

  constructor() {
    tooltipId += 1;
  }

  show(): void {
    this.visible.set(true);
  }

  hide(): void {
    this.visible.set(false);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.hide();
    }
  }
}