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
 * Runtime config for the CMS element <c>elementSynLivestream</c>.
 *
 * An embedded livestream: a responsive 16:9 player (provider iframe or a
 * native HTML5 <video>) framed by a "EN VIVO" badge and a live viewer
 * count. Built for the EVENTOS / contenido vertical (transmisiones en
 * directo). The viewer count can be supplied inline via `viewers` or
 * polled from `viewerCountEndpoint`; toggling `live` off swaps the badge
 * for a neutral "Grabación" state and stops polling.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface LivestreamRuntimeConfig {
  readonly streamUrl?: string;
  readonly streamType?: string;
  readonly title?: string;
  readonly posterUrl?: string;
  readonly live?: boolean;
  readonly viewers?: number;
  readonly viewerCountEndpoint?: string;
  readonly refreshSeconds?: number;
  readonly locale?: string;
  readonly liveLabel?: string;
  readonly offlineLabel?: string;
}

/** How the player surface is rendered. */
export type LivestreamPlayerKind = 'iframe' | 'video' | 'none';

const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|ogv|mov|m3u8)(\?.*)?$/i;
const ALLOWED_PROTOCOLS: readonly string[] = ['https:', 'http:'];

const DEFAULT_LOCALE = 'es-CO';
const DEFAULT_LIVE_LABEL = 'EN VIVO';
const DEFAULT_OFFLINE_LABEL = 'Grabación';
const DEFAULT_REFRESH_SECONDS = 30;
const MIN_REFRESH_SECONDS = 5;
const MAX_REFRESH_SECONDS = 600;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Accept only http(s) URLs; everything else is treated as "no source". */
export function sanitizeStreamUrl(value: string | undefined): string {
  const raw = coerceTrimmedStringInput(value);
  if (!raw) {
    return '';
  }
  try {
    const url = new URL(raw, 'https://invalid.local');
    if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
      return '';
    }
    // Reject relative inputs that resolved against the sentinel base.
    return url.origin === 'https://invalid.local' && !/^https?:\/\//i.test(raw) ? '' : raw;
  } catch {
    return '';
  }
}

/** Decide whether a URL is a direct video file or a provider embed. */
export function resolvePlayerKind(url: string, explicitType: string | undefined): LivestreamPlayerKind {
  if (!url) {
    return 'none';
  }
  const hint = coerceTrimmedStringInput(explicitType)?.toLowerCase();
  if (hint === 'video' || hint === 'iframe') {
    return hint;
  }
  return VIDEO_EXTENSIONS.test(url) ? 'video' : 'iframe';
}

function sanitizeLivestreamConfig(value: Partial<LivestreamRuntimeConfig>): LivestreamRuntimeConfig {
  return omitUndefinedProperties<LivestreamRuntimeConfig>({
    streamUrl: coerceTrimmedStringInput(value.streamUrl),
    streamType: coerceTrimmedStringInput(value.streamType),
    title: coerceTrimmedStringInput(value.title),
    posterUrl: coerceTrimmedStringInput(value.posterUrl),
    live: coerceOptionalBooleanInput(value.live),
    viewers: coerceOptionalNumberInput(value.viewers),
    viewerCountEndpoint: coerceTrimmedStringInput(value.viewerCountEndpoint),
    refreshSeconds: coerceOptionalNumberInput(value.refreshSeconds),
    locale: coerceTrimmedStringInput(value.locale),
    liveLabel: coerceTrimmedStringInput(value.liveLabel),
    offlineLabel: coerceTrimmedStringInput(value.offlineLabel),
  });
}

