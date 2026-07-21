import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynAvatar</c>.
 *
 * A user avatar primitive: renders a photo when `src` is provided and loads
 * successfully, otherwise falls back to up-to-two initials derived from
 * `name`. Sizes are a fixed scale (`xs`…`xl`). An optional presence dot
 * (`status`) marks the user as online/away/busy/offline.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface AvatarRuntimeConfig {
  readonly src?: string;
  readonly name?: string;
  readonly alt?: string;
  readonly size?: string;
  readonly shape?: string;
  readonly status?: string;
}

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarShape = 'circle' | 'rounded' | 'square';
export type AvatarStatus = 'none' | 'online' | 'away' | 'busy' | 'offline';

const AVATAR_SIZES: readonly AvatarSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];
const AVATAR_SHAPES: readonly AvatarShape[] = ['circle', 'rounded', 'square'];
const AVATAR_STATUSES: readonly AvatarStatus[] = [
  'none',
  'online',
  'away',
  'busy',
  'offline',
];

const DEFAULT_SIZE: AvatarSize = 'md';
const DEFAULT_SHAPE: AvatarShape = 'circle';
const DEFAULT_STATUS: AvatarStatus = 'none';
const DEFAULT_NAME = '';

const STATUS_LABELS: Record<AvatarStatus, string> = {
  none: '',
  online: 'En línea',
  away: 'Ausente',
  busy: 'Ocupado',
  offline: 'Desconectado',
};

/** Map an arbitrary string onto an allowed enum value, or a fallback. */
export function coerceAvatarEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const normalized = value?.trim().toLowerCase();
  return (allowed.find((entry) => entry === normalized) as T | undefined) ?? fallback;
}

/**
 * Derive up to two uppercase initials from a person's name. Takes the first
 * letter of the first and last whitespace-separated tokens; single-token
 * names yield a single initial. Returns '' when no usable letters exist.
 */
export function deriveInitials(name: string | undefined): string {
  const tokens = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return '';
  }

  const first = [...tokens[0]][0] ?? '';
  const last = tokens.length > 1 ? ([...tokens[tokens.length - 1]][0] ?? '') : '';

  return `${first}${last}`.toLocaleUpperCase();
}

function sanitizeAvatarConfig(value: Partial<AvatarRuntimeConfig>): AvatarRuntimeConfig {
  return omitUndefinedProperties<AvatarRuntimeConfig>({
    src: coerceTrimmedStringInput(value.src),
    name: coerceTrimmedStringInput(value.name),
    alt: coerceTrimmedStringInput(value.alt),
    size: coerceTrimmedStringInput(value.size),
    shape: coerceTrimmedStringInput(value.shape),
    status: coerceTrimmedStringInput(value.status),
  });
}

@Component({
  selector: 'sg-avatar',
  standalone: true,
  templateUrl: './avatar.html',
  styleUrl: './avatar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sg-avatar',
    '[attr.data-size]': 'size()',
    '[attr.data-shape]': 'shape()',
  },
})
export class AvatarElementComponent {
  readonly config = input<AvatarRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AvatarRuntimeConfig>(sanitizeAvatarConfig),
  });
  readonly srcInput = input<string | undefined>(undefined, { alias: 'src' });
  readonly nameInput = input<string | undefined>(undefined, { alias: 'name' });
  readonly altInput = input<string | undefined>(undefined, { alias: 'alt' });
  readonly sizeInput = input<string | undefined>(undefined, { alias: 'size' });
  readonly shapeInput = input<string | undefined>(undefined, { alias: 'shape' });
  readonly statusInput = input<string | undefined>(undefined, { alias: 'status' });
  readonly integration = input<string | undefined>(undefined);

  readonly src = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.srcInput()), this.config()?.src, ''),
  );

  readonly name = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.nameInput()),
      this.config()?.name,
      DEFAULT_NAME,
    ),
  );

  readonly size = computed<AvatarSize>(() =>
    coerceAvatarEnum(
      resolveConfigValue(this.sizeInput(), this.config()?.size, DEFAULT_SIZE),
      AVATAR_SIZES,
      DEFAULT_SIZE,
    ),
  );

  readonly shape = computed<AvatarShape>(() =>
    coerceAvatarEnum(
      resolveConfigValue(this.shapeInput(), this.config()?.shape, DEFAULT_SHAPE),
      AVATAR_SHAPES,
      DEFAULT_SHAPE,
    ),
  );

  readonly status = computed<AvatarStatus>(() =>
    coerceAvatarEnum(
      resolveConfigValue(this.statusInput(), this.config()?.status, DEFAULT_STATUS),
      AVATAR_STATUSES,
      DEFAULT_STATUS,
    ),
  );

  readonly initials = computed(() => deriveInitials(this.name()));

  /** Flips to `true` when the configured image fails to load at runtime. */
  readonly #imageErrored = signal(false);
  readonly imageErrored = this.#imageErrored.asReadonly();

  /** Show the photo only while a `src` exists and has not errored. */
  readonly showImage = computed(() => this.src().length > 0 && !this.#imageErrored());

  /** Accessible label: explicit alt → name → generic fallback. */
  readonly baseLabel = computed(() => {
    const alt = resolveConfigValue(
      coerceTrimmedStringInput(this.altInput()),
      this.config()?.alt,
      '',
    );
    if (alt) {
      return alt;
    }
    const name = this.name();
    return name || 'Avatar de usuario';
  });

  readonly statusLabel = computed(() => STATUS_LABELS[this.status()]);
  readonly hasStatus = computed(() => this.status() !== 'none');

  /** Composite accessible label including presence when set. */
  readonly fullLabel = computed(() => {
    const base = this.baseLabel();
    const presence = this.statusLabel();
    return presence ? `${base} — ${presence}` : base;
  });

  constructor() {
    // Reset the error latch whenever the source changes so a new, valid URL
    // can replace a previously broken one (keeps the view idempotent).
    effect(() => {
      this.src();
      this.#imageErrored.set(false);
    });
  }

  onImageError(): void {
    this.#imageErrored.set(true);
  }
}
