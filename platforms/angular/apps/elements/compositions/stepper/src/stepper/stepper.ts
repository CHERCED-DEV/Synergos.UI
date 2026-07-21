import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynStepper</c>.
 *
 * A numbered progress indicator: a sequence of steps, each carrying a
 * <c>done</c> / <c>active</c> / <c>pending</c> state derived from the
 * current position. Steps render as a numbered (or check-marked) marker
 * plus title + optional description, joined by connector lines.
 *
 * The stepper can be read-only (a pure progress display) or interactive:
 * when `linear` is false (or a step is already done) the visitor may click
 * a step to jump to it, emitting a `stepchange` CustomEvent with the new
 * index and step id. Keyboard navigation (arrows / Home / End / Enter)
 * follows the tablist roving-tabindex pattern.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface StepperRuntimeConfig {
  readonly steps?: readonly StepperStepConfig[];
  readonly currentStep?: number;
  readonly orientation?: string;
  readonly linear?: boolean;
}

export interface StepperStepConfig {
  readonly id?: string;
  readonly title?: string;
  readonly description?: string;
}

export type StepperStatus = 'done' | 'active' | 'pending';
export type StepperOrientation = 'horizontal' | 'vertical';

export interface StepperStep {
  readonly id: string;
  readonly index: number;
  readonly displayNumber: number;
  readonly title: string;
  readonly description: string;
  readonly status: StepperStatus;
  readonly first: boolean;
  readonly last: boolean;
}

/** Emitted on the `stepchange` CustomEvent and the typed Angular output. */
export interface StepperChangeDetail {
  readonly index: number;
  readonly id: string;
}

const ORIENTATIONS: readonly StepperOrientation[] = ['horizontal', 'vertical'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function readInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

function normalizeOrientation(value: unknown): StepperOrientation {
  const candidate = readString(value).trim().toLowerCase() as StepperOrientation;
  return ORIENTATIONS.includes(candidate) ? candidate : 'horizontal';
}

/** Parse raw step entries into a clean, titled list (untitled steps dropped). */
export function normalizeSteps(value: unknown): readonly StepperStepConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index): StepperStepConfig | null => {
      if (typeof entry === 'string') {
        const title = entry.trim();
        return title ? { title } : null;
      }

      if (!isRecord(entry)) {
        return null;
      }

      const title = readString(entry['title']).trim() || readString(entry['label']).trim();
      if (!title) {
        return null;
      }

      return {
        id: readString(entry['id']).trim() || `step-${index}`,
        title,
        description: readString(entry['description']).trim(),
      };
    })
    .filter((step): step is StepperStepConfig => step !== null);
}

function sanitizeStepperConfig(value: Partial<StepperRuntimeConfig>): StepperRuntimeConfig {
  return omitUndefinedProperties<StepperRuntimeConfig>({
    steps: value.steps,
    currentStep: typeof value.currentStep === 'number' ? value.currentStep : undefined,
    orientation: coerceTrimmedStringInput(value.orientation),
    linear: coerceOptionalBooleanInput(value.linear),
  });
}

