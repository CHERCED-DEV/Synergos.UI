import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ButtonComponent } from '../../primitives/button/button';
import { classNames } from '../../../utils/class-names.util';

export type EmptyStateAlign = 'start' | 'center';
export type EmptyStateTone = 'neutral' | 'brand';

@Component({
  selector: 'syn-empty-state',
  standalone: true,
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="syn-empty-state" [class]="emptyStateClass()">
      <div class="syn-empty-state__visual">
        <ng-content select="[synEmptyStateVisual]" />
      </div>

      <div class="syn-empty-state__body">
        @if (eyebrow()) {
          <span class="syn-empty-state__eyebrow">{{ eyebrow() }}</span>
        }

        @if (title()) {
          <h3 class="syn-empty-state__title">{{ title() }}</h3>
        }

        @if (description()) {
          <p class="syn-empty-state__description">{{ description() }}</p>
        }

        @if (actionLabel() || secondaryActionLabel()) {
          <div class="syn-empty-state__actions">
            @if (actionLabel()) {
              <syn-button [label]="actionLabel()" (pressed)="action.emit()" />
            }

            @if (secondaryActionLabel()) {
              <syn-button
                variant="ghost"
                [label]="secondaryActionLabel()"
                (pressed)="secondaryAction.emit()"
              />
            }
          </div>
        }
      </div>
    </section>
  `,
  styleUrl: './empty-state.scss',
})
export class EmptyStateComponent {
  readonly eyebrow = input('');
  readonly title = input('');
  readonly description = input('');
  readonly actionLabel = input('');
  readonly secondaryActionLabel = input('');
  readonly align = input<EmptyStateAlign>('center');
  readonly tone = input<EmptyStateTone>('neutral');

  readonly action = output<void>();
  readonly secondaryAction = output<void>();

  readonly emptyStateClass = computed(() =>
    classNames(
      'syn-empty-state',
      `syn-empty-state--${this.align()}`,
      `syn-empty-state--${this.tone()}`,
    ),
  );
}
