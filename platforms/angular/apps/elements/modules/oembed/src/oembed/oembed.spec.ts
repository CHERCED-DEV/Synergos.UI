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
});
