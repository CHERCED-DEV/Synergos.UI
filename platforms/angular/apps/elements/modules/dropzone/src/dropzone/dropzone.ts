import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
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
 * Runtime config for the CMS element <c>elementSynDropzone</c>.
 *
 * A file drop zone: visitors drag files onto the surface (or pick them via the
 * native file dialog), each candidate is validated against the accepted MIME
 * types / extensions and a max size, then — when an `uploadEndpoint` is
 * configured — POSTed as `multipart/form-data`. Every meaningful moment emits a
 * typed Angular output that is mirrored as a native CustomEvent so the CMS host
 * (or any framework) can react: `filesaccepted`, `filesrejected`,
 * `uploadprogress`, `uploadsuccess`, `uploaderror`.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface DropzoneRuntimeConfig {
  readonly label?: string;
  readonly hint?: string;
  readonly buttonLabel?: string;
  readonly acceptedTypes?: string;
  readonly maxSizeMb?: number;
  readonly maxFiles?: number;
  readonly multiple?: boolean;
  readonly uploadEndpoint?: string;
  readonly fieldName?: string;
  readonly autoUpload?: boolean;
}

export type DropzoneFileStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'error';

export interface DropzoneFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly sizeLabel: string;
  readonly type: string;
  readonly status: DropzoneFileStatus;
  readonly progress: number;
  readonly error: string;
}

export interface DropzoneRejection {
  readonly name: string;
  readonly size: number;
  readonly reason: 'type' | 'size' | 'count';
  readonly message: string;
}

/** Detail of the `filesaccepted` / `filesrejected` outputs. */
export interface DropzoneSelectionDetail {
  readonly accepted: readonly DropzoneFile[];
  readonly rejected: readonly DropzoneRejection[];
}

/** Detail of the `uploadprogress` output. */
export interface DropzoneProgressDetail {
  readonly id: string;
  readonly name: string;
  readonly progress: number;
}

/** Detail of the `uploadsuccess` output. */
export interface DropzoneUploadSuccessDetail {
  readonly id: string;
  readonly name: string;
  readonly response: string;
}

/** Detail of the `uploaderror` output. */
export interface DropzoneUploadErrorDetail {
  readonly id: string;
  readonly name: string;
  readonly message: string;
}

const BYTES_PER_MB = 1024 * 1024;
const DEFAULT_MAX_SIZE_MB = 10;
const DEFAULT_MAX_FILES = 10;
const DEFAULT_FIELD_NAME = 'file';

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

/** Human-readable byte size (B / KB / MB) with es-CO grouping. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted = new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(value);
  return `${formatted} ${units[unitIndex]}`;
}

/** Parse a comma/space separated accept list into normalized tokens. */
export function parseAcceptedTypes(value: string): readonly string[] {
  return value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
}

/**
 * Does a file satisfy an accept list? Tokens may be extensions (`.png`),
 * concrete MIME types (`image/png`), or wildcards (`image/*`). An empty list
 * accepts everything.
 */
export function matchesAcceptedTypes(
  file: { name: string; type: string },
  acceptedTypes: readonly string[],
): boolean {
  if (acceptedTypes.length === 0) {
    return true;
  }

  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();

  return acceptedTypes.some((token) => {
    if (token.startsWith('.')) {
      return fileName.endsWith(token);
    }
    if (token.endsWith('/*')) {
      const prefix = token.slice(0, token.length - 1); // keep trailing slash
      return fileType.startsWith(prefix);
    }
    return fileType === token;
  });
}

function sanitizeDropzoneConfig(value: Partial<DropzoneRuntimeConfig>): DropzoneRuntimeConfig {
  return omitUndefinedProperties<DropzoneRuntimeConfig>({
    label: coerceTrimmedStringInput(value.label),
    hint: coerceTrimmedStringInput(value.hint),
    buttonLabel: coerceTrimmedStringInput(value.buttonLabel),
    acceptedTypes: coerceTrimmedStringInput(value.acceptedTypes),
    maxSizeMb: coerceOptionalNumberInput(value.maxSizeMb),
    maxFiles: coerceOptionalNumberInput(value.maxFiles),
    multiple: coerceOptionalBooleanInput(value.multiple),
    uploadEndpoint: coerceTrimmedStringInput(value.uploadEndpoint),
    fieldName: coerceTrimmedStringInput(value.fieldName),
    autoUpload: coerceOptionalBooleanInput(value.autoUpload),
  });
}

