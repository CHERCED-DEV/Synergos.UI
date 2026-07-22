import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  coerceOptionalBooleanInput,
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynSignaturePad</c>.
 *
 * A pointer-driven signature pad: a visitor draws a signature on a canvas
 * with mouse, touch or pen, clears it, and exports the result as a PNG
 * data URL. Built for forms that need a hand-drawn signature (consent,
 * delivery, booking sign-off). Drawing is entirely client-side and
 * reactive (signals, zoneless — no RxJS).
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 *
 * The shared `@synergos/contracts` package does not yet declare a
 * `SignaturePadElementConfig`; the canonical shape lives here next to the
 * component until that contract lands in the registry ola.
 */
export interface SignaturePadRuntimeConfig {
  readonly label?: string;
  readonly hint?: string;
  readonly clearLabel?: string;
  readonly exportLabel?: string;
  readonly width?: number;
  readonly height?: number;
  readonly penWidth?: number;
  readonly disabled?: boolean;
  readonly showActions?: boolean;
}

/** Emitted on the `signaturechange` CustomEvent and the typed Angular output. */
export interface SignatureChangeDetail {
  /** PNG data URL of the current strokes, or '' when the pad is empty. */
  readonly dataUrl: string;
  /** Whether the pad currently holds any strokes. */
  readonly empty: boolean;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 200;
const DEFAULT_PEN_WIDTH = 2.5;
const MIN_DIMENSION = 80;
const MAX_DIMENSION = 2000;
const MIN_PEN_WIDTH = 0.5;
const MAX_PEN_WIDTH = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeSignaturePadConfig(
  value: Partial<SignaturePadRuntimeConfig>,
): SignaturePadRuntimeConfig {
  return omitUndefinedProperties<SignaturePadRuntimeConfig>({
    label: coerceTrimmedStringInput(value.label),
    hint: coerceTrimmedStringInput(value.hint),
    clearLabel: coerceTrimmedStringInput(value.clearLabel),
    exportLabel: coerceTrimmedStringInput(value.exportLabel),
    width: coerceOptionalNumberInput(value.width),
    height: coerceOptionalNumberInput(value.height),
    penWidth: coerceOptionalNumberInput(value.penWidth),
    disabled: coerceOptionalBooleanInput(value.disabled),
    showActions: coerceOptionalBooleanInput(value.showActions),
  });
}

@Component({
  selector: 'sg-signature-pad',
  standalone: true,
  templateUrl: './signature-pad.html',
  styleUrl: './signature-pad.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-signature-pad' },
})
export class SignaturePadElementComponent {
  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  readonly config = input<SignaturePadRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SignaturePadRuntimeConfig>(sanitizeSignaturePadConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly hintInput = input<string | undefined>(undefined, { alias: 'hint' });
  readonly clearLabelInput = input<string | undefined>(undefined, { alias: 'clearLabel' });
  readonly exportLabelInput = input<string | undefined>(undefined, { alias: 'exportLabel' });
  readonly widthInput = input<number | undefined, unknown>(undefined, {
    alias: 'width',
    transform: coerceOptionalNumberInput,
  });
  readonly heightInput = input<number | undefined, unknown>(undefined, {
    alias: 'height',
    transform: coerceOptionalNumberInput,
  });
  readonly penWidthInput = input<number | undefined, unknown>(undefined, {
    alias: 'penWidth',
    transform: coerceOptionalNumberInput,
  });
  readonly disabledInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'disabled',
    transform: coerceOptionalBooleanInput,
  });
  readonly showActionsInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'showActions',
    transform: coerceOptionalBooleanInput,
  });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `signaturechange` CustomEvent. */
  readonly signaturechange = output<SignatureChangeDetail>();

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, 'Firma'),
  );
  readonly hint = computed(() =>
    resolveConfigValue(this.hintInput(), this.config()?.hint, 'Dibuje su firma dentro del recuadro.'),
  );
  readonly clearLabel = computed(() =>
    resolveConfigValue(this.clearLabelInput(), this.config()?.clearLabel, 'Limpiar'),
  );
  readonly exportLabel = computed(() =>
    resolveConfigValue(this.exportLabelInput(), this.config()?.exportLabel, 'Exportar'),
  );

  readonly width = computed(() =>
    clamp(
      Math.round(resolveConfigValue(this.widthInput(), this.config()?.width, DEFAULT_WIDTH)),
      MIN_DIMENSION,
      MAX_DIMENSION,
    ),
  );
  readonly height = computed(() =>
    clamp(
      Math.round(resolveConfigValue(this.heightInput(), this.config()?.height, DEFAULT_HEIGHT)),
      MIN_DIMENSION,
      MAX_DIMENSION,
    ),
  );
  readonly penWidth = computed(() =>
    clamp(
      resolveConfigValue(this.penWidthInput(), this.config()?.penWidth, DEFAULT_PEN_WIDTH),
      MIN_PEN_WIDTH,
      MAX_PEN_WIDTH,
    ),
  );
  readonly disabled = computed(() =>
    resolveConfigValue(this.disabledInput(), this.config()?.disabled, false),
  );
  readonly showActions = computed(() =>
    resolveConfigValue(this.showActionsInput(), this.config()?.showActions, true),
  );

  /** Whether the pad currently holds any committed strokes. */
  readonly #empty = signal(true);
  readonly empty = this.#empty.asReadonly();

  /** All completed strokes plus the one in progress, kept for re-rendering. */
  readonly #strokes = signal<Point[][]>([]);
  #activeStroke: Point[] | null = null;
  #pointerId: number | null = null;

  constructor() {
    // Resize/reset the backing canvas whenever the configured size changes,
    // then repaint the existing strokes onto the fresh surface.
    effect(() => {
      const canvas = this.canvasRef()?.nativeElement;
      if (!canvas) {
        return;
      }

      const cssWidth = this.width();
      const cssHeight = this.height();
      const ratio = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;

      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = Math.round(cssHeight * ratio);

      const context = canvas.getContext('2d');
      if (context) {
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      }

      this.#repaint();
    });
  }

  // ─── Pointer drawing ─────────────────────────────────────────────────────────

  onPointerDown(event: PointerEvent): void {
    if (this.disabled() || this.#pointerId !== null) {
      return;
    }

    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
      return;
    }

    event.preventDefault();
    this.#pointerId = event.pointerId;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // setPointerCapture can throw in non-DOM test environments; ignore.
    }

    this.#activeStroke = [this.#toPoint(event)];
    this.#strokes.update((strokes) => [...strokes, this.#activeStroke as Point[]]);
    this.#repaint();
  }

  onPointerMove(event: PointerEvent): void {
    if (this.#pointerId !== event.pointerId || !this.#activeStroke) {
      return;
    }

    event.preventDefault();
    this.#activeStroke.push(this.#toPoint(event));
    this.#repaint();
  }

  onPointerUp(event: PointerEvent): void {
    if (this.#pointerId !== event.pointerId) {
      return;
    }

    const canvas = this.canvasRef()?.nativeElement;
    if (canvas) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore: capture may already be released.
      }
    }

    // A click with no movement still counts as a dot.
    if (this.#activeStroke && this.#activeStroke.length > 0) {
      this.#empty.set(false);
      this.#emitChange();
    }

    this.#activeStroke = null;
    this.#pointerId = null;
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  clear(): void {
    if (this.empty() && this.#strokes().length === 0) {
      // Idempotent: nothing to clear, nothing to emit.
      return;
    }

    this.#strokes.set([]);
    this.#activeStroke = null;
    this.#pointerId = null;
    this.#empty.set(true);
    this.#repaint();
    this.#emitChange();
  }

  /**
   * Returns the current signature as a PNG data URL, or '' when empty.
   * Also emits `signaturechange` so external listeners receive the export.
   */
  export(): string {
    const dataUrl = this.toDataUrl();
    this.signaturechange.emit({ dataUrl, empty: this.empty() });
    return dataUrl;
  }

  /** Current signature as a PNG data URL, or '' when the pad is empty. */
  toDataUrl(): string {
    if (this.empty()) {
      return '';
    }

    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || typeof canvas.toDataURL !== 'function') {
      return '';
    }

    // The method existing is not the same as the method producing an image.
    // Where no 2D rasterizer is available (jsdom without the native `canvas`
    // package, hardened/embedded WebViews) `toDataURL` is a real function that
    // returns null, and a canvas that cannot be encoded yields the degenerate
    // 'data:,'. Neither is a signature, so degrade by ABSENCE ('') rather than
    // letting a non-string escape through a `string` contract onto every
    // `signaturechange` consumer.
    const encoded: unknown = canvas.toDataURL('image/png');
    return typeof encoded === 'string' && encoded.startsWith('data:image/') ? encoded : '';
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  #emitChange(): void {
    this.signaturechange.emit({ dataUrl: this.toDataUrl(), empty: this.empty() });
  }

  #toPoint(event: PointerEvent): Point {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || typeof canvas.getBoundingClientRect !== 'function') {
      return { x: event.offsetX, y: event.offsetY };
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? this.width() / rect.width : 1;
    const scaleY = rect.height > 0 ? this.height() / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  #repaint(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, this.width(), this.height());
    context.lineWidth = this.penWidth();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = this.#strokeColor(canvas);

    for (const stroke of this.#strokes()) {
      if (stroke.length === 0) {
        continue;
      }

      if (stroke.length === 1) {
        // A single tap renders as a filled dot.
        const point = stroke[0];
        context.beginPath();
        context.arc(point.x, point.y, this.penWidth() / 2, 0, Math.PI * 2);
        context.fillStyle = this.#strokeColor(canvas);
        context.fill();
        continue;
      }

      context.beginPath();
      context.moveTo(stroke[0].x, stroke[0].y);
      for (let index = 1; index < stroke.length; index++) {
        context.lineTo(stroke[index].x, stroke[index].y);
      }
      context.stroke();
    }
  }

  /** Resolve the ink color from the design-system CSS custom property. */
  #strokeColor(canvas: HTMLCanvasElement): string {
    if (typeof getComputedStyle !== 'function') {
      return '#1b1f29';
    }

    const value = getComputedStyle(canvas).getPropertyValue('--syn-signature-ink').trim();
    return value || '#1b1f29';
  }
}
