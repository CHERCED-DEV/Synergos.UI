import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  coerceOptionalBooleanInput,
  coerceOptionalNumberInput,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynSkeleton</c>.
 *
 * A loading placeholder that renders one or more shimmering shapes while the
 * real content is being fetched. Used as a perceived-performance primitive
 * across every vertical: a `text` shape stacks lines, `avatar` draws a circle,
 * `rect`/`card`/`image` draw blocks. The shimmer honors
 * `prefers-reduced-motion` and the `--syn-duration-shimmer` token.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface SkeletonRuntimeConfig {
  readonly shape?: string;
  readonly count?: number;
  readonly width?: string;
  readonly height?: string;
  readonly radius?: string;
  readonly gap?: string;
  readonly animated?: boolean;
  readonly label?: string;
}

export type SkeletonShape = 'text' | 'rect' | 'avatar' | 'circle' | 'card' | 'image';

interface SkeletonLine {
  readonly index: number;
  /** The last text line is shortened for a natural ragged edge. */
  readonly short: boolean;
}

const SKELETON_SHAPES: readonly SkeletonShape[] = [
  'text',
  'rect',
  'avatar',
  'circle',
  'card',
  'image',
];

const DEFAULT_SHAPE: SkeletonShape = 'text';
const DEFAULT_COUNT = 3;
const MIN_COUNT = 1;
const MAX_COUNT = 24;
const DEFAULT_LABEL = 'Cargando contenido';

function normalizeShape(value: unknown): SkeletonShape {
  return coerceStringEnumInput<SkeletonShape>(value, SKELETON_SHAPES) ?? DEFAULT_SHAPE;
}

function clampCount(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_COUNT;
  }
  const rounded = Math.round(value);
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, rounded));
}

function sanitizeSkeletonConfig(value: Partial<SkeletonRuntimeConfig>): SkeletonRuntimeConfig {
  return omitUndefinedProperties<SkeletonRuntimeConfig>({
    shape: coerceTrimmedStringInput(value.shape),
    count: coerceOptionalNumberInput(value.count),
    width: coerceTrimmedStringInput(value.width),
    height: coerceTrimmedStringInput(value.height),
    radius: coerceTrimmedStringInput(value.radius),
    gap: coerceTrimmedStringInput(value.gap),
    animated: coerceOptionalBooleanInput(value.animated),
    label: coerceTrimmedStringInput(value.label),
  });
}

@Component({
  selector: 'sg-skeleton',
  standalone: true,
  templateUrl: './skeleton.html',
  styleUrl: './skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-skeleton',
    role: 'status',
    'aria-live': 'polite',
    'aria-busy': 'true',
    '[attr.data-shape]': 'shape()',
    '[style.--sk-width]': 'width() || null',
    '[style.--sk-height]': 'height() || null',
    '[style.--sk-radius]': 'radius() || null',
    '[style.--sk-gap]': 'gap() || null',
    '[class.sg-skeleton--static]': '!animated()',
  },
})
export class SkeletonElementComponent {
  readonly config = input<SkeletonRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SkeletonRuntimeConfig>(sanitizeSkeletonConfig),
  });
  readonly shapeInput = input<string | undefined>(undefined, { alias: 'shape' });
  readonly countInput = input<number | undefined, unknown>(undefined, {
    alias: 'count',
    transform: coerceOptionalNumberInput,
  });
  readonly widthInput = input<string | undefined>(undefined, { alias: 'width' });
  readonly heightInput = input<string | undefined>(undefined, { alias: 'height' });
  readonly radiusInput = input<string | undefined>(undefined, { alias: 'radius' });
  readonly gapInput = input<string | undefined>(undefined, { alias: 'gap' });
  readonly animatedInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'animated',
    transform: coerceOptionalBooleanInput,
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly integration = input<string | undefined>(undefined);

  readonly shape = computed<SkeletonShape>(() =>
    normalizeShape(resolveConfigValue(this.shapeInput(), this.config()?.shape, DEFAULT_SHAPE)),
  );
  readonly count = computed(() =>
    clampCount(resolveConfigValue(this.countInput(), this.config()?.count, DEFAULT_COUNT)),
  );
  readonly width = computed(() =>
    resolveConfigValue(this.widthInput(), this.config()?.width, ''),
  );
  readonly height = computed(() =>
    resolveConfigValue(this.heightInput(), this.config()?.height, ''),
  );
  readonly radius = computed(() =>
    resolveConfigValue(this.radiusInput(), this.config()?.radius, ''),
  );
  readonly gap = computed(() => resolveConfigValue(this.gapInput(), this.config()?.gap, ''));
  readonly animated = computed(() =>
    resolveConfigValue(this.animatedInput(), this.config()?.animated, true),
  );
  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, DEFAULT_LABEL),
  );

  /** True for the multi-line text shape, which stacks N ragged bars. */
  readonly isText = computed(() => this.shape() === 'text');

  /** True for circular shapes (avatar/circle) so the SCSS forces 1:1. */
  readonly isCircle = computed(() => {
    const shape = this.shape();
    return shape === 'avatar' || shape === 'circle';
  });

  /** Lines rendered for the text shape; last line is shortened. */
  readonly lines = computed<readonly SkeletonLine[]>(() => {
    const total = this.count();
    return Array.from({ length: total }, (_, index) => ({
      index,
      short: total > 1 && index === total - 1,
    }));
  });

  /** Repeated blocks for non-text shapes (rect/avatar/card/image). */
  readonly blocks = computed<readonly number[]>(() =>
    this.isText() ? [] : Array.from({ length: this.count() }, (_, index) => index),
  );
}
