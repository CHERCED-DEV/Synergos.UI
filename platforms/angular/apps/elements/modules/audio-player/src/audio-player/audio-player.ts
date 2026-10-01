import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { AudioPlayerProps } from '@synergos/contracts';
import { t } from '@synergos/vitals-core';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * <synergos-audio-player>: a self-contained audio player — play/pause, scrub (seek), volume,
 * mute and elapsed/total time read-outs. Wraps a native <c>HTMLAudioElement</c> so streaming,
 * range requests and codec support are delegated to the browser, while the chrome is fully
 * tokenized and accessible. Playback transitions surface a `playbackchange` CustomEvent (and
 * the typed Angular output) so the host page can react to play/pause/ended.
 *
 * El `config` que manda el CMS tiene la forma de `AudioPlayerProps`, GENERADO del record C#
 * (ADR 0135): `audioFile` es la URL absoluta del medio que eligió el editor. La vista la
 * mandaba como `audioUrl` y este elemento salía sin fuente (D1). `autoplay`, `loop` y
 * `preload` no los autora el editor: llegan por atributo.
 *
 * Los textos de la interfaz salen del diccionario con `t()` (ADR 0136), de DOS secciones que
 * declara `AudioPlayerProps`: `Media`, el transporte que comparte con `video-player` (una clave
 * por concepto, no dos copias de «Pausar»), y `Audio`, su nombre accesible y su estado vacío.
 * El título y el artista son contenido del editor: no pasan por el diccionario.
 */
export type AudioPlaybackState = 'playing' | 'paused' | 'ended';
export type AudioPreload = 'none' | 'metadata' | 'auto';

/** Emitted on the `playbackchange` CustomEvent and the typed Angular output. */
export interface AudioPlaybackChangeDetail {
  readonly state: AudioPlaybackState;
  readonly currentTime: number;
  readonly duration: number;
}

const PRELOAD_VALUES: readonly AudioPreload[] = ['none', 'metadata', 'auto'];
const DEFAULT_PRELOAD: AudioPreload = 'metadata';
const SEEK_STEP_SECONDS = 5;
const VOLUME_STEP = 0.05;
const MIN_DURATION_FALLBACK = 0;

function normalizePreload(value: unknown): AudioPreload {
  const candidate = coerceTrimmedStringInput(value)?.toLowerCase() as AudioPreload | undefined;
  return candidate && PRELOAD_VALUES.includes(candidate) ? candidate : DEFAULT_PRELOAD;
}

