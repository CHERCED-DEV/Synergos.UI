/**
 * De una URL que escribió una persona a un `src` de iframe que se puede confiar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO ES UNA FRONTERA DE SEGURIDAD, Y POR ESO HAY UNA SOLA.
 *
 * Angular trata el `src` de un `<iframe>` como *resource URL context*: exige un
 * `SafeResourceUrl` y ante un string lanza **NG0904 durante la detección de
 * cambios** — o sea que no falla el vídeo, falla el componente entero.
 *
 * La salida tentadora es envolver la url del editor en
 * `bypassSecurityTrustResourceUrl`. Eso apaga el error y abre un agujero: un
 * `javascript:…` entra directo a un iframe con `allow="clipboard-write;
 * encrypted-media"`.
 *
 * Lo que hace legítimo el bypass es que **la url que sale de aquí NUNCA es la
 * que entró**. Se parsea la de entrada, se extrae un id, y se reemite sobre un
 * ORIGEN LITERAL (`youtube-nocookie.com` / `player.vimeo.com`) con el id pasado
 * por `encodeURIComponent`, que codifica `/ ? # :` y por tanto impide que el id
 * se salga de su segmento de path o cambie el origen. Si no matchea ningún
 * proveedor, `embedSrc` sale `''` y quien llama NO pinta el iframe.
 *
 * POR QUÉ VIVE ACÁ Y NO EN `oembed`, DE DONDE SALIÓ. Por el segundo consumidor:
 * `media-explorer` tenía este mismo defecto sin arreglar (issue #10) y
 * necesitaba exactamente esta función. Duplicar una allowlist es la peor de las
 * opciones — dos copias de una frontera de seguridad que se separan en silencio
 * es cómo se consigue un agujero en la que nadie está mirando.
 *
 * Y ya había señales de que pasaría: el mismo defecto se arregló en `oembed` y
 * en `livestream` por separado, y `media-explorer` se quedó fuera del barrido.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * AÑADIR UN PROVEEDOR es añadir una rama acá, y nada más. Lo que NO se puede
 * hacer nunca es dejar pasar la url de entrada tal cual «porque el host está en
 * la lista»: el host se puede comprobar y el path no, y `youtube.com/redirect?q=…`
 * sigue siendo youtube.com.
 */

/** Los proveedores que sabemos reemitir. `unknown` es todo lo demás. */
export type EmbedProviderId = 'youtube' | 'vimeo' | 'unknown';

/** Qué proveedor se reconoció y con qué `src` se puede pintar un iframe. */
export interface ResolvedEmbedSrc {
  readonly provider: EmbedProviderId;
  /** `src` reconstruido sobre un origen literal, o `''` si no hay proveedor. */
  readonly embedSrc: string;
}

const SIN_PROVEEDOR: ResolvedEmbedSrc = { provider: 'unknown', embedSrc: '' };

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

  // Sufijo EXACTO de subdominio (m./music./gaming.youtube.com), no `endsWith`
  // a secas: `endsWith('youtube.com')` también aceptaba `notyoutube.com`.
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com') {
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

/**
 * Resuelve una url cruda a un `src` embebible, o a `''` si no se reconoce.
 *
 * @param rawUrl Texto tal cual lo escribió el editor. Puede ser cualquier cosa.
 */
export function resolveEmbedSrc(rawUrl: string): ResolvedEmbedSrc {
  const url = parseUrl((rawUrl ?? '').trim());
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return SIN_PROVEEDOR;
  }

  const yt = youtubeId(url);
  if (yt) {
    return {
      provider: 'youtube',
      embedSrc: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}`,
    };
  }

  const vimeo = vimeoId(url);
  if (vimeo) {
    return {
      provider: 'vimeo',
      embedSrc: `https://player.vimeo.com/video/${encodeURIComponent(vimeo)}`,
    };
  }

  return SIN_PROVEEDOR;
}

/**
 * Si una url apunta a un fichero de vídeo servido directamente.
 *
 * Va por separado de `resolveEmbedSrc` porque el destino es otro: un fichero se
 * pinta con `<video>`, no con `<iframe>`. Y eso cambia el problema de
 * seguridad — Angular trata `video[src]` como *URL context*, no *resource URL*,
 * así que lo sanea solo y NO hace falta bypass alguno.
 *
 * Aun así se exige http/https: sin eso un `javascript:` llegaría a Angular, que
 * lo neutraliza reescribiéndolo a `unsafe:javascript:` — seguro, pero pinta un
 * reproductor roto en vez de caer al póster, que es lo que uno quiere ver.
 */
export function isDirectVideoUrl(rawUrl: string): boolean {
  const url = parseUrl((rawUrl ?? '').trim());
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return false;
  }
  return /\.(mp4|webm|ogg|ogv|mov|m3u8)$/i.test(url.pathname);
}
