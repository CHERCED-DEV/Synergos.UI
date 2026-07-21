import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
 * Runtime config for the CMS element <c>elementSynTourGuide</c>.
 *
 * A guided product tour: an ordered list of steps, each one spotlighting a
 * target element on the page (matched by CSS selector) with a dimmed overlay
 * and an anchored popover carrying a title + body and next / previous / skip
 * controls. Built to onboard visitors through a vertical (Eventos, Booking,
 * Propiedades) without leaving the page.
 *
 * The tour can auto-start on mount (`autoStart`) or be triggered later via the
 * public `start()` method / a `tour:start` CustomEvent the host dispatches.
 * Progress and lifecycle are broadcast as `tourstep`, `tourcomplete` and
 * `tourskip` CustomEvents plus mirrored typed Angular outputs.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface TourGuideRuntimeConfig {
  readonly steps?: readonly TourStepConfig[];
  readonly autoStart?: boolean;
  readonly nextLabel?: string;
  readonly previousLabel?: string;
  readonly skipLabel?: string;
  readonly doneLabel?: string;
}

export interface TourStepConfig {
  readonly target?: string;
  readonly title?: string;
  readonly body?: string;
  readonly placement?: string;
}

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'auto';

export interface TourStep {
  readonly id: string;
  readonly target: string;
  readonly title: string;
  readonly body: string;
  readonly placement: TourPlacement;
}

/** Emitted on the `tourstep` CustomEvent and the typed Angular output. */
export interface TourStepDetail {
  readonly index: number;
  readonly total: number;
  readonly step: TourStep;
}

/** Emitted on `tourcomplete` / `tourskip`. */
export interface TourLifecycleDetail {
  readonly total: number;
  readonly lastIndex: number;
}

const PLACEMENTS: readonly TourPlacement[] = ['top', 'bottom', 'left', 'right', 'auto'];

const DEFAULT_NEXT_LABEL = 'Siguiente';
const DEFAULT_PREVIOUS_LABEL = 'Anterior';
const DEFAULT_SKIP_LABEL = 'Saltar';
const DEFAULT_DONE_LABEL = 'Finalizar';

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

function normalizePlacement(value: unknown): TourPlacement {
  const candidate = readString(value).trim().toLowerCase() as TourPlacement;
  return PLACEMENTS.includes(candidate) ? candidate : 'auto';
}

export function normalizeSteps(value: unknown): readonly TourStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index): TourStep | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const title = readString(entry['title']).trim();
      const body = readString(entry['body']).trim() || readString(entry['text']).trim();
      // A step needs at least something to show; a target is optional (a
      // centered "welcome" step is valid with no spotlight).
      if (!title && !body) {
        return null;
      }

      return {
        id: `step-${index}`,
        target: readString(entry['target']).trim() || readString(entry['selector']).trim(),
        title,
        body,
        placement: normalizePlacement(entry['placement']),
      };
    })
    .filter((step): step is TourStep => step !== null);
}

function sanitizeTourGuideConfig(value: Partial<TourGuideRuntimeConfig>): TourGuideRuntimeConfig {
  return omitUndefinedProperties<TourGuideRuntimeConfig>({
    steps: value.steps,
    autoStart: coerceOptionalBooleanInput(value.autoStart),
    nextLabel: coerceTrimmedStringInput(value.nextLabel),
    previousLabel: coerceTrimmedStringInput(value.previousLabel),
    skipLabel: coerceTrimmedStringInput(value.skipLabel),
    doneLabel: coerceTrimmedStringInput(value.doneLabel),
  });
}

interface SpotlightRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

