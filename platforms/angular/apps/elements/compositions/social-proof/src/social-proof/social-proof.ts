import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  AvatarComponent,
  coerceOptionalBooleanInput,
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynSocialProof</c>.
 *
 * Social proof: a stack of overlapping avatars + a headline that counts up
 * to a target number ("Más de 1.200 personas…"). Built to reassure visitors
 * that a product/service is already trusted by many. Avatars can be supplied
 * inline via `people` (or `avatars`); the count animates from 0 to `count`
 * on first paint (honoring `prefers-reduced-motion`).
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface SocialProofRuntimeConfig {
  readonly count?: number;
  readonly label?: string;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly locale?: string;
  readonly maxAvatars?: number;
  readonly animate?: boolean;
  readonly people?: readonly SocialProofPersonConfig[];
}

export interface SocialProofPersonConfig {
  readonly name?: string;
  readonly image?: string;
  readonly alt?: string;
}

export interface SocialProofPerson {
  readonly name: string;
  readonly image: string;
  readonly alt: string;
}

const DEFAULT_LOCALE = 'es-CO';
const DEFAULT_LABEL = 'personas confían en nosotros';
const DEFAULT_MAX_AVATARS = 5;
const COUNT_DURATION_MS = 1200;
const COUNT_FRAME_MS = 1000 / 60;

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

export function normalizePeople(value: unknown): readonly SocialProofPerson[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): SocialProofPerson | null => {
      if (typeof entry === 'string') {
        const name = entry.trim();
        return name ? { name, image: '', alt: name } : null;
      }

      if (!isRecord(entry)) {
        return null;
      }

      const name = readString(entry['name']).trim();
      const image =
        readString(entry['image']).trim() ||
        readString(entry['src']).trim() ||
        readString(entry['avatar']).trim();

      if (!name && !image) {
        return null;
      }

      return {
        name,
        image,
        alt: readString(entry['alt']).trim() || name,
      };
    })
    .filter((person): person is SocialProofPerson => person !== null);
}

function sanitizeSocialProofConfig(
  value: Partial<SocialProofRuntimeConfig>,
): SocialProofRuntimeConfig {
  return omitUndefinedProperties<SocialProofRuntimeConfig>({
    count: coerceOptionalNumberInput(value.count),
    label: coerceTrimmedStringInput(value.label),
    prefix: coerceTrimmedStringInput(value.prefix),
    suffix: coerceTrimmedStringInput(value.suffix),
    locale: coerceTrimmedStringInput(value.locale),
    maxAvatars: coerceOptionalNumberInput(value.maxAvatars),
    animate: coerceOptionalBooleanInput(value.animate),
    people: value.people,
  });
}

