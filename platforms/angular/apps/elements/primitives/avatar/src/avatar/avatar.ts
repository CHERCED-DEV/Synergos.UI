import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';
import type { AvatarProps } from '@synergos/contracts';
import { t } from '@synergos/vitals-core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * <synergos-avatar>: a user avatar primitive. Renders a photo when `src` is provided and loads
 * successfully, otherwise falls back to up-to-two initials derived from `name`. Sizes are a
 * fixed scale (`xs`…`xl`). An optional presence dot (`status`) marks the user as
 * online/away/busy/offline.
 *
 * El `config` que manda el CMS tiene la forma de `AvatarProps`, GENERADO del record C#
 * (ADR 0135): `src` es la URL del medio que eligió el editor y `alt` su nombre accesible. La
 * vista mandaba `avatarSrc` y este elemento pintaba el icono genérico (D1). `name`, `size`,
 * `shape` y `status` no los autora el editor: llegan por atributo.
 *
 * Su microcopia sale del diccionario, sección `Avatar` (ADR 0136): el nombre de un avatar sin nombre
 * (`Avatar.Fallback`, la misma clave que usa `avatar-group`) y los cuatro estados de presencia.
 */
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

/** El nombre del estado de presencia, del diccionario (`Avatar.Status.*`). */
function etiquetaDeEstado(status: AvatarStatus): string {
  switch (status) {
    case 'online':
      return t('Avatar.Status.Online', 'En línea');
    case 'away':
      return t('Avatar.Status.Away', 'Ausente');
    case 'busy':
      return t('Avatar.Status.Busy', 'Ocupado');
    case 'offline':
      return t('Avatar.Status.Offline', 'Desconectado');
    default:
      return '';
  }
}

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

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeAvatarConfig(value: Partial<AvatarProps>): Partial<AvatarProps> {
  return omitUndefinedProperties<AvatarProps>({
    src: coerceTrimmedStringInput(value.src),
    alt: coerceTrimmedStringInput(value.alt),
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
  readonly config = input<Partial<AvatarProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AvatarProps>(sanitizeAvatarConfig),
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

  readonly name = computed(() => coerceTrimmedStringInput(this.nameInput()) ?? DEFAULT_NAME);

  readonly size = computed<AvatarSize>(() =>
    coerceAvatarEnum(this.sizeInput(), AVATAR_SIZES, DEFAULT_SIZE),
  );

  readonly shape = computed<AvatarShape>(() =>
    coerceAvatarEnum(this.shapeInput(), AVATAR_SHAPES, DEFAULT_SHAPE),
  );

  readonly status = computed<AvatarStatus>(() =>
    coerceAvatarEnum(this.statusInput(), AVATAR_STATUSES, DEFAULT_STATUS),
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
    return name || t('Avatar.Fallback', 'Avatar de usuario');
  });

  readonly statusLabel = computed(() => etiquetaDeEstado(this.status()));
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
