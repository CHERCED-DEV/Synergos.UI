import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynAvatarUpload</c>.
 *
 * A self-contained avatar uploader: drag &amp; drop or browse a local image,
 * preview it immediately, then POST the file to `uploadEndpoint`. Upload
 * progresses through an explicit state machine (idle → selected → uploading →
 * success | error) that drives both the visual treatment and assistive-tech
 * status messages. When no endpoint is configured the component still previews
 * and emits the selected file so a host page can take over the persistence.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface AvatarUploadRuntimeConfig {
  readonly label?: string;
  readonly hint?: string;
  readonly uploadEndpoint?: string;
  readonly fieldName?: string;
  readonly accept?: string;
  readonly maxSizeKb?: number;
  readonly initialImage?: string;
  readonly initialAlt?: string;
  readonly removable?: boolean;
}

/** Emitted on the `avatarselect` CustomEvent and the typed Angular output. */
export interface AvatarSelectDetail {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly dataUrl: string;
}

/** Emitted on the `avatarupload` CustomEvent and the typed Angular output. */
export interface AvatarUploadResultDetail {
  readonly status: 'success' | 'error';
  readonly name: string;
  readonly response: unknown;
  readonly message: string;
}

export type AvatarUploadStatus =
  | 'idle'
  | 'dragging'
  | 'selected'
  | 'uploading'
  | 'success'
  | 'error';

const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const DEFAULT_FIELD_NAME = 'avatar';
const DEFAULT_MAX_SIZE_KB = 2048;
const BYTES_PER_KB = 1024;

function sanitizeAvatarUploadConfig(
  value: Partial<AvatarUploadRuntimeConfig>,
): AvatarUploadRuntimeConfig {
  return omitUndefinedProperties<AvatarUploadRuntimeConfig>({
    label: coerceTrimmedStringInput(value.label),
    hint: coerceTrimmedStringInput(value.hint),
    uploadEndpoint: coerceTrimmedStringInput(value.uploadEndpoint),
    fieldName: coerceTrimmedStringInput(value.fieldName),
    accept: coerceTrimmedStringInput(value.accept),
    maxSizeKb: typeof value.maxSizeKb === 'number' ? value.maxSizeKb : undefined,
    initialImage: coerceTrimmedStringInput(value.initialImage),
    initialAlt: coerceTrimmedStringInput(value.initialAlt),
    removable: coerceOptionalBooleanInput(value.removable),
  });
}

