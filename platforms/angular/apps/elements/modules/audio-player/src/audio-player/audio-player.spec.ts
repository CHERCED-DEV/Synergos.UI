import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AUDIO_PLAYER_SYNHOST } from '@synergos/contracts';
import {
  AudioPlayerElementComponent,
  type AudioPlaybackChangeDetail,
  formatTime,
} from './audio-player';

describe('AudioPlayerElementComponent', () => {
  let fixture: ComponentFixture<AudioPlayerElementComponent>;
  let component: AudioPlayerElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AudioPlayerElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AudioPlayerElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render the empty state with no source (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasSource()).toBe(false);
    expect(component.duration()).toBe(0);
    expect(component.currentTimeLabel()).toBe('0:00');

    const empty = fixture.nativeElement.querySelector('.audio-player__empty');
    expect(empty).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.audio-player__transport')).toBeNull();
  });

  it('should resolve config + attributes and render transport (render/config case)', async () => {
    fixture.componentRef.setInput('config', '{"audioFile":"/media/a.mp3","trackTitle":"Config title","artistName":"Estoico"}');
    fixture.componentRef.setInput('trackTitle', 'Atributo gana');
    fixture.componentRef.setInput('preload', 'auto');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasSource()).toBe(true);
    expect(component.audioFile()).toBe('/media/a.mp3');
    // Direct attribute wins over config.
    expect(component.trackTitle()).toBe('Atributo gana');
    expect(component.artistName()).toBe('Estoico');
    expect(component.preload()).toBe('auto');
    expect(component.mediaLabel()).toBe('Atributo gana — Estoico');

    const transport = fixture.nativeElement.querySelector('.audio-player__transport');
    expect(transport).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.audio-player__empty')).toBeNull();
  });

  it('should track playback state and emit playbackchange on play/pause/ended (interaction case)', () => {
    const emitted: AudioPlaybackChangeDetail[] = [];
    component.playbackchange.subscribe((detail) => emitted.push(detail));

    component.onPlay();
    expect(component.isPlaying()).toBe(true);
    expect(component.state()).toBe('playing');

    component.onPause();
    expect(component.isPlaying()).toBe(false);
    expect(component.state()).toBe('paused');

    component.onEnded();
    expect(component.state()).toBe('ended');

    expect(emitted.map((event) => event.state)).toEqual(['playing', 'paused', 'ended']);
  });

  // `loop` y `preload` no los autora el CMS (ADR 0135): son atributos, no viajan en `config`.
  it('should let direct inputs override config idempotently (precedence case)', async () => {
    fixture.componentRef.setInput('config', '{"trackTitle":"Del config"}');
    fixture.componentRef.setInput('preload', 'none');
    fixture.componentRef.setInput('loop', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const firstPreload = component.preload();
    const firstLoop = component.loop();

    // Re-applying the same inputs yields the same resolved values.
    fixture.componentRef.setInput('preload', 'none');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.trackTitle()).toBe('Del config');
    expect(component.preload()).toBe('none');
    expect(component.preload()).toBe(firstPreload);
    expect(component.loop()).toBe(true);
    expect(component.loop()).toBe(firstLoop);
  });

  // D1: con `audioUrl` —lo que mandaba la vista— este elemento salía sin fuente. Éste alimenta
  // el `config` EXACTO que emite hoy la vista del CMS.
  it('reproduce el medio que el editor eligió con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = AUDIO_PLAYER_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasSource()).toBe(true);
    expect(component.audioFile()).toBe(ejemplo.audioFile);
    expect(component.trackTitle()).toBe(ejemplo.trackTitle);
    expect(component.artistName()).toBe(ejemplo.artistName);
    expect(fixture.nativeElement.querySelector('.audio-player__empty')).toBeNull();
  });
});

describe('audio-player pure helpers', () => {
  it('formatTime renders m:ss, h:mm:ss and guards invalid input', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
  });
});
