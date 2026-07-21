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
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynVideoPlayer</c>.
 *
 * An accessible HTML5 video player with custom chrome: play/pause, seek,
 * volume + mute, fullscreen, and an optional title. The poster image shows
 * before playback. Built so a visitor can drive the whole player from the
 * keyboard (Space/K play, ←/→ seek, ↑/↓ volume, M mute, F fullscreen).
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface VideoPlayerRuntimeConfig {
  readonly videoFile?: string;
  readonly posterImage?: string;
  readonly title?: string;
  readonly autoplay?: boolean;
  readonly loop?: boolean;
  readonly muted?: boolean;
}

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

function sanitizeVideoPlayerConfig(
  value: Partial<VideoPlayerRuntimeConfig>,
): VideoPlayerRuntimeConfig {
  return omitUndefinedProperties<VideoPlayerRuntimeConfig>({
    videoFile: coerceTrimmedStringInput(value.videoFile),
    posterImage: coerceTrimmedStringInput(value.posterImage),
    title: coerceTrimmedStringInput(value.title),
    autoplay: coerceOptionalBooleanInput(value.autoplay),
    loop: coerceOptionalBooleanInput(value.loop),
    muted: coerceOptionalBooleanInput(value.muted),
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

  readonly config = input<VideoPlayerRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<VideoPlayerRuntimeConfig>(sanitizeVideoPlayerConfig),
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
  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly autoplay = computed(() =>
    resolveConfigValue(this.autoplayInput(), this.config()?.autoplay, false),
  );
  readonly loop = computed(() =>
    resolveConfigValue(this.loopInput(), this.config()?.loop, false),
  );
  readonly initiallyMuted = computed(() =>
    resolveConfigValue(this.mutedInput(), this.config()?.muted, false),
  );

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

  readonly playLabel = computed(() => (this.playing() ? 'Pausar' : 'Reproducir'));
  readonly muteLabel = computed(() =>
    this.muted() || this.effectiveVolume() === 0 ? 'Activar sonido' : 'Silenciar',
  );
  readonly fullscreenLabel = computed(() =>
    this.fullscreen() ? 'Salir de pantalla completa' : 'Pantalla completa',
  );

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
