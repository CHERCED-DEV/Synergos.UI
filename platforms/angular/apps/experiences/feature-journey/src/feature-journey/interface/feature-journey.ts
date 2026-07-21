import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ComponentTranslations } from '@synergos/contracts';
import {
  ButtonComponent,
  HeadingComponent,
  type HeadingTone,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';
import { JourneyState } from '../application/journey.state';
import { nextStep, prevStep, goToStep } from '../application/use-cases/navigate-step';
import type { FeatureJourneyConfig } from '../infrastructure/feature-journey.config';

function sanitizeFeatureJourneyConfig(
  value: Partial<FeatureJourneyConfig>,
): Partial<FeatureJourneyConfig> {
  return omitUndefinedProperties<Partial<FeatureJourneyConfig>>({
    title: coerceTrimmedStringInput(value.title),
    theme: coerceTrimmedStringInput(value.theme),
    variant: coerceTrimmedStringInput(value.variant),
    elementId: coerceTrimmedStringInput(value.elementId),
    translations: coerceStringRecordInput(value.translations),
  });
}

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

  readonly config = input<Partial<FeatureJourneyConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<FeatureJourneyConfig>(sanitizeFeatureJourneyConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly elementIdInput = input<string | undefined>(undefined, { alias: 'elementId' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly elementId = computed(() =>
    resolveConfigValue(this.elementIdInput(), this.config()?.elementId, ''),
  );

  readonly steps = this.#state.steps;
  readonly activeIndex = this.#state.activeIndex;
  readonly activeStep = this.#state.activeStep;
  readonly isFirst = this.#state.isFirst;
  readonly isLast = this.#state.isLast;
  readonly progress = this.#state.progress;
  readonly translations = computed<ComponentTranslations>(() => this.config()?.translations ?? {});

  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () => `sg-feature-journey--${this.variant()} sg-feature-journey--${this.theme()}`,
  );
  readonly stepsAriaLabel = computed(() => this.translations()['stepsAriaLabel'] ?? 'Journey steps');
  readonly contentAriaLabel = computed(() => this.translations()['contentAriaLabel'] ?? 'Step content');
  readonly previousLabel = computed(() => this.translations()['previousLabel'] ?? 'Previous');
  readonly nextLabel = computed(() => this.translations()['nextLabel'] ?? 'Next');

  next(): void { nextStep(this.#state); }
  prev(): void { prevStep(this.#state); }
  goToStep(index: number): void { goToStep(this.#state, index); }
}
