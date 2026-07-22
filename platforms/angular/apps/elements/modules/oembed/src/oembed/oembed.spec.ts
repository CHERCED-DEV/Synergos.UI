import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  OembedElementComponent,
  normalizeAspectRatio,
  resolveEmbed,
} from './oembed';

describe('OembedElementComponent', () => {
  let fixture: ComponentFixture<OembedElementComponent>;
  let component: OembedElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OembedElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(OembedElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and show no resource with no URL (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasUrl()).toBe(false);
    expect(component.isEmbeddable()).toBe(false);
    // Defaults still resolve to a sane aspect ratio.
    expect(component.aspectRatio()).toBe('16 / 9');
  });

  it('should resolve a YouTube URL into an embeddable iframe src honoring config (render/config case)', async () => {
    fixture.componentRef.setInput('embedUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    fixture.componentRef.setInput('title', 'Video destacado');
    fixture.componentRef.setInput('aspectRatio', '4:3');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasUrl()).toBe(true);
    expect(component.isEmbeddable()).toBe(true);
    expect(component.resolved().provider).toBe('youtube');
    expect(component.resolved().embedSrc).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(component.resolved().title).toBe('Video destacado');
    expect(component.aspectRatio()).toBe('4 / 3');
  });

  it('should fall back to a link for unrecognized providers (interaction/degraded case)', async () => {
    fixture.componentRef.setInput('embedUrl', 'https://example.com/some/article');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasUrl()).toBe(true);
    expect(component.isEmbeddable()).toBe(false);
    expect(component.resolved().provider).toBe('unknown');
    expect(component.resolved().embedSrc).toBe('');
    // Title falls back to the canonical default label.
    expect(component.resolved().title).toBe('Contenido embebido');
  });

  it('should let a direct input override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"embedUrl":"https://vimeo.com/76979871","aspectRatio":"1:1"}',
    );
    fixture.componentRef.setInput('embedUrl', 'https://youtu.be/dQw4w9WgXcQ');
    fixture.detectChanges();
    await fixture.whenStable();

    // Direct attribute wins over config.
    expect(component.resolved().provider).toBe('youtube');
    expect(component.resolved().embedSrc).toContain('dQw4w9WgXcQ');
    // Config-only value still applies where there is no direct override.
    expect(component.aspectRatio()).toBe('1 / 1');

    // Re-applying the same inputs yields the same resolution (idempotent).
    const first = component.resolved();
    fixture.detectChanges();
    expect(component.resolved()).toEqual(first);
  });
});

describe('oembed pure helpers', () => {
  it('normalizeAspectRatio accepts ratios, decimals, and falls back', () => {
    expect(normalizeAspectRatio('16:9')).toBe('16 / 9');
    expect(normalizeAspectRatio('16 / 9')).toBe('16 / 9');
    expect(normalizeAspectRatio('1.5')).toBe('1.5 / 1');
    expect(normalizeAspectRatio('basura')).toBe('16 / 9');
    expect(normalizeAspectRatio(undefined)).toBe('16 / 9');
    expect(normalizeAspectRatio('0:0')).toBe('16 / 9');
  });

  it('resolveEmbed maps providers and rejects junk', () => {
    expect(resolveEmbed('https://youtu.be/abc123', 't', '16 / 9').provider).toBe('youtube');
    expect(resolveEmbed('https://vimeo.com/76979871', 't', '16 / 9').provider).toBe('vimeo');
    expect(resolveEmbed('https://vimeo.com/76979871', 't', '16 / 9').embedSrc).toContain(
      'player.vimeo.com/video/76979871',
    );
    expect(resolveEmbed('not-a-url', 't', '16 / 9').provider).toBe('unknown');
    expect(resolveEmbed('ftp://youtube.com/watch?v=x', 't', '16 / 9').provider).toBe('unknown');
  });

  it('resolveEmbed matches youtube by exact subdomain, not by suffix', () => {
    // El allowlist de proveedores es lo que legitima el bypassSecurityTrustResourceUrl
    // de `safeEmbedSrc`, así que un look-alike NO puede colarse como proveedor.
    expect(resolveEmbed('https://notyoutube.com/watch?v=abc123', 't', '16 / 9').provider).toBe(
      'unknown',
    );
    expect(resolveEmbed('https://m.youtube.com/watch?v=abc123', 't', '16 / 9').provider).toBe(
      'youtube',
    );
  });

  it('embedSrc NUNCA sale del origen literal, pegue el editor lo que pegue', () => {
    // Este es el contrato que sostiene el `bypassSecurityTrustResourceUrl`:
    // `embedSrc` sólo puede ser '' o una url sobre uno de DOS orígenes literales.
    // Si algún día alguien reemite `rawUrl` en vez de reconstruirla, esto se cae.
    const ORIGENES_PERMITIDOS = [
      'https://www.youtube-nocookie.com/embed/',
      'https://player.vimeo.com/video/',
    ];

    const hostiles = [
      // Esquemas peligrosos directos.
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      // Look-alikes y sufijos de host.
      'https://notyoutube.com/watch?v=abc',
      'https://youtube.com.evil.com/watch?v=abc',
      'https://evil.com/?v=abc',
      'https://evil.youtu.be/abc',
      'https://vimeo.com.evil.com/76979871',
      // Payload dentro del id, que es la única parte que viene del editor.
      'https://youtube.com/watch?v=javascript:alert(1)',
      'https://youtube.com/watch?v=../../../evil',
      'https://youtube.com/watch?v=@evil.com',
      'https://youtube.com/watch?v=%2F%2Fevil.com',
      'https://youtu.be/..%2F..%2Fevil',
      'https://youtu.be/@evil.com',
      "https://youtube.com/watch?v=x\"></iframe><script>alert(1)</script>",
      'https://youtube.com/embed/#/../evil',
    ];

    for (const hostil of hostiles) {
      const { embedSrc } = resolveEmbed(hostil, 't', '16 / 9');
      if (embedSrc === '') {
        continue;
      }
      expect(
        ORIGENES_PERMITIDOS.some((origen) => embedSrc.startsWith(origen)),
        `"${hostil}" produjo un embedSrc fuera del allowlist: "${embedSrc}"`,
      ).toBe(true);
      // Y el id jamás puede reintroducir un separador que lo saque de su segmento.
      expect(embedSrc.slice('https://'.length)).not.toContain('//');
    }
  });

  it('el id del editor sale percent-encoded — encodeURIComponent es LOAD-BEARING', () => {
    // Valores exactos, no `toContain`: si alguien quita el encodeURIComponent de
    // `resolveEmbed`, estas tres se caen. `%2F%2F` es la peligrosa — sin encodear
    // produce `.../embed///evil.com`, que el navegador lee como cambio de host.
    expect(resolveEmbed('https://youtube.com/watch?v=%2F%2Fevil.com', 't', '16 / 9').embedSrc).toBe(
      'https://www.youtube-nocookie.com/embed/%2F%2Fevil.com',
    );
    expect(
      resolveEmbed('https://youtube.com/watch?v=javascript:alert(1)', 't', '16 / 9').embedSrc,
    ).toBe('https://www.youtube-nocookie.com/embed/javascript%3Aalert(1)');
    expect(resolveEmbed('https://youtu.be/@evil.com', 't', '16 / 9').embedSrc).toBe(
      'https://www.youtube-nocookie.com/embed/%40evil.com',
    );
  });
});