@Component({
  selector: 'sg-stepper',
  standalone: true,
  templateUrl: './stepper.html',
  styleUrl: './stepper.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-stepper',
    '[attr.data-orientation]': 'orientation()',
  },
})
export class StepperElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<StepperRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<StepperRuntimeConfig>(sanitizeStepperConfig),
  });
  readonly stepsInput = input<string | undefined>(undefined, { alias: 'steps' });
  readonly currentStepInput = input<string | undefined>(undefined, { alias: 'currentStep' });
  readonly orientationInput = input<string | undefined>(undefined, { alias: 'orientation' });
  readonly linearInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'linear',
    transform: coerceOptionalBooleanInput,
  });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `stepchange` CustomEvent. */
  readonly stepchange = output<StepperChangeDetail>();

  readonly orientation = computed<StepperOrientation>(() =>
    normalizeOrientation(
      resolveConfigValue(this.orientationInput(), this.config()?.orientation, 'horizontal'),
    ),
  );

  /** Linear steppers forbid jumping past pending steps. Defaults to true. */
  readonly linear = computed(() =>
    resolveConfigValue(this.linearInput(), this.config()?.linear, true),
  );

  readonly steps = computed<readonly StepperStepConfig[]>(() =>
    normalizeSteps(this.resolveSource(this.stepsInput(), this.config()?.steps)),
  );

  readonly stepCount = computed(() => this.steps().length);
  readonly hasSteps = computed(() => this.stepCount() > 0);

  /** Active index resolved from inputs, clamped to the available range. */
  readonly #configCurrent = computed(() => {
    const raw = resolveConfigValue<number | string | undefined>(
      this.currentStepInput(),
      this.config()?.currentStep,
      0,
    );
    return readInteger(raw) ?? 0;
  });

  /** Live active index; seeded from config, then driven by interaction. */
  readonly #activeIndex = signal(0);

  /** Index holding keyboard focus inside the tablist (roving tabindex). */
  readonly #focusedIndex = signal(0);

  readonly activeIndex = computed(() => this.clampIndex(this.#activeIndex()));

  readonly focusedIndex = computed(() => {
    const count = this.stepCount();
    if (count === 0) {
      return 0;
    }
    const focused = this.#focusedIndex();
    if (focused >= 0 && focused < count) {
      return focused;
    }
    return this.activeIndex();
  });

  /** Resolved steps decorated with derived status + position metadata. */
  readonly resolvedSteps = computed<readonly StepperStep[]>(() => {
    const active = this.activeIndex();
    const last = this.stepCount() - 1;
    return this.steps().map((step, index): StepperStep => {
      let status: StepperStatus = 'pending';
      if (index < active) {
        status = 'done';
      } else if (index === active) {
        status = 'active';
      }

      return {
        id: step.id ?? `step-${index}`,
        index,
        displayNumber: index + 1,
        title: step.title ?? '',
        description: step.description ?? '',
        status,
        first: index === 0,
        last: index === last,
      };
    });
  });

  readonly completedCount = computed(() => this.activeIndex());

  /** Accessible progress summary, e.g. "Paso 2 de 4". */
  readonly progressLabel = computed(() => {
    if (!this.hasSteps()) {
      return '';
    }
    return `Paso ${this.activeIndex() + 1} de ${this.stepCount()}`;
  });

  constructor() {
    // Re-seed the active index whenever the configured step changes.
    effect(() => {
      this.#activeIndex.set(this.clampIndex(this.#configCurrent()));
    });
  }

  /** True when the visitor is allowed to jump to the given step. */
  isReachable(step: StepperStep): boolean {
    if (!this.linear()) {
      return true;
    }
    // Linear: only already-completed steps and the active step are reachable.
    return step.index <= this.activeIndex();
  }

  goToStep(step: StepperStep): void {
    if (!this.isReachable(step) || step.index === this.activeIndex()) {
      this.#focusedIndex.set(step.index);
      return;
    }

    this.#activeIndex.set(step.index);
    this.#focusedIndex.set(step.index);
    this.stepchange.emit({ index: step.index, id: step.id });
  }

  onStepKeydown(event: KeyboardEvent, step: StepperStep): void {
    const lastIndex = this.stepCount() - 1;
    const next = step.index + 1;
    const prev = step.index - 1;

    const handlers: Record<string, () => void> = {
      ArrowRight: () => this.moveFocus(next),
      ArrowDown: () => this.moveFocus(next),
      ArrowLeft: () => this.moveFocus(prev),
      ArrowUp: () => this.moveFocus(prev),
      Home: () => this.moveFocus(0),
      End: () => this.moveFocus(lastIndex),
      Enter: () => this.goToStep(step),
      ' ': () => this.goToStep(step),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  private moveFocus(targetIndex: number): void {
    const clamped = this.clampIndex(targetIndex);
    this.#focusedIndex.set(clamped);
    this.focusStep(clamped);
  }

  private focusStep(index: number): void {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const host = document.querySelector('sg-stepper, synergos-stepper');
      const root = host?.shadowRoot ?? document;
      const target = (root as ParentNode).querySelector<HTMLElement>(
        `[data-step-index="${index}"]`,
      );
      target?.focus();
    });
  }

  private clampIndex(index: number): number {
    const count = this.stepCount();
    if (count === 0) {
      return 0;
    }
    if (index < 0) {
      return 0;
    }
    if (index > count - 1) {
      return count - 1;
    }
    return index;
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
