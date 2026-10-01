import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VIDEO_PLAYER_SYNHOST } from '@synergos/contracts';
import {
  VideoPlayerElementComponent,
  type VideoPlayStateDetail,
  clamp,
  formatTime,
} from './video-player';

describe('VideoPlayerElementComponent', () => {
  let fixture: ComponentFixture<VideoPlayerElementComponent>;
  let component: VideoPlayerElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoPlayerElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoPlayerElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and stay idle without a source (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasSource()).toBe(false);
    expect(component.playing()).toBe(false);
    expect(component.progress()).toBe(0);
    expect(component.currentTimeLabel()).toBe('0:00');
    // No <video> rendered → media queries are inert.
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
  });

  // `title` no lo autora el CMS (ADR 0135): es atributo, no viaja en `config`.
  it('should resolve src/poster from config and title from its attribute (render/config case)', async () => {
    fixture.componentRef.setInput('config', {
      videoFile: 'https://cdn.example.com/clip.mp4',
      posterImage: 'https://cdn.example.com/poster.jpg',
    });
    fixture.componentRef.setInput('title', 'Override title');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasSource()).toBe(true);
    expect(component.src()).toBe('https://cdn.example.com/clip.mp4');
    expect(component.poster()).toBe('https://cdn.example.com/poster.jpg');
    expect(component.title()).toBe('Override title');
    expect(fixture.nativeElement.querySelector('video')).not.toBeNull();
  });

  // D1: con `videoUrl`/`posterUrl` —lo que mandaba la vista— este elemento no tenía fuente. Éste
  // alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('reproduce el video que el editor eligió con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = VIDEO_PLAYER_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasSource()).toBe(true);
    expect(component.src()).toBe(ejemplo.videoFile);
    expect(component.poster()).toBe(ejemplo.posterImage);
    const video = (fixture.nativeElement as HTMLElement).querySelector('video');
    expect(video?.getAttribute('poster')).toBe(ejemplo.posterImage);
  });

  it('should toggle play state and emit playstatechange (interaction case)', async () => {
    fixture.componentRef.setInput('videoFile', 'https://cdn.example.com/clip.mp4');
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: VideoPlayStateDetail | undefined;
    component.playstatechange.subscribe((detail) => (emitted = detail));

    component.onPlay();
    expect(component.playing()).toBe(true);
    expect(emitted?.playing).toBe(true);

    component.onPause();
    expect(component.playing()).toBe(false);
    expect(emitted?.playing).toBe(false);

    // Mute toggling flips both the signal and the derived label.
    expect(component.muted()).toBe(false);
    component.toggleMute();
    expect(component.muted()).toBe(true);
    expect(component.muteLabel()).toBe('Activar sonido');
  });

  it('should clamp volume idempotently regardless of call order (idempotent case)', () => {
    component.setVolume(0.4);
    expect(component.volume()).toBeCloseTo(0.4);

    // Out-of-range inputs clamp to the same bounds every time.
    component.setVolume(5);
    expect(component.volume()).toBe(1);
    component.setVolume(5);
    expect(component.volume()).toBe(1);

    component.setVolume(-3);
    expect(component.volume()).toBe(0);
    component.setVolume(-3);
    expect(component.volume()).toBe(0);

    // Raising volume above zero un-mutes.
    component.toggleMute();
    expect(component.muted()).toBe(true);
    component.setVolume(0.5);
    expect(component.muted()).toBe(false);
    expect(component.effectiveVolume()).toBeCloseTo(0.5);
  });
});

describe('video-player pure helpers', () => {
  it('formatTime renders m:ss and h:mm:ss, guarding invalid input', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(-5)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });

  it('clamp keeps values inside the inclusive range', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(Number.NaN, 0, 1)).toBe(0);
  });
});

/** El puente que publica la página (ADR 0136): sólo las claves que se pasan. */
function publicar(keys: Record<string, string>): void {
  (window as { synergos?: unknown }).synergos = { i18n: { culture: 'en-US', defaultCulture: 'es-CO', keys } };
}

describe('video-player — microcopia del diccionario (ADR 0136, secciones Media y Video)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoPlayerElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => {
    delete (window as { synergos?: unknown }).synergos;
  });

  it('el transporte sale de Media (el mismo que audio-player) y lo propio del video, de Video', async () => {
    publicar({
      'Media.Play': 'Play',
      'Media.Mute': 'Mute',
      'Media.Seek': 'Playback position',
      'Media.Time': '{current} of {total}',
      'Video.Player': 'Video player',
      'Video.Fullscreen': 'Fullscreen',
    });
    const fixture = TestBed.createComponent(VideoPlayerElementComponent);
    fixture.componentRef.setInput('config', JSON.stringify(VIDEO_PLAYER_SYNHOST.ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();
    const c = fixture.componentInstance;

    expect(c.playLabel()).toBe('Play');
    expect(c.muteLabel()).toBe('Mute');
    expect(c.fullscreenLabel()).toBe('Fullscreen');
    const raiz = fixture.nativeElement as HTMLElement;
    expect(raiz.querySelector('.video-player')?.getAttribute('aria-label')).toBe('Video player');
    const posicion = raiz.querySelector('.video-player__seek-input');
    expect(posicion?.getAttribute('aria-label')).toBe('Playback position');
    expect(posicion?.getAttribute('aria-valuetext')).toBe('0:00 of 0:00');
    // Lo que la página no publica sale por el respaldo es-CO, nunca la clave cruda.
    expect(raiz.querySelector('.video-player__volume-input')?.getAttribute('aria-label')).toBe('Volumen');
  });

  it('sin fuente, el estado vacío es el de Video', async () => {
    publicar({ 'Video.Empty': 'No video has been set up.' });
    const fixture = TestBed.createComponent(VideoPlayerElementComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const vacio = (fixture.nativeElement as HTMLElement).querySelector('.video-player__empty');
    expect(vacio?.textContent?.trim()).toBe('No video has been set up.');
  });
});
