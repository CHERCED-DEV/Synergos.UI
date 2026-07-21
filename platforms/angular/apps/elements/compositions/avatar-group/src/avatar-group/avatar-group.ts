import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynAvatarGroup</c>.
 *
 * Renders a horizontally-overlapping row of avatars (faces or initials)
 * with a trailing "+N" overflow chip when the roster exceeds `maxVisible`.
 * Built for team / contributor / attendee strips across the verticals.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 * Activating an avatar (click / Enter / Space) emits an `avatarselect`
 * CustomEvent carrying the avatar and its index.
 */
export interface AvatarGroupRuntimeConfig {
  readonly avatars?: readonly AvatarItemConfig[];
  readonly maxVisible?: number;
  readonly size?: string;
  readonly label?: string;
  readonly overflowHref?: string;
}

export interface AvatarItemConfig {
  readonly name?: string;
  readonly src?: string;
  readonly alt?: string;
  readonly href?: string;
}

export type AvatarGroupSize = 'sm' | 'md' | 'lg';

export interface AvatarItem {
  readonly id: string;
  readonly name: string;
  readonly src: string;
  readonly alt: string;
  readonly href: string;
  readonly initials: string;
}

/** Emitted on the `avatarselect` CustomEvent and the typed Angular output. */
export interface AvatarSelectDetail {
  readonly avatar: AvatarItem;
  readonly index: number;
}

const SIZES: readonly AvatarGroupSize[] = ['sm', 'md', 'lg'];
const DEFAULT_SIZE: AvatarGroupSize = 'md';
const DEFAULT_MAX_VISIBLE = 5;

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

/** Two-letter initials from a display name; '?' when empty. */
export function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return `${first}${last}`.toUpperCase();
}

export function normalizeSize(value: unknown): AvatarGroupSize {
  const candidate = readString(value).trim().toLowerCase() as AvatarGroupSize;
  return SIZES.includes(candidate) ? candidate : DEFAULT_SIZE;
}

export function normalizeAvatars(value: unknown): readonly AvatarItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index): AvatarItem | null => {
      if (typeof entry === 'string') {
        const name = entry.trim();
        return name
          ? { id: `avatar-${index}`, name, src: '', alt: name, href: '', initials: computeInitials(name) }
          : null;
      }

      if (!isRecord(entry)) {
        return null;
      }

      const name = readString(entry['name']).trim() || readString(entry['nombre']).trim();
      const src = readString(entry['src']).trim() || readString(entry['image']).trim() || readString(entry['imageSrc']).trim();
      if (!name && !src) {
        return null;
      }

      const alt = readString(entry['alt']).trim() || name || 'Avatar';
      const href = readString(entry['href']).trim() || readString(entry['url']).trim();

      return {
        id: `avatar-${index}`,
        name,
        src,
        alt,
        href,
        initials: computeInitials(name),
      };
    })
    .filter((avatar): avatar is AvatarItem => avatar !== null);
}

function sanitizeAvatarGroupConfig(
  value: Partial<AvatarGroupRuntimeConfig>,
): AvatarGroupRuntimeConfig {
  return omitUndefinedProperties<AvatarGroupRuntimeConfig>({
    avatars: value.avatars,
    maxVisible: typeof value.maxVisible === 'number' ? value.maxVisible : undefined,
    size: coerceTrimmedStringInput(value.size),
    label: coerceTrimmedStringInput(value.label),
    overflowHref: coerceTrimmedStringInput(value.overflowHref),
  });
}