@Component({
  selector: 'sg-tour-guide',
  standalone: true,
  templateUrl: './tour-guide.html',
  styleUrl: './tour-guide.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-tour-guide' },
})
export class TourGuideElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<TourGuideRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<TourGuideRuntimeConfig>(sanitizeTourGuideConfig),
  });
  readonly stepsInput = input<string | undefined>(undefined, { alias: 'steps' });
  // The scaffold exposed `stepsJson`; keep it as a backwards-compatible alias.
  readonly stepsJsonInput = input<string | undefined>(undefined, { alias: 'stepsJson' });
  readonly autoStartInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'autoStart',
    transform: coerceOptionalBooleanInput,
  });
  readonly nextLabelInput = input<string | undefined>(undefined, { alias: 'nextLabel' });
  readonly previousLabelInput = input<string | undefined>(undefined, { alias: 'previousLabel' });
  readonly skipLabelInput = input<string | undefined>(undefined, { alias: 'skipLabel' });
  readonly doneLabelInput = input<string | undefined>(undefined, { alias: 'doneLabel' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular outputs mirroring the native CustomEvents. */
  readonly tourstep = output<TourStepDetail>();
  readonly tourcomplete = output<TourLifecycleDetail>();
  readonly tourskip = output<TourLifecycleDetail>();

  readonly steps = computed<readonly TourStep[]>(() =>
    normalizeSteps(
      this.resolveSource(this.stepsInput() ?? this.stepsJsonInput(), this.config()?.steps),
    ),
  );

  readonly autoStart = computed(() =>
    resolveConfigValue(this.autoStartInput(), this.config()?.autoStart, false),
  );

  readonly nextLabel = computed(() =>
    resolveConfigValue(this.nextLabelInput(), this.config()?.nextLabel, DEFAULT_NEXT_LABEL),
  );
  readonly previousLabel = computed(() =>
    resolveConfigValue(this.previousLabelInput(), this.config()?.previousLabel, DEFAULT_PREVIOUS_LABEL),
  );
  readonly skipLabel = computed(() =>
    resolveConfigValue(this.skipLabelInput(), this.config()?.skipLabel, DEFAULT_SKIP_LABEL),
  );
  readonly doneLabel = computed(() =>
    resolveConfigValue(this.doneLabelInput(), this.config()?.doneLabel, DEFAULT_DONE_LABEL),
  );

  readonly hasSteps = computed(() => this.steps().length > 0);
  readonly total = computed(() => this.steps().length);

  /** -1 = tour inactive; otherwise the active step index. */
  readonly #activeIndex = signal<number>(-1);
  readonly activeIndex = this.#activeIndex.asReadonly();
  readonly isActive = computed(() => this.#activeIndex() >= 0);

  readonly currentStep = computed<TourStep | null>(() => {
    const index = this.#activeIndex();
    const steps = this.steps();
    return index >= 0 && index < steps.length ? steps[index] : null;
  });

  readonly isFirst = computed(() => this.#activeIndex() <= 0);
  readonly isLast = computed(() => this.#activeIndex() >= this.total() - 1);

  /** Bounding box of the spotlighted target, recomputed per step / resize. */
  readonly spotlight = signal<SpotlightRect | null>(null);

  /** Resolved placement of the popover for the current step. */
  readonly resolvedPlacement = computed<Exclude<TourPlacement, 'auto'>>(() => {
    const step = this.currentStep();
    const rect = this.spotlight();
    if (!step || !rect) {
      return 'bottom';
    }
    if (step.placement !== 'auto') {
      return step.placement;
    }
    // Auto: prefer below the target unless it sits in the lower half.
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    return rect.top + rect.height / 2 > viewportHeight / 2 ? 'top' : 'bottom';
  });

  readonly progressLabel = computed(() => `${this.#activeIndex() + 1} / ${this.total()}`);

  constructor() {
    // Auto-start once steps are available and the flag is on.
    effect(() => {
      if (this.autoStart() && this.hasSteps() && !this.isActive()) {
        this.start();
      }
    });

    // Keep the spotlight aligned with the target while the tour is open.
    effect((onCleanup) => {
      if (!this.isActive() || typeof window === 'undefined') {
        return;
      }
      // Read currentStep so we re-measure when the step changes.
      this.currentStep();
      this.measureSpotlight();

      const onChange = () => this.measureSpotlight();
      window.addEventListener('resize', onChange, { passive: true });
      window.addEventListener('scroll', onChange, { passive: true, capture: true });
      onCleanup(() => {
        window.removeEventListener('resize', onChange);
        window.removeEventListener('scroll', onChange, { capture: true } as EventListenerOptions);
      });
    });

    // Host-driven trigger: `el.dispatchEvent(new CustomEvent('tour:start'))`.
    effect((onCleanup) => {
      if (typeof document === 'undefined') {
        return;
      }
      const host = this.hostElement();
      if (!host) {
        return;
      }
      const onStart = () => this.start();
      host.addEventListener('tour:start', onStart);
      onCleanup(() => host.removeEventListener('tour:start', onStart));
    });

    this.#destroyRef.onDestroy(() => this.#activeIndex.set(-1));
  }

  /** Begin the tour from the first step. */
  start(): void {
    if (!this.hasSteps()) {
      return;
    }
    this.#activeIndex.set(0);
    this.measureSpotlight();
    this.emitStep();
  }

  next(): void {
    if (!this.isActive()) {
      return;
    }
    if (this.isLast()) {
      this.complete();
      return;
    }
    this.#activeIndex.update((index) => index + 1);
    this.measureSpotlight();
    this.emitStep();
  }

  previous(): void {
    if (!this.isActive() || this.isFirst()) {
      return;
    }
    this.#activeIndex.update((index) => index - 1);
    this.measureSpotlight();
    this.emitStep();
  }

  /** Visitor dismissed the tour before finishing. */
  skip(): void {
    if (!this.isActive()) {
      return;
    }
    const detail: TourLifecycleDetail = { total: this.total(), lastIndex: this.#activeIndex() };
    this.#activeIndex.set(-1);
    this.spotlight.set(null);
    this.tourskip.emit(detail);
    this.dispatch('tourskip', detail);
  }

  /** Visitor reached the end of the tour. */
  complete(): void {
    if (!this.isActive()) {
      return;
    }
    const detail: TourLifecycleDetail = { total: this.total(), lastIndex: this.#activeIndex() };
    this.#activeIndex.set(-1);
    this.spotlight.set(null);
    this.tourcomplete.emit(detail);
    this.dispatch('tourcomplete', detail);
  }

  onOverlayKeydown(event: KeyboardEvent): void {
    const handlers: Record<string, () => void> = {
      Escape: () => this.skip(),
      ArrowRight: () => this.next(),
      ArrowLeft: () => this.previous(),
      Enter: () => this.next(),
    };
    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  private emitStep(): void {
    const step = this.currentStep();
    if (!step) {
      return;
    }
    const detail: TourStepDetail = { index: this.#activeIndex(), total: this.total(), step };
    this.tourstep.emit(detail);
    this.dispatch('tourstep', detail);
  }

  private measureSpotlight(): void {
    const step = this.currentStep();
    if (!step || !step.target || typeof document === 'undefined') {
      this.spotlight.set(null);
      return;
    }
    let target: Element | null = null;
    try {
      target = document.querySelector(step.target);
    } catch {
      target = null;
    }
    if (!target) {
      this.spotlight.set(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    this.spotlight.set({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }

  private hostElement(): HTMLElement | null {
    if (typeof document === 'undefined') {
      return null;
    }
    return document.querySelector<HTMLElement>('sg-tour-guide, synergos-tour-guide');
  }

  private dispatch(type: string, detail: unknown): void {
    const host = this.hostElement();
    host?.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
