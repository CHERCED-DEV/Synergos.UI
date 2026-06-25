import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import type { SynStatTickerSchema } from '@synergos/contracts';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

function sanitizeStatTickerConfig(
  value: Partial<SynStatTickerSchema>,
): Partial<SynStatTickerSchema> {
  return omitUndefinedProperties<SynStatTickerSchema>({
    statValue: coerceTrimmedStringInput(value.statValue),
    statLabel: coerceTrimmedStringInput(value.statLabel),
    statPrefix: coerceTrimmedStringInput(value.statPrefix),
    statSuffix: coerceTrimmedStringInput(value.statSuffix),
  });
}

/**
 * Web Component for the CMS element <c>elementSynStatTicker</c>.
 * Renders a single statistic with an ease-out count-up that fires once when
 * the element scrolls into view. Reads the SynHost `config` payload, with
 * direct inputs as overrides. Falls back to the raw value when non-numeric.
 */
@Component({
  selector: 'sg-stat-ticker',
  standalone: true,
  templateUrl: './stat-ticker.html',
  styleUrl: './stat-ticker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-stat-ticker' },
})
export class StatTickerElementComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly config = input<Partial<SynStatTickerSchema> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SynStatTickerSchema>(sanitizeStatTickerConfig),
  });
  readonly statValueInput = input<string | undefined>(undefined, { alias: 'statValue' });
  readonly statLabelInput = input<string | undefined>(undefined, { alias: 'statLabel' });
  readonly statPrefixInput = input<string | undefined>(undefined, { alias: 'statPrefix' });
  readonly statSuffixInput = input<string | undefined>(undefined, { alias: 'statSuffix' });

  readonly statValue = computed(() =>
    resolveConfigValue(this.statValueInput(), this.config()?.statValue, ''),
  );
  readonly statLabel = computed(() =>
    resolveConfigValue(this.statLabelInput(), this.config()?.statLabel, ''),
  );
  readonly statPrefix = computed(() =>
    resolveConfigValue(this.statPrefixInput(), this.config()?.statPrefix, ''),
  );
  readonly statSuffix = computed(() =>
    resolveConfigValue(this.statSuffixInput(), this.config()?.statSuffix, ''),
  );

  /** Numeric target parsed from the value, or null when non-numeric. */
  readonly target = computed(() => {
    const match = this.statValue().match(/-?\d[\d.,]*/);
    if (!match) {
      return null;
    }
    const num = Number.parseFloat(match[0].replace(/,/g, ''));
    return Number.isFinite(num) ? num : null;
  });

  /** How many decimal places the source value carries. */
  readonly decimals = computed(() => {
    const match = this.statValue().match(/\.(\d+)/);
    return match ? match[1].length : 0;
  });

  private readonly displayed = signal(0);
  private animated = false;

  /** Formatted value during/after the animation; raw value when non-numeric. */
  readonly display = computed(() => {
    if (this.target() === null) {
      return this.statValue();
    }
    return this.displayed().toLocaleString('es-CO', {
      minimumFractionDigits: this.decimals(),
      maximumFractionDigits: this.decimals(),
    });
  });

  constructor() {
    afterNextRender(() => {
      const start = () => this.runCountUp();
      if (typeof IntersectionObserver === 'undefined') {
        start();
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              start();
              observer.disconnect();
              break;
            }
          }
        },
        { threshold: 0.4 },
      );
      observer.observe(this.host.nativeElement);
    });
  }

  private runCountUp(): void {
    const target = this.target();
    if (this.animated || target === null) {
      return;
    }
    this.animated = true;

    const reduceMotion =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      this.displayed.set(target);
      return;
    }

    const duration = 1200;
    const startTs = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTs) / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      this.displayed.set(target * eased);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        this.displayed.set(target);
      }
    };
    requestAnimationFrame(tick);
  }
}
