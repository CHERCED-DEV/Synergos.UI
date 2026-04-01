import type { JourneyState } from '../journey.state';

export function nextStep(state: JourneyState): void {
  if (!state.isLast()) {
    state.activeIndex.update((i) => i + 1);
  }
}

export function prevStep(state: JourneyState): void {
  if (!state.isFirst()) {
    state.activeIndex.update((i) => i - 1);
  }
}

export function goToStep(state: JourneyState, index: number): void {
  const max = state.steps().length - 1;
  if (index >= 0 && index <= max) {
    state.activeIndex.set(index);
  }
}
