import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  LivestreamElementComponent,
  resolvePlayerKind,
  sanitizeStreamUrl,
} from './livestream';

describe('LivestreamElementComponent', () => {
  let fixture: ComponentFixture<LivestreamElementComponent>;
  let component: LivestreamElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LivestreamElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(LivestreamElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with no source and expose the empty player state (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasPlayer()).toBe(false);
    expect(component.playerKind()).toBe('none');
    expect(component.hasViewers()).toBe(false);
    expect(component.hasTitle()).toBe(false);
    // Defaults to live with the canonical es-CO badge label.
    expect(component.isLive()).toBe(true);
    expect(component.liveLabel()).toBe('EN VIVO');
  });

  it('should render a provider iframe with badge + viewers from config (render/config case)', async () => {
    fixture.componentRef.setInput('streamUrl', 'https://stream.example.com/embed/abc');
    fixture.componentRef.setInput('title', 'Demo en directo');
    fixture.componentRef.setInput('viewers', 1234);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.playerKind()).toBe('iframe');
    expect(component.hasPlayer()).toBe(true);
    expect(component.streamUrl()).toBe('https://stream.example.com/embed/abc');
    expect(component.hasTitle()).toBe(true);
    expect(component.title()).toBe('Demo en directo');
    expect(component.hasViewers()).toBe(true);
    expect(component.viewers()).toBe(1234);
    expect(component.viewersLabel().replace(/\D/g, '')).toBe('1234');
  });

  it('should detect a direct video file and swap to the offline badge when not live (interaction case)', async () => {
    fixture.componentRef.setInput('streamUrl', 'https://cdn.example.com/clip.mp4');
    fixture.componentRef.setInput('live', false);
    fixture.componentRef.setInput('offlineLabel', 'Repetición');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.playerKind()).toBe('video');
    expect(component.isLive()).toBe(false);
    expect(component.offlineLabel()).toBe('Repetición');
  });

  it('should let direct inputs override config deterministically (idempotent precedence)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"streamUrl":"https://a.example.com/x","live":true,"liveLabel":"LIVE","locale":"en-US"}',
    );
    fixture.componentRef.setInput('liveLabel', 'AL AIRE');
    fixture.componentRef.setInput('locale', 'es-CO');
    fixture.detectChanges();
    await fixture.whenStable();

    // Explicit attribute wins over config; reading twice is stable.
    expect(component.liveLabel()).toBe('AL AIRE');
    expect(component.locale()).toBe('es-CO');
    expect(component.streamUrl()).toBe('https://a.example.com/x');
    expect(component.streamUrl()).toBe('https://a.example.com/x');
  });
});

describe('livestream pure helpers', () => {
  it('sanitizeStreamUrl accepts http(s) and rejects other schemes / relative input', () => {
    expect(sanitizeStreamUrl('https://x.example.com/a')).toBe('https://x.example.com/a');
    expect(sanitizeStreamUrl('http://x.example.com/a')).toBe('http://x.example.com/a');
    expect(sanitizeStreamUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeStreamUrl('/relative/path')).toBe('');
    expect(sanitizeStreamUrl(undefined)).toBe('');
  });

  // Esta verja es la precondición del bypass de `embedSrc`: lo que se valida tiene que
  // ser exactamente lo que se emite. Sin estos dos casos, devolver la cadena CRUDA en
  // vez del href parseado pasaba desapercibido — las urls de arriba ya venían normalizadas.
  it('sanitizeStreamUrl emits the parsed href and drops protocol-relative input', () => {
    // Sin origen explícito no hay origen que validar: el navegador lo resolvería
    // después contra otra base, así que nunca debe llegar al src del iframe.
    expect(sanitizeStreamUrl('//evil.example.com/x')).toBe('');
    // Normalización del parser (esquema en minúsculas + path raíz), no la cruda.
    expect(sanitizeStreamUrl('HTTPS://x.example.com')).toBe('https://x.example.com/');
  });

  it('resolvePlayerKind honors explicit type then falls back to extension sniffing', () => {
    expect(resolvePlayerKind('', undefined)).toBe('none');
    expect(resolvePlayerKind('https://x/clip.webm', undefined)).toBe('video');
    expect(resolvePlayerKind('https://x/embed/abc', undefined)).toBe('iframe');
    expect(resolvePlayerKind('https://x/embed/abc', 'video')).toBe('video');
    expect(resolvePlayerKind('https://x/clip.mp4', 'iframe')).toBe('iframe');
  });
});