@Component({
  selector: 'sg-avatar-group',
  standalone: true,
  templateUrl: './avatar-group.html',
  styleUrl: './avatar-group.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-avatar-group' },
})
export class AvatarGroupElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<AvatarGroupRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AvatarGroupRuntimeConfig>(sanitizeAvatarGroupConfig),
  });
  readonly avatarsInput = input<string | undefined>(undefined, { alias: 'avatars' });
  readonly maxVisibleInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxVisible',
    transform: coerceOptionalNumberInput,
  });
  readonly sizeInput = input<string | undefined>(undefined, { alias: 'size' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly overflowHrefInput = input<string | undefined>(undefined, { alias: 'overflowHref' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `avatarselect` CustomEvent. */
  readonly avatarselect = output<AvatarSelectDetail>();

  readonly size = computed<AvatarGroupSize>(() =>
    normalizeSize(resolveConfigValue(this.sizeInput(), this.config()?.size, DEFAULT_SIZE)),
  );

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, 'Equipo'),
  );

  readonly overflowHref = computed(() =>
    resolveConfigValue(this.overflowHrefInput(), this.config()?.overflowHref, ''),
  );

  /** Full roster after normalization. */
  readonly avatars = computed<readonly AvatarItem[]>(() =>
    normalizeAvatars(this.resolveSource(this.avatarsInput(), this.config()?.avatars)),
  );

  /** Number of faces to show before collapsing the rest into "+N"; >= 1. */
  readonly maxVisible = computed(() => {
    const raw = resolveConfigValue(this.maxVisibleInput(), this.config()?.maxVisible, DEFAULT_MAX_VISIBLE);
    const rounded = Math.floor(raw);
    return rounded >= 1 ? rounded : 1;
  });

  readonly total = computed(() => this.avatars().length);
  readonly isEmpty = computed(() => this.total() === 0);

  /** Avatars actually rendered as faces (capped to leave room for the chip). */
  readonly visibleAvatars = computed<readonly AvatarItem[]>(() => {
    const all = this.avatars();
    const max = this.maxVisible();
    if (all.length <= max) {
      return all;
    }
    // Reserve the last visible slot for the overflow chip.
    return all.slice(0, Math.max(max - 1, 1));
  });

  /** How many roster members are folded into the "+N" chip. */
  readonly overflowCount = computed(() => this.total() - this.visibleAvatars().length);
  readonly hasOverflow = computed(() => this.overflowCount() > 0);
  readonly overflowLabel = computed(() => `+${this.overflowCount()}`);

  /** Accessible roster summary, e.g. "Equipo: 8 integrantes". */
  readonly groupAriaLabel = computed(() => {
    const total = this.total();
    const noun = total === 1 ? 'integrante' : 'integrantes';
    return `${this.label()}: ${total} ${noun}`;
  });

  /** Track id which currently holds focus inside the strip (roving tabindex). */
  readonly #focusedId = signal<string | null>(null);

  /** Whether a given avatar should carry tabindex=0 (roving). */
  isFocusable(avatar: AvatarItem, index: number): boolean {
    const focused = this.#focusedId();
    const visible = this.visibleAvatars();
    if (focused && visible.some((item) => item.id === focused)) {
      return avatar.id === focused;
    }
    return index === 0;
  }

  selectAvatar(avatar: AvatarItem, index: number): void {
    this.#focusedId.set(avatar.id);
    this.avatarselect.emit({ avatar, index });
  }

  /** Roving keyboard navigation across the visible avatars. */
  onAvatarKeydown(event: KeyboardEvent, avatar: AvatarItem, index: number): void {
    const visible = this.visibleAvatars();
    const last = visible.length - 1;

    const handlers: Record<string, () => void> = {
      ArrowRight: () => this.moveFocus(Math.min(index + 1, last)),
      ArrowLeft: () => this.moveFocus(Math.max(index - 1, 0)),
      Home: () => this.moveFocus(0),
      End: () => this.moveFocus(last),
      Enter: () => this.selectAvatar(avatar, index),
      ' ': () => this.selectAvatar(avatar, index),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  private moveFocus(index: number): void {
    const target = this.visibleAvatars()[index];
    if (!target) {
      return;
    }
    this.#focusedId.set(target.id);
    this.focusCell(target.id);
  }

  private focusCell(id: string): void {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const host = document.querySelector('sg-avatar-group, synergos-avatar-group');
      const root = host?.shadowRoot ?? document;
      const cell = (root as ParentNode).querySelector<HTMLElement>(`[data-avatar-id="${id}"]`);
      cell?.focus();
    });
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
