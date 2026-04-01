import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';

export type HeadingAlign = 'start' | 'center';
export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
export type HeadingSize = 'sm' | 'md' | 'lg' | 'xl';
export type HeadingTone = 'neutral' | 'muted' | 'brand' | 'inverse';

@Component({
  selector: 'syn-heading',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-heading" [class]="headingClass()">
      @if (eyebrow()) {
        <span class="syn-heading__eyebrow">{{ eyebrow() }}</span>
      }

      @switch (level()) {
        @case ('h1') {
          <h1 class="syn-heading__title" [class.syn-heading__title--hidden]="visuallyHidden()">
            {{ text() }}
          </h1>
        }
        @case ('h2') {
          <h2 class="syn-heading__title" [class.syn-heading__title--hidden]="visuallyHidden()">
            {{ text() }}
          </h2>
        }
        @case ('h3') {
          <h3 class="syn-heading__title" [class.syn-heading__title--hidden]="visuallyHidden()">
            {{ text() }}
          </h3>
        }
        @case ('h4') {
          <h4 class="syn-heading__title" [class.syn-heading__title--hidden]="visuallyHidden()">
            {{ text() }}
          </h4>
        }
        @case ('h5') {
          <h5 class="syn-heading__title" [class.syn-heading__title--hidden]="visuallyHidden()">
            {{ text() }}
          </h5>
        }
        @default {
          <h6 class="syn-heading__title" [class.syn-heading__title--hidden]="visuallyHidden()">
            {{ text() }}
          </h6>
        }
      }

      @if (supportingText()) {
        <p class="syn-heading__supporting">{{ supportingText() }}</p>
      }
    </div>
  `,
  styleUrl: './heading.scss',
})
export class HeadingComponent {
  readonly text = input('');
  readonly eyebrow = input('');
  readonly supportingText = input('');
  readonly level = input<HeadingLevel>('h2');
  readonly size = input<HeadingSize>('md');
  readonly tone = input<HeadingTone>('neutral');
  readonly align = input<HeadingAlign>('start');
  readonly visuallyHidden = input(false);

  headingClass(): string {
    return classNames(
      'syn-heading',
      `syn-heading--${this.size()}`,
      `syn-heading--${this.tone()}`,
      `syn-heading--${this.align()}`,
    );
  }
}