@Component({
  selector: 'sg-livestream',
  standalone: true,
  templateUrl: './livestream.html',
  styleUrl: './livestream.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-livestream' },
})
export class LivestreamElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<LivestreamRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<LivestreamRuntimeConfig>(sanitizeLivestreamConfig),
  });
  readonly streamUrlInput = input<string | undefined>(undefined, { alias: 'streamUrl' });
  readonly streamTypeInput = input<string | undefined>(undefined, { alias: 'streamType' });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly posterUrlInput = input<string | undefined>(undefined, { alias: 'posterUrl' });
  readonly liveInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'live',
    transform: coerceOptionalBooleanInput,
  });
  readonly viewersInput = input<number | undefined, unknown>(undefined, {
    alias: 'viewers',
    transform: coerceOptionalNumberInput,
  });
  readonly viewerCountEndpointInput = input<string | undefined>(undefined, {
    alias: 'viewerCountEndpoint',
  });
  readonly refreshSecondsInput = input<number | undefined, unknown>(undefined, {
    alias: 'refreshSeconds',
    transform: coerceOptionalNumberInput,
  });
  readonly localeInput = input<string | undefined>(undefined, { alias: 'locale' });
  readonly liveLabelInput = input<string | undefined>(undefined, { alias: 'liveLabel' });
  readonly offlineLabelInput = input<string | undefined>(undefined, { alias: 'offlineLabel' });
  readonly integration = input<string | undefined>(undefined);

  /** Emitted (and mirrored as a native `viewerschange` CustomEvent) on poll. */
  readonly viewerschange = output<number>();

  readonly locale = computed(() =>
    resolveConfigValue(this.localeInput(), this.config()?.locale, DEFAULT_LOCALE),
  );

  readonly title = computed(() => resolveConfigValue(this.titleInput(), this.config()?.title, ''));
  readonly hasTitle = computed(() => this.title().trim().length > 0);

  readonly liveLabel = computed(() =>
    resolveConfigValue(this.liveLabelInput(), this.config()?.liveLabel, DEFAULT_LIVE_LABEL),
  );
  readonly offlineLabel = computed(() =>
    resolveConfigValue(this.offlineLabelInput(), this.config()?.offlineLabel, DEFAULT_OFFLINE_LABEL),
  );

  readonly isLive = computed(() => resolveConfigValue(this.liveInput(), this.config()?.live, true));

  readonly streamUrl = computed(() =>
    sanitizeStreamUrl(resolveConfigValue(this.streamUrlInput(), this.config()?.streamUrl, '')),
  );

  readonly posterUrl = computed(() =>
    sanitizeStreamUrl(resolveConfigValue(this.posterUrlInput(), this.config()?.posterUrl, '')),
  );

  readonly playerKind = computed<LivestreamPlayerKind>(() =>
    resolvePlayerKind(
      this.streamUrl(),
      resolveConfigValue(this.streamTypeInput(), this.config()?.streamType, ''),
    ),
  );

  readonly hasPlayer = computed(() => this.playerKind() !== 'none');

  /** Inline / config viewer seed. */
  readonly #inlineViewers = computed<number | null>(() => {
    const value = resolveConfigValue(this.viewersInput(), this.config()?.viewers, Number.NaN);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
  });

  readonly viewerCountEndpoint = computed(() =>
    resolveConfigValue(this.viewerCountEndpointInput(), this.config()?.viewerCountEndpoint, ''),
  );

  /** Clamp the poll interval into a sane band. */
  readonly refreshSeconds = computed(() => {
    const value = resolveConfigValue(
      this.refreshSecondsInput(),
      this.config()?.refreshSeconds,
      DEFAULT_REFRESH_SECONDS,
    );
    if (!Number.isFinite(value)) {
      return DEFAULT_REFRESH_SECONDS;
    }
    return Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, Math.floor(value)));
  });

  /** Viewer count fetched from the endpoint; null until a poll succeeds. */
  readonly #fetchedViewers = signal<number | null>(null);

  /** Effective viewer count: fetched wins over inline; null hides the chip. */
  readonly viewers = computed<number | null>(() => this.#fetchedViewers() ?? this.#inlineViewers());

  readonly hasViewers = computed(() => this.viewers() !== null);

  readonly viewersLabel = computed(() => {
    const count = this.viewers();
    if (count === null) {
      return '';
    }
    return new Intl.NumberFormat(this.locale()).format(count);
  });

  constructor() {
    // Poll the viewer-count endpoint while live; tears down on change/destroy.
    effect((onCleanup) => {
      const endpoint = this.viewerCountEndpoint().trim();
      this.#fetchedViewers.set(null);

      if (!endpoint || !this.isLive() || typeof fetch !== 'function') {
        return;
      }

      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let active = true;

      const poll = (): void => {
        fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/json' } })
          .then((response) =>
            response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)),
          )
          .then((data: unknown) => {
            const count = this.#extractViewers(data);
            if (count !== null) {
              this.#fetchedViewers.set(count);
              this.viewerschange.emit(count);
            }
          })
          .catch(() => {
            // Swallow poll failures; keep the last known count.
          })
          .finally(() => {
            if (active) {
              timer = setTimeout(poll, this.refreshSeconds() * 1000);
            }
          });
      };

      poll();

      onCleanup(() => {
        active = false;
        controller.abort();
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      });
    });

    this.#destroyRef.onDestroy(() => {
      // Poll cleanup handled by effect onCleanup.
    });
  }

  #extractViewers(data: unknown): number | null {
    let raw: unknown = data;
    if (isRecord(data)) {
      raw = data['viewers'] ?? data['count'] ?? data['value'] ?? data['viewerCount'];
    }
    const parsed = readNumber(raw);
    if (parsed === null || parsed < 0) {
      return null;
    }
    return Math.floor(parsed);
  }
}