@Component({
  selector: 'sg-social-proof',
  standalone: true,
  imports: [AvatarComponent],
  templateUrl: './social-proof.html',
  styleUrl: './social-proof.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-social-proof' },
})
export class SocialProofElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<SocialProofRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SocialProofRuntimeConfig>(sanitizeSocialProofConfig),
  });
  readonly countInput = input<number | undefined, unknown>(undefined, {
    alias: 'count',
    transform: coerceOptionalNumberInput,
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly prefixInput = input<string | undefined>(undefined, { alias: 'prefix' });
  readonly suffixInput = input<string | undefined>(undefined, { alias: 'suffix' });
  readonly localeInput = input<string | undefined>(undefined, { alias: 'locale' });
  readonly maxAvatarsInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxAvatars',
    transform: coerceOptionalNumberInput,
  });
  readonly animateInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'animate',
    transform: coerceOptionalBooleanInput,
  });
  readonly peopleInput = input<string | undefined>(undefined, { alias: 'people' });

  readonly locale = computed(() =>
    resolveConfigValue(this.localeInput(), this.config()?.locale, DEFAULT_LOCALE),
  );
  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, DEFAULT_LABEL),
  );
  readonly prefix = computed(() =>
    resolveConfigValue(this.prefixInput(), this.config()?.prefix, ''),
  );
  readonly suffix = computed(() =>
    resolveConfigValue(this.suffixInput(), this.config()?.suffix, ''),
  );
  readonly animate = computed(() =>
    resolveConfigValue(this.animateInput(), this.config()?.animate, true),
  );

  /** The target number the counter climbs to. */
  readonly targetCount = computed(() => {
    const value = resolveConfigValue(this.countInput(), this.config()?.count, 0);
    return value > 0 ? Math.floor(value) : 0;
  });

  readonly maxAvatars = computed(() => {
    const value = resolveConfigValue(this.maxAvatarsInput(), this.config()?.maxAvatars, DEFAULT_MAX_AVATARS);
    return value > 0 ? Math.floor(value) : DEFAULT_MAX_AVATARS;
  });

  /** All people resolved from inline input / config. */
  readonly people = computed<readonly SocialProofPerson[]>(() =>
    normalizePeople(this.resolveSource(this.peopleInput(), this.config()?.people)),
  );

  /** Avatars actually rendered in the stack (capped by `maxAvatars`). */
  readonly visibleAvatars = computed<readonly SocialProofPerson[]>(() =>
    this.people().slice(0, this.maxAvatars()),
  );

  /** People beyond the cap, surfaced as a "+N" pill. */
  readonly overflowCount = computed(() => Math.max(0, this.people().length - this.maxAvatars()));

  readonly hasAvatars = computed(() => this.visibleAvatars().length > 0);
  readonly hasCount = computed(() => this.targetCount() > 0);

  /** Live, animated counter value (climbs from 0 → targetCount). */
  readonly #displayCount = signal(0);
  readonly displayCount = this.#displayCount.asReadonly();

  /** Locale-formatted counter string for the headline. */
  readonly formattedCount = computed(() =>
    new Intl.NumberFormat(this.locale()).format(this.#displayCount()),
  );

  /** Screen-reader summary combining the (final) count and label. */
  readonly ariaSummary = computed(() => {
    const parts = [this.prefix(), this.hasCount() ? new Intl.NumberFormat(this.locale()).format(this.targetCount()) : '', this.suffix(), this.label()];
    return parts.map((part) => part.trim()).filter(Boolean).join(' ');
  });

  readonly overflowLabel = computed(() => {
    const overflow = this.overflowCount();
    return overflow > 0 ? `+${new Intl.NumberFormat(this.locale()).format(overflow)}` : '';
  });

  #frameId: number | null = null;

  constructor() {
    // Drive the count-up animation whenever the target changes.
    effect(() => {
      const target = this.targetCount();
      const shouldAnimate = this.animate() && this.#prefersMotion();

      this.#cancelFrame();

      if (!shouldAnimate || target <= 0 || typeof requestAnimationFrame !== 'function') {
        this.#displayCount.set(target);
        return;
      }

      this.#runCountUp(target);
    });

    this.#destroyRef.onDestroy(() => this.#cancelFrame());
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }

  #prefersMotion(): boolean {
    if (typeof matchMedia !== 'function') {
      return true;
    }
    return !matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  #runCountUp(target: number): void {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let last = -1;

    const tick = (now: number): void => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / COUNT_DURATION_MS);
      // easeOutCubic for a natural deceleration.
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(target * eased);

      if (next !== last) {
        last = next;
        this.#displayCount.set(next);
      }

      if (progress < 1) {
        this.#frameId = requestAnimationFrame(tick);
      } else {
        this.#displayCount.set(target);
        this.#frameId = null;
      }
    };

    this.#displayCount.set(0);
    // Prime with a first frame; COUNT_FRAME_MS keeps the cadence documented.
    void COUNT_FRAME_MS;
    this.#frameId = requestAnimationFrame(tick);
  }

  #cancelFrame(): void {
    if (this.#frameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.#frameId);
    }
    this.#frameId = null;
  }
}
