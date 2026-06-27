import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynOEmbed</c>.
 *
 * Turns a single resource URL (YouTube, Vimeo, etc.) into a responsive
 * embedded player whose box keeps a fixed aspect-ratio across breakpoints.
 * Providers that expose an embeddable iframe are rendered inline; anything
 * unrecognized degrades gracefully to an accessible "open in a new tab"
 * card so a visitor is never left with a dead region.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface OembedRuntimeConfig {
  readonly embedUrl?: string;
  readonly title?: string;
  readonly aspectRatio?: string;
}

export type OembedProviderId = 'youtube' | 'vimeo' | 'unknown';

/** Resolved, render-ready embed descriptor. */
export interface OembedResolved {
  readonly provider: OembedProviderId;
  /** iframe `src` when the provider is embeddable, otherwise ''. */
  readonly embedSrc: string;
  /** CSS `aspect-ratio` value, e.g. "16 / 9". */
  readonly aspectRatio: string;
  /** Accessible iframe / link title. */
  readonly title: string;
}

const DEFAULT_ASPECT_RATIO = '16 / 9';
const DEFAULT_TITLE = 'Contenido embebido';

/** Accept "16 / 9", "16/9", "16:9", "1.78" — normalize to a CSS ratio. */
export function normalizeAspectRatio(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return DEFAULT_ASPECT_RATIO;
  }

  const pair = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(raw);
  if (pair) {
    const width = Number(pair[1]);
    const height = Number(pair[2]);
    if (width > 0 && height > 0) {
      return `${width} / ${height}`;
    }
    return DEFAULT_ASPECT_RATIO;
  }

  const single = Number(raw);
  if (Number.isFinite(single) && single > 0) {
    return `${single} / 1`;
  }

  return DEFAULT_ASPECT_RATIO;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Pull a YouTube video id from the common URL shapes, or '' if none. */
function youtubeId(url: URL): string {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    return url.pathname.slice(1).split('/')[0] ?? '';
  }

  if (host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
    const fromQuery = url.searchParams.get('v');
    if (fromQuery) {
      return fromQuery;
    }
    const path = url.pathname.split('/').filter(Boolean);
    // /embed/<id>, /shorts/<id>, /live/<id>
    if (path.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(path[0])) {
      return path[1];
    }
  }

  return '';
}

/** Pull a numeric Vimeo id, or '' if none. */
function vimeoId(url: URL): string {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') {
    return '';
  }
  const segments = url.pathname.split('/').filter(Boolean);
  for (const segment of segments) {
    if (/^\d+$/.test(segment)) {
      return segment;
    }
  }
  return '';
}

/** Resolve a raw URL into a provider + embeddable iframe `src`. */
export function resolveEmbed(rawUrl: string, title: string, aspectRatio: string): OembedResolved {
  const base: Omit<OembedResolved, 'provider' | 'embedSrc'> = { aspectRatio, title };
  const url = parseUrl(rawUrl.trim());
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return { provider: 'unknown', embedSrc: '', ...base };
  }

  const yt = youtubeId(url);
  if (yt) {
    return {
      provider: 'youtube',
      embedSrc: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}`,
      ...base,
    };
  }

  const vimeo = vimeoId(url);
  if (vimeo) {
    return {
      provider: 'vimeo',
      embedSrc: `https://player.vimeo.com/video/${encodeURIComponent(vimeo)}`,
      ...base,
    };
  }

  return { provider: 'unknown', embedSrc: '', ...base };
}

function sanitizeOembedConfig(value: Partial<OembedRuntimeConfig>): OembedRuntimeConfig {
  return omitUndefinedProperties<OembedRuntimeConfig>({
    embedUrl: coerceTrimmedStringInput(value.embedUrl),
    title: coerceTrimmedStringInput(value.title),
    aspectRatio: coerceTrimmedStringInput(value.aspectRatio),
  });
}

@Component({
  selector: 'sg-oembed',
  standalone: true,
  templateUrl: './oembed.html',
  styleUrl: './oembed.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-oembed' },
})
export class OembedElementComponent {
  readonly config = input<OembedRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<OembedRuntimeConfig>(sanitizeOembedConfig),
  });
  readonly embedUrlInput = input<string | undefined>(undefined, { alias: 'embedUrl' });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly aspectRatioInput = input<string | undefined>(undefined, { alias: 'aspectRatio' });
  readonly integration = input<string | undefined>(undefined);

  readonly embedUrl = computed(() =>
    resolveConfigValue(this.embedUrlInput(), this.config()?.embedUrl, '').trim(),
  );
  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, DEFAULT_TITLE).trim() ||
    DEFAULT_TITLE,
  );
  readonly aspectRatio = computed(() =>
    normalizeAspectRatio(resolveConfigValue(this.aspectRatioInput(), this.config()?.aspectRatio, '')),
  );

  /** Fully resolved embed descriptor driving the template. */
  readonly resolved = computed<OembedResolved>(() =>
    resolveEmbed(this.embedUrl(), this.title(), this.aspectRatio()),
  );

  readonly hasUrl = computed(() => this.embedUrl().length > 0);
  readonly isEmbeddable = computed(() => this.resolved().embedSrc.length > 0);
}