/** Clamp a number to the inclusive [min, max] range, guarding NaN. */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/** Format a seconds value as `m:ss` (or `h:mm:ss` past an hour). */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '0:00';
  }

  const whole = Math.floor(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const ss = seconds < 10 ? `0${seconds}` : `${seconds}`;

  if (hours > 0) {
    const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hours}:${mm}:${ss}`;
  }

  return `${minutes}:${ss}`;
}

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeAudioPlayerConfig(value: Partial<AudioPlayerProps>): Partial<AudioPlayerProps> {
  return omitUndefinedProperties<AudioPlayerProps>({
    audioFile: coerceTrimmedStringInput(value.audioFile),
    trackTitle: coerceTrimmedStringInput(value.trackTitle),
    artistName: coerceTrimmedStringInput(value.artistName),
  });
}

@Component({
  selector: 'sg-audio-player',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './audio-player.html',
  styleUrl: './audio-player.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-audio-player' },
})
export class AudioPlayerElementComponent {
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<Partial<AudioPlayerProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AudioPlayerProps>(sanitizeAudioPlayerConfig),
  });
  readonly audioFileInput = input<string | undefined>(undefined, { alias: 'audioFile' });
  readonly trackTitleInput = input<string | undefined>(undefined, { alias: 'trackTitle' });
  readonly artistNameInput = input<string | undefined>(undefined, { alias: 'artistName' });
  readonly autoplayInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'autoplay',
    transform: coerceOptionalBooleanInput,
  });
  readonly loopInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'loop',
    transform: coerceOptionalBooleanInput,
  });
  readonly preloadInput = input<string | undefined>(undefined, { alias: 'preload' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `playbackchange` CustomEvent. */
  readonly playbackchange = output<AudioPlaybackChangeDetail>();

  private readonly audioRef = viewChild<ElementRef<HTMLAudioElement>>('audio');

  // ─── Resolved config (attribute > config > default) ────────────────────────
  readonly audioFile = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.audioFileInput()),
      this.config()?.audioFile,
      '',
    ),
  );
  readonly trackTitle = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.trackTitleInput()),
      this.config()?.trackTitle,
      '',
    ),
  );
  readonly artistName = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.artistNameInput()),
      this.config()?.artistName,
      '',
    ),
  );
  readonly autoplay = computed(() => this.autoplayInput() ?? false);
  readonly loop = computed(() => this.loopInput() ?? false);
  readonly preload = computed<AudioPreload>(() => normalizePreload(this.preloadInput()));

  readonly hasSource = computed(() => this.audioFile().length > 0);
  readonly hasTitle = computed(() => this.trackTitle().length > 0);
  readonly hasArtist = computed(() => this.artistName().length > 0);

  /** Accessible name for the whole region / the media element. */
  readonly mediaLabel = computed(() => {
    const title = this.trackTitle() || t('Audio.Aria', 'Audio');
    const artist = this.artistName();
    return artist ? `${title} — ${artist}` : title;
  });

  // ─── Live playback state (driven by native media events) ───────────────────
  readonly #state = signal<AudioPlaybackState>('paused');
  readonly #currentTime = signal(0);
  readonly #duration = signal(MIN_DURATION_FALLBACK);
  readonly #volume = signal(1);
  readonly #muted = signal(false);
  readonly #seeking = signal(false);

  readonly state = this.#state.asReadonly();
  readonly currentTime = this.#currentTime.asReadonly();
  readonly duration = this.#duration.asReadonly();
  readonly volume = this.#volume.asReadonly();
  readonly muted = this.#muted.asReadonly();

  readonly isPlaying = computed(() => this.#state() === 'playing');
  readonly currentTimeLabel = computed(() => formatTime(this.#currentTime()));
  readonly durationLabel = computed(() =>
    this.#duration() > 0 ? formatTime(this.#duration()) : '0:00',
  );
  readonly playLabel = computed(() =>
    this.isPlaying() ? t('Media.Pause', 'Pausar') : t('Media.Play', 'Reproducir'),
  );

  /** Progress as a 0–100 percentage for the scrubber fill + aria-valuenow. */
  readonly progressPercent = computed(() => {
    const duration = this.#duration();
    if (duration <= 0) {
      return 0;
    }
    return clamp((this.#currentTime() / duration) * 100, 0, 100);
  });

  readonly volumePercent = computed(() => Math.round(this.#volume() * 100));
  readonly isMuted = computed(() => this.#muted() || this.#volume() === 0);
  readonly muteLabel = computed(() =>
    this.isMuted() ? t('Media.Unmute', 'Activar sonido') : t('Media.Mute', 'Silenciar'),
  );
  readonly seekLabel = computed(() => t('Media.Seek', 'Posición de reproducción'));
  readonly volumeLabel = computed(() => t('Media.Volume', 'Volumen'));
  /** «0:12 de 3:40»: el valor que lee el lector de pantalla en la barra de posición. */
  readonly seekValueText = computed(() =>
    t('Media.Time', '{current} de {total}', { current: this.currentTimeLabel(), total: this.durationLabel() }),
  );
  readonly emptyLabel = computed(() => t('Audio.Empty', 'No hay audio disponible.'));

  constructor() {
    this.#destroyRef.onDestroy(() => {
      const audio = this.audioRef()?.nativeElement;
      audio?.pause();
    });
  }

  // ─── User intents ──────────────────────────────────────────────────────────
  togglePlay(): void {
    const audio = this.audioRef()?.nativeElement;
    if (!audio || !this.hasSource()) {
      return;
    }

    if (audio.paused) {
      void audio.play().catch(() => {
        // Autoplay / gesture policy can reject; reflect paused state.
        this.#state.set('paused');
      });
    } else {
      audio.pause();
    }
  }

  toggleMute(): void {
    const audio = this.audioRef()?.nativeElement;
    if (!audio) {
      return;
    }
    audio.muted = !audio.muted;
  }

  /** Seek to an absolute position from the range slider. */
  onSeekInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const percent = Number(target.value);
    const duration = this.#duration();
    if (duration <= 0) {
      return;
    }
    const next = clamp((percent / 100) * duration, 0, duration);
    this.#seeking.set(true);
    this.#currentTime.set(next);
  }

  /** Commit the scrub position to the media element on release. */
  onSeekCommit(event: Event): void {
    const audio = this.audioRef()?.nativeElement;
    const target = event.target as HTMLInputElement;
    const percent = Number(target.value);
    const duration = this.#duration();
    this.#seeking.set(false);
    if (!audio || duration <= 0) {
      return;
    }
    audio.currentTime = clamp((percent / 100) * duration, 0, duration);
  }

  /** Keyboard scrubbing on the progress slider (arrow keys, Home/End). */
  onSeekKeydown(event: KeyboardEvent): void {
    const duration = this.#duration();
    if (duration <= 0) {
      return;
    }

    const handlers: Record<string, () => number> = {
      ArrowRight: () => this.#currentTime() + SEEK_STEP_SECONDS,
      ArrowUp: () => this.#currentTime() + SEEK_STEP_SECONDS,
      ArrowLeft: () => this.#currentTime() - SEEK_STEP_SECONDS,
      ArrowDown: () => this.#currentTime() - SEEK_STEP_SECONDS,
      Home: () => 0,
      End: () => duration,
    };

    const handler = handlers[event.key];
    if (!handler) {
      return;
    }

    event.preventDefault();
    const next = clamp(handler(), 0, duration);
    this.#currentTime.set(next);
    const audio = this.audioRef()?.nativeElement;
    if (audio) {
      audio.currentTime = next;
    }
  }

  onVolumeInput(event: Event): void {
    const audio = this.audioRef()?.nativeElement;
    const target = event.target as HTMLInputElement;
    const next = clamp(Number(target.value) / 100, 0, 1);
    this.#volume.set(next);
    if (audio) {
      audio.volume = next;
      audio.muted = next === 0;
    }
  }

  onVolumeKeydown(event: KeyboardEvent): void {
    const handlers: Record<string, () => number> = {
      ArrowRight: () => this.#volume() + VOLUME_STEP,
      ArrowUp: () => this.#volume() + VOLUME_STEP,
      ArrowLeft: () => this.#volume() - VOLUME_STEP,
      ArrowDown: () => this.#volume() - VOLUME_STEP,
      Home: () => 0,
      End: () => 1,
    };

    const handler = handlers[event.key];
    if (!handler) {
      return;
    }

    event.preventDefault();
    const next = clamp(handler(), 0, 1);
    this.#volume.set(next);
    const audio = this.audioRef()?.nativeElement;
    if (audio) {
      audio.volume = next;
      audio.muted = next === 0;
    }
  }

  // ─── Native media event bindings ───────────────────────────────────────────
  onLoadedMetadata(): void {
    const audio = this.audioRef()?.nativeElement;
    if (!audio) {
      return;
    }
    this.#duration.set(Number.isFinite(audio.duration) ? audio.duration : MIN_DURATION_FALLBACK);
    this.#volume.set(audio.volume);
    this.#muted.set(audio.muted);
  }

  onTimeUpdate(): void {
    if (this.#seeking()) {
      return;
    }
    const audio = this.audioRef()?.nativeElement;
    if (audio) {
      this.#currentTime.set(audio.currentTime);
    }
  }

  onVolumeChange(): void {
    const audio = this.audioRef()?.nativeElement;
    if (!audio) {
      return;
    }
    this.#volume.set(audio.volume);
    this.#muted.set(audio.muted);
  }

  onPlay(): void {
    this.#emitPlayback('playing');
  }

  onPause(): void {
    this.#emitPlayback('paused');
  }

  onEnded(): void {
    this.#currentTime.set(this.#duration());
    this.#emitPlayback('ended');
  }

  #emitPlayback(state: AudioPlaybackState): void {
    this.#state.set(state);
    this.playbackchange.emit({
      state,
      currentTime: this.#currentTime(),
      duration: this.#duration(),
    });
  }
}
