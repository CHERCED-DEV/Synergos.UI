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
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynQuoteAnimated</c>.
 *
 * A featured pull-quote that animates on entry and (optionally) rotates
 * through several quotes on a timer. Built for editorial / landing surfaces
 * where a rotating testimonial or stoic maxim carries the section.
 *
 * Quotes can be supplied as a single `quote` + `attribution` pair (the
 * scaffold contract) or as a richer `quotes` array. Selecting / advancing a
 * quote emits a `quotechange` CustomEvent carrying the active quote.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface QuoteAnimatedRuntimeConfig {
  readonly quote?: string;
  readonly attribution?: string;
  readonly role?: string;
  readonly animationMode?: string;
  readonly autoplay?: boolean;
  readonly interval?: number;
  readonly quotes?: readonly QuoteItemConfig[];
}

export interface QuoteItemConfig {
  readonly quote?: string;
  readonly text?: string;
  readonly attribution?: string;
  readonly author?: string;
  readonly role?: string;
  readonly cite?: string;
}

export interface QuoteItem {
  readonly id: string;
  readonly quote: string;
  readonly attribution: string;
  readonly role: string;
  readonly cite: string;
}

/** Emitted on the `quotechange` CustomEvent and the typed Angular output. */
export interface QuoteChangeDetail {
  readonly index: number;
  readonly quote: QuoteItem;
}

export type QuoteAnimationMode = 'fade' | 'slide' | 'rise' | 'none';

const ANIMATION_MODES: readonly QuoteAnimationMode[] = ['fade', 'slide', 'rise', 'none'];

const DEFAULT_INTERVAL_MS = 6000;
const MIN_INTERVAL_MS = 1500;

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

function normalizeAnimationMode(value: unknown): QuoteAnimationMode {
  const candidate = readString(value).trim().toLowerCase() as QuoteAnimationMode;
  return ANIMATION_MODES.includes(candidate) ? candidate : 'fade';
}

/** Coerce one entry (object or bare string) into a QuoteItem, or null. */
function toQuoteItem(entry: unknown, index: number): QuoteItem | null {
  if (typeof entry === 'string') {
    const quote = entry.trim();
    return quote ? { id: `quote-${index}`, quote, attribution: '', role: '', cite: '' } : null;
  }

  if (isRecord(entry)) {
    const quote = (readString(entry['quote']).trim() || readString(entry['text']).trim());
    if (!quote) {
      return null;
    }
    return {
      id: `quote-${index}`,
      quote,
      attribution: readString(entry['attribution']).trim() || readString(entry['author']).trim(),
      role: readString(entry['role']).trim(),
      cite: readString(entry['cite']).trim(),
    };
  }

  return null;
}

export function normalizeQuotes(value: unknown): readonly QuoteItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => toQuoteItem(entry, index))
    .filter((item): item is QuoteItem => item !== null);
}

function sanitizeQuoteAnimatedConfig(
  value: Partial<QuoteAnimatedRuntimeConfig>,
): QuoteAnimatedRuntimeConfig {
  return omitUndefinedProperties<QuoteAnimatedRuntimeConfig>({
    quote: coerceTrimmedStringInput(value.quote),
    attribution: coerceTrimmedStringInput(value.attribution),
    role: coerceTrimmedStringInput(value.role),
    animationMode: coerceTrimmedStringInput(value.animationMode),
    autoplay: coerceOptionalBooleanInput(value.autoplay),
    interval: coerceOptionalNumberInput(value.interval),
    quotes: value.quotes,
  });
}