@Component({
  selector: 'sg-dropzone',
  standalone: true,
  templateUrl: './dropzone.html',
  styleUrl: './dropzone.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-dropzone' },
})
export class DropzoneElementComponent {
  readonly config = input<DropzoneRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<DropzoneRuntimeConfig>(sanitizeDropzoneConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly hintInput = input<string | undefined>(undefined, { alias: 'hint' });
  readonly buttonLabelInput = input<string | undefined>(undefined, { alias: 'buttonLabel' });
  readonly acceptedTypesInput = input<string | undefined>(undefined, { alias: 'acceptedTypes' });
  readonly maxSizeMbInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxSizeMb',
    transform: coerceOptionalNumberInput,
  });
  readonly maxFilesInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxFiles',
    transform: coerceOptionalNumberInput,
  });
  readonly multipleInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'multiple',
    transform: coerceOptionalBooleanInput,
  });
  readonly uploadEndpointInput = input<string | undefined>(undefined, { alias: 'uploadEndpoint' });
  readonly fieldNameInput = input<string | undefined>(undefined, { alias: 'fieldName' });
  readonly autoUploadInput = input<boolean | undefined, unknown>(undefined, {
    alias: 'autoUpload',
    transform: coerceOptionalBooleanInput,
  });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular outputs, mirrored as native CustomEvents by the host. */
  readonly filesaccepted = output<DropzoneSelectionDetail>();
  readonly filesrejected = output<DropzoneSelectionDetail>();
  readonly uploadprogress = output<DropzoneProgressDetail>();
  readonly uploadsuccess = output<DropzoneUploadSuccessDetail>();
  readonly uploaderror = output<DropzoneUploadErrorDetail>();

  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, 'Arrastra tus archivos aquí'),
  );
  readonly buttonLabel = computed(() =>
    resolveConfigValue(this.buttonLabelInput(), this.config()?.buttonLabel, 'Seleccionar archivos'),
  );
  readonly acceptedTypesRaw = computed(() =>
    resolveConfigValue(this.acceptedTypesInput(), this.config()?.acceptedTypes, ''),
  );
  readonly maxSizeMb = computed(() => {
    const value = resolveConfigValue(this.maxSizeMbInput(), this.config()?.maxSizeMb, DEFAULT_MAX_SIZE_MB);
    return value > 0 ? value : DEFAULT_MAX_SIZE_MB;
  });
  readonly maxFiles = computed(() => {
    const value = resolveConfigValue(this.maxFilesInput(), this.config()?.maxFiles, DEFAULT_MAX_FILES);
    return value >= 1 ? Math.floor(value) : DEFAULT_MAX_FILES;
  });
  readonly multiple = computed(() =>
    resolveConfigValue(this.multipleInput(), this.config()?.multiple, true),
  );
  readonly uploadEndpoint = computed(() =>
    resolveConfigValue(this.uploadEndpointInput(), this.config()?.uploadEndpoint, ''),
  );
  readonly fieldName = computed(() =>
    resolveConfigValue(this.fieldNameInput(), this.config()?.fieldName, DEFAULT_FIELD_NAME),
  );
  readonly autoUpload = computed(() =>
    resolveConfigValue(this.autoUploadInput(), this.config()?.autoUpload, true),
  );

  readonly acceptedTypes = computed<readonly string[]>(() =>
    parseAcceptedTypes(this.acceptedTypesRaw()),
  );
  /** Value for the native input `accept` attribute. */
  readonly acceptAttr = computed(() => {
    const tokens = this.acceptedTypes();
    return tokens.length > 0 ? tokens.join(',') : null;
  });

  readonly maxSizeBytes = computed(() => this.maxSizeMb() * BYTES_PER_MB);

  readonly hint = computed(() => {
    const explicit = resolveConfigValue(this.hintInput(), this.config()?.hint, '');
    if (explicit) {
      return explicit;
    }

    const parts: string[] = [];
    const tokens = this.acceptedTypes();
    if (tokens.length > 0) {
      parts.push(tokens.join(', '));
    }
    parts.push(`máx. ${formatFileSize(this.maxSizeBytes())}`);
    if (this.multiple()) {
      parts.push(`hasta ${this.maxFiles()} archivos`);
    }
    return parts.join(' · ');
  });

  /** Files the visitor has staged, keyed for OnPush-friendly tracking. */
  readonly files = signal<readonly DropzoneFile[]>([]);
  readonly #dragActive = signal(false);
  readonly dragActive = this.#dragActive.asReadonly();

  readonly hasFiles = computed(() => this.files().length > 0);
  readonly canUpload = computed(
    () => this.uploadEndpoint().length > 0 && this.files().some((file) => file.status === 'pending'),
  );
  readonly isUploading = computed(() => this.files().some((file) => file.status === 'uploading'));

  /** Live-region summary for assistive tech. */
  readonly statusMessage = computed(() => {
    const total = this.files().length;
    if (total === 0) {
      return 'Sin archivos seleccionados.';
    }
    const uploaded = this.files().filter((file) => file.status === 'uploaded').length;
    const errored = this.files().filter((file) => file.status === 'error').length;
    const noun = total === 1 ? 'archivo seleccionado' : 'archivos seleccionados';
    let message = `${total} ${noun}.`;
    if (uploaded > 0) {
      message += ` ${uploaded} subido${uploaded === 1 ? '' : 's'}.`;
    }
    if (errored > 0) {
      message += ` ${errored} con error.`;
    }
    return message;
  });

  #uploadCounter = 0;

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.#dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.#dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.#dragActive.set(false);
    const list = event.dataTransfer?.files;
    if (list && list.length > 0) {
      this.ingest(list);
    }
  }

  onFileInputChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (target?.files && target.files.length > 0) {
      this.ingest(target.files);
    }
    // Reset so picking the same file again still fires `change`.
    if (target) {
      target.value = '';
    }
  }

  /** Keyboard activation of the drop surface opens the native picker. */
  onZoneKeydown(event: KeyboardEvent, fileInput: HTMLInputElement): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  }

  openPicker(fileInput: HTMLInputElement): void {
    fileInput.click();
  }

  removeFile(id: string): void {
    this.files.update((files) => files.filter((file) => file.id !== id));
  }

  clearAll(): void {
    this.files.set([]);
  }

  /** Upload every pending file (used by the action button). */
  uploadAll(): void {
    const endpoint = this.uploadEndpoint();
    if (!endpoint) {
      return;
    }
    for (const file of this.files()) {
      if (file.status === 'pending') {
        this.#uploads.get(file.id)?.();
      }
    }
  }

  /** Per-file upload starters, registered when a file is staged. */
  readonly #uploads = new Map<string, () => void>();

  private ingest(list: FileList): void {
    const accepted: DropzoneFile[] = [];
    const rejected: DropzoneRejection[] = [];
    const acceptedTypes = this.acceptedTypes();
    const maxBytes = this.maxSizeBytes();
    const maxFiles = this.maxFiles();
    const multiple = this.multiple();

    // When single-file, replace the staged set entirely.
    let currentCount = multiple ? this.files().length : 0;
    const candidates = Array.from(list);
    const limited = multiple ? candidates : candidates.slice(0, 1);

    for (const raw of limited) {
      if (!matchesAcceptedTypes(raw, acceptedTypes)) {
        rejected.push({
          name: raw.name,
          size: raw.size,
          reason: 'type',
          message: `Tipo no permitido: ${raw.name}`,
        });
        continue;
      }
      if (raw.size > maxBytes) {
        rejected.push({
          name: raw.name,
          size: raw.size,
          reason: 'size',
          message: `Supera el tamaño máximo (${formatFileSize(maxBytes)}): ${raw.name}`,
        });
        continue;
      }
      if (currentCount >= maxFiles) {
        rejected.push({
          name: raw.name,
          size: raw.size,
          reason: 'count',
          message: `Se alcanzó el límite de ${maxFiles} archivos: ${raw.name}`,
        });
        continue;
      }

      const id = `dz-${this.#uploadCounter++}`;
      const entry: DropzoneFile = {
        id,
        name: raw.name,
        size: raw.size,
        sizeLabel: formatFileSize(raw.size),
        type: raw.type,
        status: 'pending',
        progress: 0,
        error: '',
      };
      accepted.push(entry);
      this.#registerUpload(id, raw);
      currentCount += 1;
    }

    if (accepted.length > 0) {
      this.files.update((files) =>
        multiple ? [...files, ...accepted] : [...accepted],
      );
      const detail: DropzoneSelectionDetail = { accepted, rejected };
      this.filesaccepted.emit(detail);

      if (this.autoUpload() && this.uploadEndpoint()) {
        for (const entry of accepted) {
          this.#uploads.get(entry.id)?.();
        }
      }
    }

    if (rejected.length > 0) {
      this.filesrejected.emit({ accepted, rejected });
    }
  }

  #registerUpload(id: string, raw: File): void {
    this.#uploads.set(id, () => this.#startUpload(id, raw));
  }

  #patchFile(id: string, patch: Partial<DropzoneFile>): void {
    this.files.update((files) =>
      files.map((file) => (file.id === id ? { ...file, ...patch } : file)),
    );
  }

  #startUpload(id: string, raw: File): void {
    const endpoint = this.uploadEndpoint();
    if (!endpoint || typeof XMLHttpRequest !== 'function') {
      return;
    }
    const current = this.files().find((file) => file.id === id);
    if (!current || current.status === 'uploading' || current.status === 'uploaded') {
      return;
    }

    this.#patchFile(id, { status: 'uploading', progress: 0, error: '' });

    const form = new FormData();
    form.append(this.fieldName(), raw, raw.name);

    const request = new XMLHttpRequest();
    request.open('POST', endpoint, true);

    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) {
        return;
      }
      const progress = Math.round((event.loaded / event.total) * 100);
      this.#patchFile(id, { progress });
      this.uploadprogress.emit({ id, name: raw.name, progress });
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        this.#patchFile(id, { status: 'uploaded', progress: 100 });
        this.uploadsuccess.emit({ id, name: raw.name, response: request.responseText });
      } else {
        const message = `Error ${request.status}`;
        this.#patchFile(id, { status: 'error', error: message });
        this.uploaderror.emit({ id, name: raw.name, message });
      }
    });

    request.addEventListener('error', () => {
      const message = 'No se pudo conectar con el servidor';
      this.#patchFile(id, { status: 'error', error: message });
      this.uploaderror.emit({ id, name: raw.name, message });
    });

    request.send(form);
  }
}
