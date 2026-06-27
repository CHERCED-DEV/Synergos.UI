import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynShareBar</c>.
 *
 * A share bar: a row of social-network share buttons plus a copy-link
 * action. Each visible network opens its canonical share intent in a new
 * tab pre-filled with the page URL and title; the copy button writes the
 * URL to the clipboard and confirms inline. Selecting a network emits a
 * `share` CustomEvent and copying emits a `copylink` CustomEvent.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface ShareBarRuntimeConfig {
  readonly platforms?: string;
  readonly shareLink?: string;
  readonly shareTitle?: string;
}

export type SharePlatformId =
  | 'facebook'
  | 'x'
  | 'linkedin'
  | 'whatsapp'
  | 'telegram'
  | 'email';

export interface SharePlatform {
  readonly id: SharePlatformId;
  readonly label: string;
  /** SVG path data for the brand glyph (24×24 viewBox). */
  readonly icon: string;
}

/** Emitted on the `share` CustomEvent and the typed Angular output. */
export interface ShareSelectDetail {
  readonly platform: SharePlatformId;
  readonly url: string;
  readonly shareUrl: string;
}

/** Emitted on the `copylink` CustomEvent and the typed Angular output. */
export interface CopyLinkDetail {
  readonly url: string;
  readonly ok: boolean;
}

const DEFAULT_PLATFORMS: readonly SharePlatformId[] = [
  'facebook',
  'x',
  'linkedin',
  'whatsapp',
  'email',
];

/** Canonical catalog: label + brand glyph for every supported network. */
const PLATFORM_CATALOG: Readonly<Record<SharePlatformId, SharePlatform>> = {
  facebook: {
    id: 'facebook',
    label: 'Compartir en Facebook',
    icon: 'M14 9h2.5l.5-3h-3V4.2c0-.8.3-1.2 1.3-1.2H17V.2C16.6.1 15.6 0 14.5 0 12 0 10.4 1.5 10.4 4v2H8v3h2.4v9H14V9Z',
  },
  x: {
    id: 'x',
    label: 'Compartir en X',
    icon: 'M17.5 2h2.8l-6.1 7 7.2 9.5h-5.6l-4.4-5.8-5 5.8H3.6l6.5-7.5L2.9 2h5.7l4 5.3L17.5 2Zm-1 15h1.6L7.9 3.7H6.2L16.5 17Z',
  },
  linkedin: {
    id: 'linkedin',
    label: 'Compartir en LinkedIn',
    icon: 'M4.5 3.5A2.5 2.5 0 1 1 2 6 2.5 2.5 0 0 1 4.5 3.5ZM2.5 8h4v13h-4V8Zm7 0h3.8v1.8h.05a4.2 4.2 0 0 1 3.8-2.1c4 0 4.8 2.6 4.8 6V21h-4v-5.6c0-1.3 0-3-1.9-3s-2.2 1.4-2.2 2.9V21h-4V8Z',
  },
  whatsapp: {
    id: 'whatsapp',
    label: 'Compartir por WhatsApp',
    icon: 'M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2Zm5.3 13.9c-.2.6-1.3 1.2-1.8 1.2s-1.1.3-3.6-.8-3.9-3.8-4-4-1-1.3-1-2.5.6-1.8.9-2 .5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.5-.3.4c-.1.1-.3.3-.1.6s.6 1 1.3 1.6c.9.8 1.6 1 1.9 1.2s.5.1.6-.1l.8-1c.2-.2.4-.2.6-.1l2 .9c.2.1.4.2.4.3s0 .6-.2 1.1Z',
  },
  telegram: {
    id: 'telegram',
    label: 'Compartir en Telegram',
    icon: 'M21.9 4.3 18.6 20c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-5 9-8.2c.4-.3-.1-.5-.6-.2L6.6 13l-4.8-1.5c-1-.3-1-1 .2-1.5L20.6 2.9c.9-.3 1.6.2 1.3 1.4Z',
  },
  email: {
    id: 'email',
    label: 'Compartir por correo',
    icon: 'M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm.8 2 8.2 6 8.2-6H3.8ZM20 7.6l-7.4 5.4a1 1 0 0 1-1.2 0L4 7.6V18h16V7.6Z',
  },
};

const ALL_IDS = Object.keys(PLATFORM_CATALOG) as readonly SharePlatformId[];

function isPlatformId(value: string): value is SharePlatformId {
  return (ALL_IDS as readonly string[]).includes(value);
}

