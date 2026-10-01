import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { VideoPlayerProps } from '@synergos/contracts';
import { t } from '@synergos/vitals-core';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * <synergos-video-player>: an accessible HTML5 video player with custom chrome — play/pause,
 * seek, volume + mute, fullscreen, and an optional title. The poster image shows before
 * playback. Built so a visitor can drive the whole player from the keyboard (Space/K play,
 * ←/→ seek, ↑/↓ volume, M mute, F fullscreen).
 *
 * El `config` que manda el CMS tiene la forma de `VideoPlayerProps`, GENERADO del record C#
 * (ADR 0135): `videoFile` y `posterImage` son las URLs de los medios que eligió el editor. La
 * vista mandaba `videoUrl`/`posterUrl` y este elemento no tenía fuente (D1). `title`,
 * `autoplay`, `loop` y `muted` no los autora el editor: llegan por atributo. Capítulos y
 * analítica no están implementados (los atributos `chaptersJson`/`enableAnalytics` son inertes),
 * así que el CMS no los manda.
 *
 * Los textos de la interfaz salen del diccionario con `t()` (ADR 0136), de DOS secciones que
 * declara `VideoPlayerProps`: `Media`, el transporte que comparte con `audio-player`
 * (reproducir, pausar, silenciar, volumen, posición, «x de y») —una sola clave por concepto, no
 * dos copias de «Pausar»—, y `Video`, lo que sólo tiene un video (pantalla completa, su nombre
 * accesible y su estado vacío).
 */
/** Emitted on the `playstatechange` CustomEvent and the typed Angular output. */
export interface VideoPlayStateDetail {
  readonly playing: boolean;
  readonly currentTime: number;
  readonly duration: number;
}

const SEEK_STEP_SECONDS = 5;
const VOLUME_STEP = 0.1;
const DEFAULT_VOLUME = 1;

/** Format a seconds value as `m:ss` (or `h:mm:ss` past an hour). */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '0:00';
  }

  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

