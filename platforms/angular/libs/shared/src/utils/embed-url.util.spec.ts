import { resolveEmbedSrc, isDirectVideoUrl } from './embed-url.util';

/**
 * La frontera de seguridad de los embeds (issue #10).
 *
 * Estos tests no vigilan que los vídeos se vean. Vigilan que **la url que sale
 * nunca sea la que entró** — que es lo único que hace legítimo el
 * `bypassSecurityTrustResourceUrl` de quien la consume.
 *
 *   > Si alguna vez `resolveEmbedSrc` devolviera la url de entrada tal cual,
 *   > los dos elementos que la usan pasarían a meter texto del editor en el
 *   > `src` de un iframe con `allow="clipboard-write; encrypted-media"`.
 *
 * Por eso hay más tests de lo que se RECHAZA que de lo que se acepta.
 */
describe('resolveEmbedSrc — lo que se rechaza', () => {
  it.each([
    ['javascript:alert(1)', 'el clásico'],
    ['JavaScript:alert(1)', 'con mayúsculas, por si alguien compara en minúsculas'],
    ['data:text/html;base64,PHNjcmlwdD4=', 'data: URL con HTML'],
    ['vbscript:msgbox(1)', 'el otro clásico'],
    ['file:///etc/passwd', 'esquema local'],
    ['//evil.com/x', 'protocol-relative — ni siquiera parsea sin base'],
    ['', 'vacío'],
    ['   ', 'sólo espacios'],
    ['no es una url', 'texto suelto'],
  ])('%s → sin proveedor (%s)', (entrada) => {
    const { provider, embedSrc } = resolveEmbedSrc(entrada);
    expect(provider).toBe('unknown');
    expect(embedSrc).toBe('');
  });

  it('un host que sólo TERMINA en youtube.com no es youtube.com', () => {
    // `endsWith('youtube.com')` a secas aceptaba `notyoutube.com`. El defecto
    // ya se cazó una vez en oembed; el test viaja con la función.
    expect(resolveEmbedSrc('https://notyoutube.com/watch?v=abc').embedSrc).toBe('');
    expect(resolveEmbedSrc('https://evilyoutube.com/embed/abc').embedSrc).toBe('');
  });

  it('un dominio cualquiera no se embebe aunque parezca un vídeo', () => {
    expect(resolveEmbedSrc('https://evil.com/embed/abc123').embedSrc).toBe('');
  });
});

describe('resolveEmbedSrc — la url SALE reconstruida, nunca tal cual', () => {
  it('youtube: la de entrada no sobrevive; sale sobre el origen literal', () => {
    const entrada = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const { provider, embedSrc } = resolveEmbedSrc(entrada);

    expect(provider).toBe('youtube');
    expect(embedSrc).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(embedSrc).not.toBe(entrada); // la propiedad que sostiene el bypass
  });

  it.each([
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/abc123', 'abc123'],
    ['https://www.youtube.com/shorts/xyz789', 'xyz789'],
    ['https://m.youtube.com/watch?v=sub-dominio', 'sub-dominio'],
    ['https://www.youtube-nocookie.com/embed/nocookie1', 'nocookie1'],
  ])('%s → id %s', (entrada, id) => {
    expect(resolveEmbedSrc(entrada).embedSrc).toBe(
      `https://www.youtube-nocookie.com/embed/${id}`,
    );
  });

  it('vimeo sale sobre player.vimeo.com', () => {
    const { provider, embedSrc } = resolveEmbedSrc('https://vimeo.com/123456789');
    expect(provider).toBe('vimeo');
    expect(embedSrc).toBe('https://player.vimeo.com/video/123456789');
  });

  it('un id con caracteres raros NO puede salirse de su segmento', () => {
    // Es lo que compra el encodeURIComponent: sin él, un id con `/` o `?`
    // reescribiría el path o añadiría query sobre un origen que confiamos.
    const { embedSrc } = resolveEmbedSrc('https://www.youtube.com/watch?v=a/../../b%3Fx');
    expect(embedSrc.startsWith('https://www.youtube-nocookie.com/embed/')).toBe(true);
    expect(embedSrc).not.toContain('/../');

    // Y el origen sigue siendo el nuestro, se meta lo que se meta.
    expect(new URL(embedSrc).origin).toBe('https://www.youtube-nocookie.com');
  });

  it('el origen resultante SIEMPRE es uno de los dos que confiamos', () => {
    const entradas = [
      'https://www.youtube.com/watch?v=1',
      'https://youtu.be/2',
      'https://vimeo.com/3',
      'https://player.vimeo.com/video/4',
      'https://gaming.youtube.com/watch?v=5',
    ];
    const origenes = entradas
      .map((e) => resolveEmbedSrc(e).embedSrc)
      .filter(Boolean)
      .map((s) => new URL(s).origin);

    expect(origenes).toHaveLength(entradas.length);
    for (const o of origenes) {
      expect(['https://www.youtube-nocookie.com', 'https://player.vimeo.com']).toContain(o);
    }
  });
});

describe('isDirectVideoUrl', () => {
  it.each([
    'https://cdn.ejemplo.com/clip.mp4',
    'https://cdn.ejemplo.com/clip.webm',
    'https://cdn.ejemplo.com/ruta/con/varios/segmentos/clip.MOV',
    'https://cdn.ejemplo.com/stream.m3u8',
  ])('%s → sí', (u) => {
    expect(isDirectVideoUrl(u)).toBe(true);
  });

  it('la extensión se mira en el PATH, no en la query', () => {
    // `?redir=x.mp4` no hace que la respuesta sea un vídeo. Mirar la url entera
    // convertiría cualquier enlace con esa query en un <video> roto.
    expect(isDirectVideoUrl('https://ejemplo.com/pagina?redir=x.mp4')).toBe(false);
  });

  it('un esquema que no es http(s) NO es un fichero reproducible', () => {
    // Angular sanearía `video[src]` igual, pero lo reescribiría a
    // `unsafe:javascript:` y pintaría un reproductor roto en vez de caer al
    // póster — que es lo que uno quiere ver.
    expect(isDirectVideoUrl('javascript:alert(1)')).toBe(false);
    expect(isDirectVideoUrl('data:video/mp4;base64,AAAA')).toBe(false);
  });

  it('un embed de youtube NO es un fichero directo', () => {
    // Si las dos dieran true, el orden de las ramas decidiría el resultado y
    // un cambio inocente de orden movería el comportamiento.
    expect(isDirectVideoUrl('https://www.youtube.com/watch?v=abc')).toBe(false);
  });
});