/** Parse a platforms spec (CSV string or JSON array) into a clean id list. */
export function normalizePlatforms(value: unknown): readonly SharePlatformId[] {
  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const seen = new Set<SharePlatformId>();
  const result: SharePlatformId[] = [];
  for (const entry of raw) {
    const id = String(entry).trim().toLowerCase();
    if (id && isPlatformId(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

/** Build the network-specific share intent URL. */
export function buildShareUrl(
  platform: SharePlatformId,
  url: string,
  title: string,
): string {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  switch (platform) {
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case 'x':
      return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case 'whatsapp':
      return `https://wa.me/?text=${t}%20${u}`;
    case 'telegram':
      return `https://t.me/share/url?url=${u}&text=${t}`;
    case 'email':
      return `mailto:?subject=${t}&body=${u}`;
    default:
      return url;
  }
}

function sanitizeShareBarConfig(
  value: Partial<ShareBarRuntimeConfig>,
): ShareBarRuntimeConfig {
  return omitUndefinedProperties<ShareBarRuntimeConfig>({
    platforms: coerceTrimmedStringInput(value.platforms),
    shareLink: coerceTrimmedStringInput(value.shareLink),
    shareTitle: coerceTrimmedStringInput(value.shareTitle),
  });
}

@Component({
  selector: 'sg-share-bar',
  standalone: true,
  templateUrl: './share-bar.html',
  styleUrl: './share-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-share-bar' },
})
export class ShareBarElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<ShareBarRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ShareBarRuntimeConfig>(sanitizeShareBarConfig),
  });
  readonly platformsInput = input<string | undefined>(undefined, { alias: 'platforms' });
  readonly shareLinkInput = input<string | undefined>(undefined, { alias: 'shareLink' });
  readonly shareTitleInput = input<string | undefined>(undefined, { alias: 'shareTitle' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular outputs mirroring the native CustomEvents. */
  readonly share = output<ShareSelectDetail>();
  readonly copylink = output<CopyLinkDetail>();

  /** Resolved page URL to share (config/attr override, else current page). */
  readonly shareUrl = computed(() => {
    const resolved = resolveConfigValue(
      this.shareLinkInput(),
      this.config()?.shareLink,
      '',
    ).trim();
    if (resolved) {
      return resolved;
    }
    return typeof location !== 'undefined' ? location.href : '';
  });

  readonly shareTitle = computed(() => {
    const resolved = resolveConfigValue(
      this.shareTitleInput(),
      this.config()?.shareTitle,
      '',
    ).trim();
    if (resolved) {
      return resolved;
    }
    return typeof document !== 'undefined' ? document.title : '';
  });

  /** Networks to render, normalized; falls back to the default set. */
  readonly platforms = computed<readonly SharePlatform[]>(() => {
    const spec = this.resolveSource(this.platformsInput(), this.config()?.platforms);
    const ids = normalizePlatforms(spec);
    const resolved = ids.length > 0 ? ids : DEFAULT_PLATFORMS;
    return resolved.map((id) => PLATFORM_CATALOG[id]);
  });

  readonly hasPlatforms = computed(() => this.platforms().length > 0);

  /** Copy-button confirmation state: idle → copied | failed. */
  readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');

  #copyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.#destroyRef.onDestroy(() => {
      if (this.#copyTimer !== undefined) {
        clearTimeout(this.#copyTimer);
      }
    });
  }

  /** Open a network's share intent and emit the typed/native event. */
  onShare(platform: SharePlatform): void {
    const url = this.shareUrl();
    const shareUrl = buildShareUrl(platform.id, url, this.shareTitle());

    if (typeof window !== 'undefined') {
      if (platform.id === 'email') {
        window.location.href = shareUrl;
      } else {
        window.open(shareUrl, '_blank', 'noopener,noreferrer');
      }
    }

    this.share.emit({ platform: platform.id, url, shareUrl });
  }

  /** Copy the share URL to the clipboard and confirm inline. */
  async onCopyLink(): Promise<void> {
    const url = this.shareUrl();
    const ok = await this.writeClipboard(url);

    this.copyState.set(ok ? 'copied' : 'failed');
    if (this.#copyTimer !== undefined) {
      clearTimeout(this.#copyTimer);
    }
    this.#copyTimer = setTimeout(() => this.copyState.set('idle'), 2000);

    this.copylink.emit({ url, ok });
  }

  private async writeClipboard(url: string): Promise<boolean> {
    if (!url) {
      return false;
    }
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(url);
        return true;
      }
    } catch {
      // Fall through to the legacy path below.
    }
    return this.legacyCopy(url);
  }

  private legacyCopy(url: string): boolean {
    if (typeof document === 'undefined') {
      return false;
    }
    try {
      const area = document.createElement('textarea');
      area.value = url;
      area.setAttribute('readonly', '');
      area.style.position = 'absolute';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      const parsed = this.#initialData.parseValue<unknown>(rawInput);
      // CSV strings are not JSON — parseValue returns null; keep the raw string.
      return parsed ?? rawInput;
    }
    return configValue;
  }
}
