import { computed, signal } from '@angular/core';
import { JOURNEY_STEPS } from '../domain/journey.domain';
import type { JourneyStep } from '../domain/models/journey-step.model';

export class JourneyState {
  readonly steps = signal<readonly JourneyStep[]>(JOURNEY_STEPS);
  readonly activeIndex = signal(0);

  readonly activeStep = computed(() => this.steps()[this.activeIndex()]);
  readonly isFirst = computed(() => this.activeIndex() === 0);
  readonly isLast = computed(() => this.activeIndex() === this.steps().length - 1);
  readonly progress = computed(() => ({
    current: this.activeIndex() + 1,
    total: this.steps().length,
  }));
}
