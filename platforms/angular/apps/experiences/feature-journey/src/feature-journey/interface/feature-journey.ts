import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  ButtonComponent,
  HeadingComponent,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';
import { JourneyState } from '../application/journey.state';
import { nextStep, prevStep, goToStep } from '../application/use-cases/navigate-step';
import type { FeatureJourneyConfig } from '../infrastructure/feature-journey.config';

@Component({
  selector: 'sg-feature-journey',
  imports: [ButtonComponent, HeadingComponent],
  templateUrl: './feature-journey.html',
  styleUrl: './feature-journey.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-feature-journey' },
})
export class FeatureJourneyComponent {
  readonly #state = new JourneyState();

  readonly configInput = input<Partial<FeatureJourneyConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<FeatureJourneyConfig>,
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly elementIdInput = input<string | undefined>(undefined, { alias: 'elementId' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.configInput()?.title, ''),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'default'),
  );
  readonly elementId = computed(() =>
    resolveConfigValue(this.elementIdInput(), this.configInput()?.elementId, ''),
  );

  readonly steps = this.#state.steps;
  readonly activeIndex = this.#state.activeIndex;
  readonly activeStep = this.#state.activeStep;
  readonly isFirst = this.#state.isFirst;
  readonly isLast = this.#state.isLast;
  readonly progress = this.#state.progress;

  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () => `sg-feature-journey--${this.variant()} sg-feature-journey--${this.theme()}`,
  );

  next(): void { nextStep(this.#state); }
  prev(): void { prevStep(this.#state); }
  goToStep(index: number): void { goToStep(this.#state, index); }
}