@Component({
  selector: 'sg-quote-animated',
  standalone: true,
  templateUrl: './quote-animated.html',
  styleUrl: './quote-animated.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-quote-animated',
    '[attr.data-animation]': 'animationMode()',
  },
})
export class QuoteAnimatedElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<QuoteAnimatedRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<QuoteAnimatedRuntimeConfig>(sanitizeQuoteAnimatedConfig),
  });
  readonly quoteInput = input<string | undefined>(undefined, { alias: 'quote' });
  readonly attributionInput = input<string | undefined>(undefined, { alias: 'attribution' });
  readonly roleInput = input<string | undefined>(undefined, { alias: 'role' });
  readonly animationModeInput = input<string | undefined>(undefined, { alias: 'animationMode' });
  readonly autoplayInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'autoplay',
    transform: coerceOptionalBooleanInput,
  });
  readonly intervalInput = input<number | undefined, unknown>(undefined, {
    alias: 'interval',
    transform: coerceOptionalNumberInput,
  });
  readonly quotesInput = input<string | undefined>(undefined, { alias: 'quotes' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `quotechange` CustomEvent. */
  readonly quotechange = output<QuoteChangeDetail>();

  readonly animationMode = computed<QuoteAnimationMode>(() =>
    normalizeAnimationMode(
      resolveConfigValue(this.animationModeInput(), this.config()?.animationMode, 'fade'),
    ),
  );

  readonly autoplay = computed(() =>
    resolveConfigValue(this.autoplayInput(), this.config()?.autoplay, false),
  );

  readonly interval = computed<number>(() => {
    const raw = resolveConfigValue<number>(
      this.intervalInput(),
      this.config()?.interval,
      DEFAULT_INTERVAL_MS,
    );
    return Number.isFinite(raw) && raw >= MIN_INTERVAL_MS ? raw : DEFAULT_INTERVAL_MS;
  });

  /** The resolved list of quotes. A single `quote`/`attribution` pair, when
   *  present, is folded in as the leading item ahead of any `quotes` array. */
  readonly quotes = computed<readonly QuoteItem[]>(() => {
    const list = [...normalizeQuotes(this.resolveSource(this.quotesInput(), this.config()?.quotes))];

    const single = resolveConfigValue(this.quoteInput(), this.config()?.quote, '').trim();
    if (single) {
      list.unshift({
        id: 'quote-single',
        quote: single,
        attribution: resolveConfigValue(this.attributionInput(), this.config()?.attribution, '').trim(),
        role: resolveConfigValue(this.roleInput(), this.config()?.role, '').trim(),
        cite: '',
      });
    }

    return list.map((item, index) => ({ ...item, id: `quote-${index}` }));
  });

  readonly hasQuotes = computed(() => this.quotes().length > 0);
  readonly canRotate = computed(() => this.quotes().length > 1);

  /** Index of the visible quote. */
  readonly #activeIndex = signal(0);

  readonly activeIndex = computed(() => {
    const count = this.quotes().length;
    if (count === 0) {
      return 0;
    }
    // Clamp so a shrinking list never points past the end.
    return ((this.#activeIndex() % count) + count) % count;
  });

  readonly activeQuote = computed<QuoteItem | null>(() => this.quotes()[this.activeIndex()] ?? null);

  /** Whether the rotation timer is currently paused (hover / focus / reduced motion). */
  readonly #paused = signal(false);
  readonly paused = this.#paused.asReadonly();

  constructor() {
    // Autoplay rotation: ticks while enabled, multiple quotes exist, and not paused.
    effect((onCleanup) => {
      const active = this.autoplay() && this.canRotate() && !this.#paused();
      if (!active || typeof setInterval !== 'function') {
        return;
      }

      const period = this.interval();
      const handle = setInterval(() => this.advance(1, false), period);
      onCleanup(() => clearInterval(handle));
    });

    this.#destroyRef.onDestroy(() => {
      // Interval cleanup handled by effect onCleanup.
    });
  }

  /** Move to a specific quote and emit the change. */
  goTo(index: number): void {
    const count = this.quotes().length;
    if (count === 0) {
      return;
    }
    const next = ((index % count) + count) % count;
    this.#activeIndex.set(next);
    this.#emitChange();
  }

  /** Advance by `delta` quotes; notifies listeners on every change. */
  advance(delta: number, _userInitiated = true): void {
    if (this.quotes().length === 0) {
      return;
    }
    this.#activeIndex.update((value) => value + delta);
    this.#emitChange();
  }

  next(): void {
    this.advance(1, true);
  }

  previous(): void {
    this.advance(-1, true);
  }

  pause(): void {
    this.#paused.set(true);
  }

  resume(): void {
    this.#paused.set(false);
  }

  /** Roving keyboard control over the rotating quote tablist. */
  onKeydown(event: KeyboardEvent): void {
    if (!this.canRotate()) {
      return;
    }
    const handlers: Record<string, () => void> = {
      ArrowRight: () => this.next(),
      ArrowLeft: () => this.previous(),
      Home: () => this.goTo(0),
      End: () => this.goTo(this.quotes().length - 1),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  isActive(index: number): boolean {
    return this.activeIndex() === index;
  }

  #emitChange(): void {
    const quote = this.activeQuote();
    if (quote) {
      this.quotechange.emit({ index: this.activeIndex(), quote });
    }
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
