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
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynLightboxGallery</c>.
 *
 * A responsive thumbnail grid that opens a fullscreen lightbox on click:
 * large image + caption + prev/next + close (Esc / button / click-outside),
 * with a focus trap and lazy-loaded thumbnails. Built for the PROPIEDADES
 * vertical (property photo galleries).
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface LightboxGalleryRuntimeConfig {
  readonly images?: readonly LightboxImageConfig[];
  readonly columns?: number;
  readonly closeLabel?: string;
}

export interface LightboxImageConfig {
  readonly src?: string;
  readonly thumb?: string;
  readonly alt?: string;
  readonly caption?: string;
}

export interface LightboxImage {
  readonly src: string;
  readonly thumb: string;
  readonly alt: string;
  readonly caption: string;
}

const DEFAULT_COLUMNS = 3;
const MIN_COLUMNS = 1;
const MAX_COLUMNS = 6;
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeImages(value: unknown): readonly LightboxImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): LightboxImage | null => {
      if (typeof entry === 'string') {
        const src = entry.trim();
        return src ? { src, thumb: src, alt: '', caption: '' } : null;
      }

      if (!isRecord(entry)) {
        return null;
      }

      const src = readString(entry['src']).trim() || readString(entry['url']).trim();
      if (!src) {
        return null;
      }

      const thumb = readString(entry['thumb']).trim() || readString(entry['thumbnail']).trim() || src;
      return {
        src,
        thumb,
        alt: readString(entry['alt']).trim(),
        caption: readString(entry['caption']).trim(),
      };
    })
    .filter((image): image is LightboxImage => image !== null);
}

function clampColumns(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) {
    return undefined;
  }
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, rounded));
}

function sanitizeLightboxGalleryConfig(
  value: Partial<LightboxGalleryRuntimeConfig>,
): LightboxGalleryRuntimeConfig {
  return omitUndefinedProperties<LightboxGalleryRuntimeConfig>({
    images: value.images,
    columns: clampColumns(coerceOptionalNumberInput(value.columns)),
    closeLabel: coerceTrimmedStringInput(value.closeLabel),
  });
}

@Component({
  selector: 'sg-lightbox-gallery',
  standalone: true,
  templateUrl: './lightbox-gallery.html',
  styleUrl: './lightbox-gallery.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-lightbox-gallery' },
})
export class LightboxGalleryElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #elementRef = inject(ElementRef<HTMLElement>);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<LightboxGalleryRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<LightboxGalleryRuntimeConfig>(sanitizeLightboxGalleryConfig),
  });
  /** Canonical alias is `images`; `imagesJson` is kept for the original scaffold/CMS property. */
  readonly imagesInput = input<string | undefined>(undefined, { alias: 'images' });
  readonly imagesJsonInput = input<string | undefined>(undefined, { alias: 'imagesJson' });
  readonly columnsInput = input<string | undefined>(undefined, { alias: 'columns' });
  readonly closeLabelInput = input<string | undefined>(undefined, { alias: 'closeLabel' });
  readonly integration = input<string | undefined>(undefined);

  /** Fired (and mirrored as a native CustomEvent) whenever the open image changes. */
  readonly imageopen = output<{ readonly index: number; readonly image: LightboxImage }>();

  readonly images = computed<readonly LightboxImage[]>(() =>
    normalizeImages(this.resolveSource(this.imagesInput() ?? this.imagesJsonInput(), this.config()?.images)),
  );

  readonly columns = computed<number>(() => {
    const fromInput = clampColumns(coerceOptionalNumberInput(this.columnsInput()));
    return resolveConfigValue(fromInput, clampColumns(this.config()?.columns), DEFAULT_COLUMNS);
  });

  readonly closeLabel = computed(() =>
    resolveConfigValue(this.closeLabelInput(), this.config()?.closeLabel, 'Cerrar galería'),
  );

  readonly hasImages = computed(() => this.images().length > 0);

  /** Index of the open image; null when the lightbox is closed. */
  readonly openIndex = signal<number | null>(null);
  readonly isOpen = computed(() => this.openIndex() !== null);

  readonly activeImage = computed<LightboxImage | null>(() => {
    const index = this.openIndex();
    if (index === null) {
      return null;
    }
    return this.images()[index] ?? null;
  });

  readonly counterLabel = computed(() => {
    const index = this.openIndex();
    if (index === null) {
      return '';
    }
    return `${index + 1} / ${this.images().length}`;
  });

  /** Element that had focus before opening, restored on close. */
  #previousFocus: HTMLElement | null = null;

  constructor() {
    this.#destroyRef.onDestroy(() => this.#unlockScroll());
  }

  open(index: number): void {
    const images = this.images();
    if (index < 0 || index >= images.length) {
      return;
    }

    this.#previousFocus = (document.activeElement as HTMLElement) ?? null;
    this.openIndex.set(index);
    this.#lockScroll();
    this.imageopen.emit({ index, image: images[index] });
    this.#focusFirst();
  }

  close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.openIndex.set(null);
    this.#unlockScroll();
    this.#previousFocus?.focus?.();
    this.#previousFocus = null;
  }

  next(): void {
    const index = this.openIndex();
    const total = this.images().length;
    if (index === null || total === 0) {
      return;
    }
    const nextIndex = (index + 1) % total;
    this.openIndex.set(nextIndex);
    this.imageopen.emit({ index: nextIndex, image: this.images()[nextIndex] });
  }

  previous(): void {
    const index = this.openIndex();
    const total = this.images().length;
    if (index === null || total === 0) {
      return;
    }
    const prevIndex = (index - 1 + total) % total;
    this.openIndex.set(prevIndex);
    this.imageopen.emit({ index: prevIndex, image: this.images()[prevIndex] });
  }

  /** Close only when the click lands on the backdrop, not the figure. */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  /** Keyboard handling for the open lightbox: Esc, arrows, and the focus trap. */
  onDialogKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        return;
      case 'ArrowRight':
        event.preventDefault();
        this.next();
        return;
      case 'ArrowLeft':
        event.preventDefault();
        this.previous();
        return;
      case 'Tab':
        this.#trapFocus(event);
        return;
      default:
        return;
    }
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }

  #dialogElement(): HTMLElement | null {
    const root: ParentNode = this.#elementRef.nativeElement.shadowRoot ?? this.#elementRef.nativeElement;
    return root.querySelector<HTMLElement>('.lightbox__dialog');
  }

  #focusFirst(): void {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const dialog = this.#dialogElement();
      const closeButton = dialog?.querySelector<HTMLElement>('.lightbox__close');
      (closeButton ?? dialog)?.focus();
    });
  }

  #trapFocus(event: KeyboardEvent): void {
    const dialog = this.#dialogElement();
    if (!dialog) {
      return;
    }

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    );

    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const root = dialog.getRootNode() as unknown as DocumentOrShadowRoot;
    const active = root.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  #lockScroll(): void {
    if (typeof document !== 'undefined') {
      document.body.style.setProperty('overflow', 'hidden');
    }
  }

  #unlockScroll(): void {
    if (typeof document !== 'undefined') {
      document.body.style.removeProperty('overflow');
    }
  }
}
