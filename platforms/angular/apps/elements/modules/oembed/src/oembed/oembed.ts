import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveEmbedSrc,
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

/**
 * Resolve a raw URL into a provider + embeddable iframe `src`.
 *
 * ⚠️ LA FRONTERA DE SEGURIDAD YA NO VIVE ACÁ: se movió a `resolveEmbedSrc` en
 * `@synergos/shared` cuando apareció el segundo consumidor —`media-explorer`,
 * que tenía este mismo defecto sin arreglar (issue #10)—. Duplicar una
 * allowlist es la peor de las opciones: dos copias que se separan en silencio
 * es cómo se consigue un agujero en la que nadie está mirando.
 *
 * Lo que queda acá es lo que sólo le importa a este elemento: pegarle el título
 * y el aspect-ratio. El razonamiento de por qué el
 * `bypassSecurityTrustResourceUrl` de `safeEmbedSrc` es legítimo está entero en
 * la cabecera de `embed-url.util.ts`, y sigue siendo el mismo: la url que sale
 * NUNCA es la que entró.
 */
export function resolveEmbed(rawUrl: string, title: string, aspectRatio: string): OembedResolved {
  const { provider, embedSrc } = resolveEmbedSrc(rawUrl);
  return { provider, embedSrc, aspectRatio, title };
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
  readonly #sanitizer = inject(DomSanitizer);

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

  /**
   * La MISMA url de `resolved().embedSrc`, envuelta para poder atarla al `src`
   * del iframe.
   *
   * Angular trata el `src` de un <iframe> como *resource URL context*: exige un
   * `SafeResourceUrl` y ante un string lanza NG0904 **durante la detección de
   * cambios**, o sea que el componente reventaba en CADA render con una url
   * embebible — no fallaba el vídeo, fallaba el elemento entero. Llevaba así
   * desde siempre y no se veía porque su spec, que lo atrapaba en 2 casos, no
   * tenía target `test` que lo ejecutara.
   *
   * El bypass es legítimo SÓLO porque se aplica sobre la url que PRODUCE
   * `resolveEmbed` (origen literal + id `encodeURIComponent`), nunca sobre
   * `embedUrl()`, que es la cadena cruda del editor. Ver la nota de seguridad
   * en `resolveEmbed`. `resolved().embedSrc` sigue siendo string a propósito:
   * ese es el contrato que prueba QUÉ url se construye.
   */
  readonly safeEmbedSrc = computed<SafeResourceUrl>(() =>
    this.#sanitizer.bypassSecurityTrustResourceUrl(this.resolved().embedSrc),
  );
}
