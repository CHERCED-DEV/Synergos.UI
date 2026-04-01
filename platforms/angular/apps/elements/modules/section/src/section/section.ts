import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  HeadingComponent,
  type HeadingAlign,
  type HeadingLevel,
  type HeadingTone,
} from '@synergos/shared';

const sectionHeadingLevels: readonly HeadingLevel[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

function resolveSectionHeadingLevel(value: string): HeadingLevel {
  return sectionHeadingLevels.includes(value as HeadingLevel) ? (value as HeadingLevel) : 'h2';
}

@Component({
  selector: 'sg-section',
  templateUrl: './section.html',
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle, HeadingComponent],
  host: { class: 'sg-section' },
})
export class SectionComponent {
  readonly headingText = input<string>('');
  readonly headingLevel = input<string>('h2');
  readonly containerType = input<string>('fluid');
  readonly alignment = input<string>('start');
  readonly direction = input<string>('column');
  readonly margin = input<string>('');
  readonly padding = input<string>('');
  readonly gap = input<string>('1rem');
  readonly variant = input<string>('default');
  readonly theme = input<string>('light');

  readonly hasHeading = computed(() => this.headingText().trim().length > 0);
  readonly resolvedHeadingLevel = computed<HeadingLevel>(() =>
    resolveSectionHeadingLevel(this.headingLevel()),
  );
  readonly headingAlign = computed<HeadingAlign>(() =>
    this.alignment() === 'center' ? 'center' : 'start',
  );
  readonly headingTone = computed<HeadingTone>(() =>
    this.theme() === 'dark' ? 'inverse' : 'neutral',
  );
  readonly hostClasses = computed(
    () => `sg-section--${this.variant()} sg-section--${this.theme()} sg-section--${this.containerType()}`,
  );
  readonly containerStyles = computed(() => ({
    'align-items': this.alignment(),
    'flex-direction': this.direction(),
    gap: this.gap(),
    margin: this.margin() || null,
    padding: this.padding() || null,
  }));
}