@Component({
  selector: 'sg-avatar-upload',
  standalone: true,
  templateUrl: './avatar-upload.html',
  styleUrl: './avatar-upload.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-avatar-upload' },
})
export class AvatarUploadElementComponent {
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<AvatarUploadRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AvatarUploadRuntimeConfig>(sanitizeAvatarUploadConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly hintInput = input<string | undefined>(undefined, { alias: 'hint' });
  readonly uploadEndpointInput = input<string | undefined>(undefined, { alias: 'uploadEndpoint' });
  readonly fieldNameInput = input<string | undefined>(undefined, { alias: 'fieldName' });
  readonly acceptInput = input<string | undefined>(undefined, { alias: 'accept' });
  readonly maxSizeKbInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxSizeKb',
    transform: (raw: unknown) => {
      const numeric = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
    },
  });
  readonly initialImageInput = input<string | undefined>(undefined, { alias: 'initialImage' });
  readonly initialAltInput = input<string | undefined>(undefined, { alias: 'initialAlt' });
  readonly removableInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'removable',
    transform: coerceOptionalBooleanInput,
  });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular outputs mirroring the native CustomEvents. */
  readonly avatarselect = output<AvatarSelectDetail>();
  readonly avatarupload = output<AvatarUploadResultDetail>();

  // ─── Resolved config (attribute › config › default) ──────────────────────────
  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, 'Foto de perfil'),
  );
  readonly hint = computed(() =>
    resolveConfigValue(
      this.hintInput(),
      this.config()?.hint,
      'Arrastra una imagen o haz clic para elegir un archivo.',
    ),
  );
  readonly uploadEndpoint = computed(() =>
    resolveConfigValue(this.uploadEndpointInput(), this.config()?.uploadEndpoint, ''),
  );
  readonly fieldName = computed(() =>
    resolveConfigValue(this.fieldNameInput(), this.config()?.fieldName, DEFAULT_FIELD_NAME),
  );
  readonly accept = computed(() =>
    resolveConfigValue(this.acceptInput(), this.config()?.accept, DEFAULT_ACCEPT),
  );
  readonly maxSizeKb = computed(() =>
    resolveConfigValue(this.maxSizeKbInput(), this.config()?.maxSizeKb, DEFAULT_MAX_SIZE_KB),
  );
  readonly initialImage = computed(() =>
    resolveConfigValue(this.initialImageInput(), this.config()?.initialImage, ''),
  );
  readonly initialAlt = computed(() =>
    resolveConfigValue(this.initialAltInput(), this.config()?.initialAlt, ''),
  );
  readonly removable = computed(() =>
    resolveConfigValue(this.removableInput(), this.config()?.removable, true),
  );

  readonly maxSizeBytes = computed(() => Math.round(this.maxSizeKb() * BYTES_PER_KB));
  readonly maxSizeLabel = computed(() => this.formatBytes(this.maxSizeBytes()));

  // ─── Local UI state ──────────────────────────────────────────────────────────
  readonly #status = signal<AvatarUploadStatus>('idle');
  readonly #previewUrl = signal<string>('');
  readonly #fileName = signal<string>('');
  readonly #message = signal<string>('');
  readonly #pendingFile = signal<File | null>(null);
  readonly #progress = signal<number>(0);

  readonly status = this.#status.asReadonly();
  readonly fileName = this.#fileName.asReadonly();
  readonly message = this.#message.asReadonly();
  readonly progress = this.#progress.asReadonly();

  /** Resolved preview: a freshly picked image wins over the configured initial. */
  readonly previewUrl = computed(() => this.#previewUrl() || this.initialImage());
  readonly previewAlt = computed(() => {
    const name = this.#fileName();
    if (name) {
      return `Vista previa: ${name}`;
    }
    return this.initialAlt() || this.label();
  });

  readonly hasPreview = computed(() => this.previewUrl().trim().length > 0);
  readonly isDragging = computed(() => this.#status() === 'dragging');
  readonly isUploading = computed(() => this.#status() === 'uploading');
  readonly isError = computed(() => this.#status() === 'error');
  readonly isSuccess = computed(() => this.#status() === 'success');
  readonly hasEndpoint = computed(() => this.uploadEndpoint().trim().length > 0);

  /** Whether an upload (or, endpoint-less, an emit) can currently fire. */
  readonly canUpload = computed(
    () => this.#pendingFile() !== null && !this.isUploading(),
  );

  /** Single status line surfaced to screen readers via aria-live. */
  readonly statusMessage = computed(() => {
    if (this.#message()) {
      return this.#message();
    }
    switch (this.#status()) {
      case 'uploading':
        return 'Subiendo imagen…';
      case 'selected':
        return `Imagen lista: ${this.#fileName()}`;
      case 'dragging':
        return 'Suelta la imagen para cargarla.';
      default:
        return '';
    }
  });

  #abortController: AbortController | null = null;

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#abortController?.abort();
      this.revokePreview();
    });
  }

  // ─── Drag & drop ─────────────────────────────────────────────────────────────
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.isUploading()) {
      this.#status.set('dragging');
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    if (this.isDragging()) {
      this.#status.set(this.#pendingFile() ? 'selected' : 'idle');
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    if (this.isUploading()) {
      return;
    }
    const file = event.dataTransfer?.files?.[0] ?? null;
    this.acceptFile(file);
  }

  // ─── File input ──────────────────────────────────────────────────────────────
  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.acceptFile(file);
    // Reset so re-picking the same file fires `change` again.
    if (input) {
      input.value = '';
    }
  }

  /** Keyboard activation of the dropzone opens the native picker. */
  onDropzoneKeydown(event: KeyboardEvent, input: HTMLInputElement): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────
  upload(): void {
    const file = this.#pendingFile();
    if (!file || this.isUploading()) {
      return;
    }

    // No endpoint configured → hand the file off to the host page and finish.
    if (!this.hasEndpoint()) {
      this.#status.set('success');
      this.#message.set('Imagen lista para enviar.');
      this.emitUploadResult('success', file.name, null, 'Imagen lista para enviar.');
      return;
    }

    if (typeof fetch !== 'function') {
      this.failUpload('La carga no está disponible en este entorno.', file.name);
      return;
    }

    this.#abortController?.abort();
    const controller = new AbortController();
    this.#abortController = controller;

    this.#status.set('uploading');
    this.#message.set('');
    this.#progress.set(0);

    const body = new FormData();
    body.append(this.fieldName(), file, file.name);

    fetch(this.uploadEndpoint().trim(), {
      method: 'POST',
      body,
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        const payload = await this.readResponse(response);
        if (!response.ok) {
          throw new UploadError(`HTTP ${response.status}`, payload);
        }
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) {
          return;
        }
        this.#progress.set(100);
        this.#status.set('success');
        this.#message.set('Imagen subida correctamente.');
        this.emitUploadResult('success', file.name, payload, 'Imagen subida correctamente.');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        const payload = error instanceof UploadError ? error.payload : null;
        this.failUpload('No se pudo subir la imagen. Inténtalo de nuevo.', file.name, payload);
      });
  }

  /** Discard the current selection / preview and return to idle. */
  remove(): void {
    this.#abortController?.abort();
    this.revokePreview();
    this.#pendingFile.set(null);
    this.#previewUrl.set('');
    this.#fileName.set('');
    this.#message.set('');
    this.#progress.set(0);
    this.#status.set('idle');
  }

  // ─── Internals ───────────────────────────────────────────────────────────────
  private acceptFile(file: File | null): void {
    if (!file) {
      this.#status.set(this.#pendingFile() ? 'selected' : 'idle');
      return;
    }

    if (!this.isAcceptedType(file)) {
      this.rejectFile('El archivo debe ser una imagen.');
      return;
    }

    if (file.size > this.maxSizeBytes()) {
      this.rejectFile(`La imagen supera el tamaño máximo (${this.maxSizeLabel()}).`);
      return;
    }

    this.revokePreview();
    const previewUrl = this.createPreview(file);

    this.#pendingFile.set(file);
    this.#previewUrl.set(previewUrl);
    this.#fileName.set(file.name);
    this.#message.set('');
    this.#progress.set(0);
    this.#status.set('selected');

    this.emitSelect(file, previewUrl);
  }

  private isAcceptedType(file: File): boolean {
    const accept = this.accept().trim();
    if (!accept) {
      return file.type.startsWith('image/');
    }

    const tokens = accept
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length > 0);

    const type = file.type.toLowerCase();
    return tokens.some((token) => {
      if (token === 'image/*') {
        return type.startsWith('image/');
      }
      if (token.startsWith('.')) {
        return file.name.toLowerCase().endsWith(token);
      }
      return type === token;
    });
  }

  private rejectFile(reason: string): void {
    this.#pendingFile.set(null);
    this.#status.set('error');
    this.#message.set(reason);
  }

  private failUpload(reason: string, name: string, payload: unknown = null): void {
    this.#status.set('error');
    this.#message.set(reason);
    this.#progress.set(0);
    this.emitUploadResult('error', name, payload, reason);
  }

  private emitSelect(file: File, dataUrl: string): void {
    const detail: AvatarSelectDetail = {
      name: file.name,
      size: file.size,
      type: file.type,
      dataUrl,
    };
    this.avatarselect.emit(detail);
  }

  private emitUploadResult(
    status: 'success' | 'error',
    name: string,
    response: unknown,
    message: string,
  ): void {
    const detail: AvatarUploadResultDetail = { status, name, response, message };
    this.avatarupload.emit(detail);
  }

  private async readResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';
    try {
      if (contentType.includes('application/json')) {
        return await response.json();
      }
      const text = await response.text();
      return text.length > 0 ? text : null;
    } catch {
      return null;
    }
  }

  private createPreview(file: File): string {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      return URL.createObjectURL(file);
    }
    return '';
  }

  private revokePreview(): void {
    const current = this.#previewUrl();
    if (current.startsWith('blob:') && typeof URL?.revokeObjectURL === 'function') {
      URL.revokeObjectURL(current);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes >= BYTES_PER_KB * BYTES_PER_KB) {
      return `${(bytes / (BYTES_PER_KB * BYTES_PER_KB)).toFixed(1)} MB`;
    }
    return `${Math.round(bytes / BYTES_PER_KB)} KB`;
  }
}

/** Internal carrier so a non-OK HTTP response can surface its parsed body. */
class UploadError extends Error {
  constructor(
    message: string,
    readonly payload: unknown,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}
