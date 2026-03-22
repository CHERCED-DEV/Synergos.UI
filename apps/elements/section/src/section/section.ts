import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import { LoggerService } from '@synergos/core';

@Component({
  selector: 'sg-section',
  templateUrl: './section.html',
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle],
  host: { class: 'sg-section' },
})
export class SectionComponent {
  readonly #logger = inject(LoggerService);

  // ── Inputs ────────────────────────────────────────────────────────────────
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

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hasHeading = computed(() => !!this.headingText());
  readonly hostClasses = computed(
    () => `sg-section--${this.variant()} sg-section--${this.theme()} sg-section--${this.containerType()}`
  );
  readonly containerStyles = computed(() => ({
    'align-items': this.alignment(),
    'flex-direction': this.direction(),
    gap: this.gap(),
    margin: this.margin() || null,
    padding: this.padding() || null,
  }));

  constructor() {
    effect(() => {
      this.#logger.debug('[synergos-section] inputs', {
        headingText: this.headingText(),
        containerType: this.containerType(),
        variant: this.variant(),
      });
    });
  }
}