/** Clamp a number into the inclusive [min, max] range. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeVideoPlayerConfig(value: Partial<VideoPlayerProps>): Partial<VideoPlayerProps> {
  return omitUndefinedProperties<VideoPlayerProps>({
    videoFile: coerceTrimmedStringInput(value.videoFile),
    posterImage: coerceTrimmedStringInput(value.posterImage),
  });
}

@Component({
  selector: 'sg-video-player',
  standalone: true,
  templateUrl: './video-player.html',
  styleUrl: './video-player.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-video-player' },
})
export class VideoPlayerElementComponent {
  readonly #host = inject(ElementRef<HTMLElement>);
  protected readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly config = input<Partial<VideoPlayerProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<VideoPlayerProps>(sanitizeVideoPlayerConfig),
  });
  readonly videoFileInput = input<string | undefined>(undefined, { alias: 'videoFile' });
  readonly posterImageInput = input<string | undefined>(undefined, { alias: 'posterImage' });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly autoplayInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'autoplay',
    transform: coerceOptionalBooleanInput,
  });
  readonly loopInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'loop',
    transform: coerceOptionalBooleanInput,
  });
  readonly mutedInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'muted',
    transform: coerceOptionalBooleanInput,
  });
  // Inert CMS bridge inputs — kept so the host attributes round-trip cleanly.
  readonly chaptersJson = input<string | undefined>(undefined);
  readonly enableAnalytics = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `playstatechange` CustomEvent. */
  readonly playstatechange = output<VideoPlayStateDetail>();

  // ─── Resolved config ────────────────────────────────────────────────────────
  readonly src = computed(() =>
    resolveConfigValue(this.videoFileInput(), this.config()?.videoFile, ''),
  );
  readonly poster = computed(() =>
    resolveConfigValue(this.posterImageInput(), this.config()?.posterImage, ''),
  );
  readonly title = computed(() => this.titleInput() ?? '');
  readonly autoplay = computed(() => this.autoplayInput() ?? false);
  readonly loop = computed(() => this.loopInput() ?? false);
  readonly initiallyMuted = computed(() => this.mutedInput() ?? false);

  readonly hasSource = computed(() => this.src().trim().length > 0);
  readonly hasTitle = computed(() => this.title().trim().length > 0);

  // ─── Reactive playback state ────────────────────────────────────────────────
  readonly playing = signal(false);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly volume = signal(DEFAULT_VOLUME);
  readonly muted = signal(false);
  readonly fullscreen = signal(false);
  readonly canPlay = signal(false);

  /** Played fraction in [0, 1] for the progress bar fill + slider value. */
  readonly progress = computed(() => {
    const total = this.duration();
    if (total <= 0) {
      return 0;
    }
    return clamp(this.currentTime() / total, 0, 1);
  });

  readonly progressPercent = computed(() => `${(this.progress() * 100).toFixed(2)}%`);
  readonly volumePercent = computed(() => `${(this.effectiveVolume() * 100).toFixed(0)}%`);

  /** Volume the user actually hears (0 while muted). */
  readonly effectiveVolume = computed(() => (this.muted() ? 0 : this.volume()));

  readonly currentTimeLabel = computed(() => formatTime(this.currentTime()));
  readonly durationLabel = computed(() => formatTime(this.duration()));

  readonly playLabel = computed(() =>
    this.playing() ? t('Media.Pause', 'Pausar') : t('Media.Play', 'Reproducir'),
  );
  readonly muteLabel = computed(() =>
    this.muted() || this.effectiveVolume() === 0 ? t('Media.Unmute', 'Activar sonido') : t('Media.Mute', 'Silenciar'),
  );
  readonly fullscreenLabel = computed(() =>
    this.fullscreen()
      ? t('Video.ExitFullscreen', 'Salir de pantalla completa')
      : t('Video.Fullscreen', 'Pantalla completa'),
  );

  /** Nombre del reproductor y del `<video>` cuando el editor no le dio título. */
  readonly groupLabel = computed(() => (this.hasTitle() ? this.title() : t('Video.Player', 'Reproductor de video')));
  readonly mediaLabel = computed(() => (this.hasTitle() ? this.title() : t('Video.Aria', 'Video')));
  readonly seekLabel = computed(() => t('Media.Seek', 'Posición de reproducción'));
  readonly volumeLabel = computed(() => t('Media.Volume', 'Volumen'));
  /** «0:12 de 3:40»: el valor que lee el lector de pantalla en la barra de posición. */
  readonly seekValueText = computed(() =>
    t('Media.Time', '{current} de {total}', { current: this.currentTimeLabel(), total: this.durationLabel() }),
  );
  readonly emptyLabel = computed(() => t('Video.Empty', 'No hay un video configurado.'));

  // ─── Media element queries ──────────────────────────────────────────────────
  #media(): HTMLVideoElement | null {
    return this.videoRef()?.nativeElement ?? null;
  }

  // ─── Transport controls ─────────────────────────────────────────────────────
  togglePlay(): void {
    const media = this.#media();
    if (!media) {
      return;
    }
    if (media.paused || media.ended) {
      void media.play().catch(() => {
        // Autoplay/gesture rejection is non-fatal; state stays paused.
        this.playing.set(false);
      });
    } else {
      media.pause();
    }
  }

  /** Seek to an absolute fraction in [0, 1] (slider input / progress click). */
  seekToFraction(fraction: number): void {
    const media = this.#media();
    const total = this.duration();
    if (!media || total <= 0) {
      return;
    }
    const target = clamp(fraction, 0, 1) * total;
    media.currentTime = target;
    this.currentTime.set(target);
  }

  /** Relative seek in seconds (keyboard arrows). */
  seekBy(deltaSeconds: number): void {
    const media = this.#media();
    const total = this.duration();
    if (!media || total <= 0) {
      return;
    }
    const target = clamp(media.currentTime + deltaSeconds, 0, total);
    media.currentTime = target;
    this.currentTime.set(target);
  }

  setVolume(next: number): void {
    const media = this.#media();
    const clamped = clamp(next, 0, 1);
    this.volume.set(clamped);
    if (clamped > 0 && this.muted()) {
      this.muted.set(false);
    }
    if (media) {
      media.volume = clamped;
      media.muted = this.muted();
    }
  }

  changeVolumeBy(delta: number): void {
    this.setVolume(this.volume() + delta);
  }

  toggleMute(): void {
    const media = this.#media();
    const next = !this.muted();
    this.muted.set(next);
    if (media) {
      media.muted = next;
    }
  }

  toggleFullscreen(): void {
    const root = this.#host.nativeElement;
    if (typeof document === 'undefined') {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    } else {
      void root.requestFullscreen?.().catch(() => undefined);
    }
  }

  // ─── Slider / progress handlers ─────────────────────────────────────────────
  onSeekInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
      return;
    }
    const value = Number(target.value);
    this.seekToFraction(Number.isFinite(value) ? value / 100 : 0);
  }

  onVolumeInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
      return;
    }
    const value = Number(target.value);
    this.setVolume(Number.isFinite(value) ? value / 100 : 0);
  }

  /** Keyboard shortcuts on the player surface (button-level handlers stop here). */
  onSurfaceKeydown(event: KeyboardEvent): void {
    const handlers: Record<string, () => void> = {
      ' ': () => this.togglePlay(),
      k: () => this.togglePlay(),
      K: () => this.togglePlay(),
      ArrowRight: () => this.seekBy(SEEK_STEP_SECONDS),
      ArrowLeft: () => this.seekBy(-SEEK_STEP_SECONDS),
      ArrowUp: () => this.changeVolumeBy(VOLUME_STEP),
      ArrowDown: () => this.changeVolumeBy(-VOLUME_STEP),
      m: () => this.toggleMute(),
      M: () => this.toggleMute(),
      f: () => this.toggleFullscreen(),
      F: () => this.toggleFullscreen(),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  // ─── Native media event sinks ───────────────────────────────────────────────
  onLoadedMetadata(): void {
    const media = this.#media();
    if (!media) {
      return;
    }
    this.duration.set(Number.isFinite(media.duration) ? media.duration : 0);
    this.volume.set(media.volume);
    this.muted.set(media.muted || this.initiallyMuted());
    media.muted = this.muted();
  }

  onCanPlay(): void {
    this.canPlay.set(true);
  }

  onTimeUpdate(): void {
    const media = this.#media();
    if (media) {
      this.currentTime.set(media.currentTime);
    }
  }

  onDurationChange(): void {
    const media = this.#media();
    if (media && Number.isFinite(media.duration)) {
      this.duration.set(media.duration);
    }
  }

  onPlay(): void {
    this.playing.set(true);
    this.emitState();
  }

  onPause(): void {
    this.playing.set(false);
    this.emitState();
  }

  onEnded(): void {
    this.playing.set(false);
    this.emitState();
  }

  onVolumeChange(): void {
    const media = this.#media();
    if (media) {
      this.volume.set(media.volume);
      this.muted.set(media.muted);
    }
  }

  /** Sync fullscreen signal with the document; wired from the template host. */
  onFullscreenChange(): void {
    if (typeof document === 'undefined') {
      return;
    }
    this.fullscreen.set(document.fullscreenElement === this.#host.nativeElement);
  }

  private emitState(): void {
    const detail: VideoPlayStateDetail = {
      playing: this.playing(),
      currentTime: this.currentTime(),
      duration: this.duration(),
    };
    this.playstatechange.emit(detail);
  }
}
