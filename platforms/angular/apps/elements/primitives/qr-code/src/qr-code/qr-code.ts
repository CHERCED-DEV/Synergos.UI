import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import {
  encodeQr,
  type QrErrorCorrectionLevel,
  type QrMatrix,
} from './qr-encoder';

/**
 * Runtime config for the CMS element <c>elementSynQrCode</c>.
 *
 * Renders a scannable QR code from an arbitrary string payload (URL, vCard,
 * plain text). The matrix is computed entirely client-side with a
 * dependency-free encoder (byte mode, versions 1–10, EC levels L/M/Q/H) and
 * drawn as crisp SVG `<rect>` modules so it scales losslessly to any size.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface QrCodeRuntimeConfig {
  readonly data?: string;
  readonly size?: number;
  readonly ecLevel?: string;
  readonly label?: string;
  readonly caption?: string;
  readonly margin?: number;
}

interface QrRect {
  readonly key: string;
  readonly x: number;
  readonly y: number;
}

const EC_LEVELS: readonly QrErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H'];
const DEFAULT_EC_LEVEL: QrErrorCorrectionLevel = 'M';
const DEFAULT_SIZE = 200;
const MIN_SIZE = 64;
const MAX_SIZE = 1024;
const DEFAULT_MARGIN = 4;
const MAX_MARGIN = 16;

function normalizeEcLevel(value: string | undefined): QrErrorCorrectionLevel {
  const candidate = (coerceTrimmedStringInput(value) ?? '').toUpperCase() as QrErrorCorrectionLevel;
  return EC_LEVELS.includes(candidate) ? candidate : DEFAULT_EC_LEVEL;
}

function clampSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_SIZE;
  }
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(value)));
}

function clampMargin(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_MARGIN;
  }
  return Math.min(MAX_MARGIN, Math.max(0, Math.round(value)));
}

function sanitizeQrCodeConfig(value: Partial<QrCodeRuntimeConfig>): QrCodeRuntimeConfig {
  return omitUndefinedProperties<QrCodeRuntimeConfig>({
    data: coerceTrimmedStringInput(value.data),
    size: coerceOptionalNumberInput(value.size),
    ecLevel: coerceTrimmedStringInput(value.ecLevel),
    label: coerceTrimmedStringInput(value.label),
    caption: coerceTrimmedStringInput(value.caption),
    margin: coerceOptionalNumberInput(value.margin),
  });
}

@Component({
  selector: 'sg-qr-code',
  standalone: true,
  templateUrl: './qr-code.html',
  styleUrl: './qr-code.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-qr-code' },
})
export class QrCodeElementComponent {
  readonly config = input<QrCodeRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<QrCodeRuntimeConfig>(sanitizeQrCodeConfig),
  });
  readonly dataInput = input<string | undefined>(undefined, { alias: 'data' });
  readonly sizeInput = input<number | undefined, unknown>(undefined, {
    alias: 'size',
    transform: coerceOptionalNumberInput,
  });
  readonly ecLevelInput = input<string | undefined>(undefined, { alias: 'ecLevel' });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly captionInput = input<string | undefined>(undefined, { alias: 'caption' });
  readonly marginInput = input<number | undefined, unknown>(undefined, {
    alias: 'margin',
    transform: coerceOptionalNumberInput,
  });
  /** Bridge-only: how the CMS chose to integrate this element. Unused at runtime. */
  readonly integration = input<string | undefined>(undefined);

  readonly data = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.dataInput()), this.config()?.data, ''),
  );
  readonly size = computed(() =>
    clampSize(resolveConfigValue(this.sizeInput(), this.config()?.size, undefined)),
  );
  readonly ecLevel = computed<QrErrorCorrectionLevel>(() =>
    normalizeEcLevel(resolveConfigValue(this.ecLevelInput(), this.config()?.ecLevel, undefined)),
  );
  readonly margin = computed(() =>
    clampMargin(resolveConfigValue(this.marginInput(), this.config()?.margin, undefined)),
  );
  readonly caption = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.captionInput()), this.config()?.caption, ''),
  );

  /** Accessible name; falls back to describing the encoded payload. */
  readonly label = computed(() => {
    const explicit = resolveConfigValue(
      coerceTrimmedStringInput(this.labelInput()),
      this.config()?.label,
      '',
    );
    if (explicit) {
      return explicit;
    }
    const payload = this.data();
    return payload ? `Código QR de ${payload}` : 'Código QR';
  });

  readonly hasData = computed(() => this.data().length > 0);
  readonly hasCaption = computed(() => this.caption().length > 0);

  /** The encoded matrix, or null when there is no payload or it overflows. */
  readonly matrix = computed<QrMatrix | null>(() => {
    const payload = this.data();
    if (!payload) {
      return null;
    }
    try {
      return encodeQr(payload, this.ecLevel());
    } catch {
      return null;
    }
  });

  readonly hasError = computed(() => this.hasData() && this.matrix() === null);

  /** viewBox span in module units (matrix size + quiet-zone margin on each side). */
  readonly viewBoxSize = computed(() => {
    const matrix = this.matrix();
    if (!matrix) {
      return 0;
    }
    return matrix.size + this.margin() * 2;
  });

  /** Dark modules as SVG rects, pre-offset by the quiet-zone margin. */
  readonly rects = computed<readonly QrRect[]>(() => {
    const matrix = this.matrix();
    if (!matrix) {
      return [];
    }
    const offset = this.margin();
    const out: QrRect[] = [];
    for (let y = 0; y < matrix.size; y++) {
      const row = matrix.modules[y];
      for (let x = 0; x < matrix.size; x++) {
        if (row[x]) {
          out.push({ key: `${y}-${x}`, x: x + offset, y: y + offset });
        }
      }
    }
    return out;
  });
}
