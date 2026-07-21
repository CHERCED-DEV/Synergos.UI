import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('should resolve src/poster/title from config + attributes (render/config case)', async () => {
    fixture.componentRef.setInput('config', {
      videoFile: 'https://cdn.example.com/clip.mp4',
      posterImage: 'https://cdn.example.com/poster.jpg',
      title: 'Config title',
    });
    fixture.componentRef.setInput('title', 'Override title');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasSource()).toBe(true);
    expect(component.src()).toBe('https://cdn.example.com/clip.mp4');
    expect(component.poster()).toBe('https://cdn.example.com/poster.jpg');
    // Explicit attribute wins over config.
    expect(component.title()).toBe('Override title');
    expect(fixture.nativeElement.querySelector('video')).not.toBeNull();
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
