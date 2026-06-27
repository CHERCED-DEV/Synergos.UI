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
  coerceOptionalNumberInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynFileUploader</c>.
 *
 * A file-upload control: visitors pick files (button or drag-and-drop), each
 * file is listed with name + size + a live progress bar, and uploads POST to
 * `uploadEndpoint`. Files can be removed before/after upload; a completed or
 * failed transfer can be retried by removing and re-adding. Selection and
 * lifecycle changes emit a `fileschange` CustomEvent.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface FileUploaderRuntimeConfig {
  readonly uploadEndpoint?: string;
  readonly acceptedTypes?: string;
  readonly maxFileSizeMb?: number;
  readonly maxFiles?: number;
  readonly label?: string;
}

export type FileUploadStatus = 'queued' | 'uploading' | 'done' | 'error';

/** A single tracked file, exposed on the `fileschange` CustomEvent. */
export interface UploadFileSnapshot {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly progress: number;
  readonly status: FileUploadStatus;
  readonly error: string;
}

/** Emitted on the `fileschange` CustomEvent and the typed Angular output. */
export interface FilesChangeDetail {
  readonly files: readonly UploadFileSnapshot[];
}

interface TrackedFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly file: File;
  readonly progress: number;
  readonly status: FileUploadStatus;
  readonly error: string;
}

const DEFAULT_LABEL = 'Arrastra archivos aquí o selecciónalos';
const DEFAULT_MAX_FILE_SIZE_MB = 10;
const DEFAULT_MAX_FILES = 10;
const BYTES_PER_MB = 1024 * 1024;
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** Human-readable file size (e.g. 1.4 MB), locale-grouped. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${SIZE_UNITS[unitIndex]}`;
}

/** Match a File against an accept attribute list (extensions, mime, wildcards). */
export function matchesAccept(file: File, accept: string): boolean {
  const tokens = accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return true;
  }

  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();

  return tokens.some((token) => {
    if (token.startsWith('.')) {
      return name.endsWith(token);
    }

    if (token.endsWith('/*')) {
      const prefix = token.slice(0, token.length - 1); // keep trailing '/'
      return type.startsWith(prefix);
    }

    return type === token;
  });
}

function sanitizeFileUploaderConfig(
  value: Partial<FileUploaderRuntimeConfig>,
): FileUploaderRuntimeConfig {
  return omitUndefinedProperties<FileUploaderRuntimeConfig>({
    uploadEndpoint: coerceTrimmedStringInput(value.uploadEndpoint),
    acceptedTypes: coerceTrimmedStringInput(value.acceptedTypes),
    maxFileSizeMb: coerceOptionalNumberInput(value.maxFileSizeMb),
    maxFiles: coerceOptionalNumberInput(value.maxFiles),
    label: coerceTrimmedStringInput(value.label),
  });
}

@Component({
  selector: 'sg-file-uploader',
  standalone: true,
  templateUrl: './file-uploader.html',
  styleUrl: './file-uploader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-file-uploader' },
})
export class FileUploaderElementComponent {
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<FileUploaderRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<FileUploaderRuntimeConfig>(sanitizeFileUploaderConfig),
  });
  readonly uploadEndpointInput = input<string | undefined>(undefined, { alias: 'uploadEndpoint' });
  readonly acceptedTypesInput = input<string | undefined>(undefined, { alias: 'acceptedTypes' });
  readonly maxFileSizeMbInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxFileSizeMb',
    transform: coerceOptionalNumberInput,
  });
  readonly maxFilesInput = input<number | undefined, unknown>(undefined, {
    alias: 'maxFiles',
    transform: coerceOptionalNumberInput,
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `fileschange` CustomEvent. */
  readonly fileschange = output<FilesChangeDetail>();

  readonly uploadEndpoint = computed(() =>
    resolveConfigValue(this.uploadEndpointInput(), this.config()?.uploadEndpoint, ''),
  );
  readonly acceptedTypes = computed(() =>
    resolveConfigValue(this.acceptedTypesInput(), this.config()?.acceptedTypes, ''),
  );
  readonly label = computed(() =>
    resolveConfigValue(this.labelInput(), this.config()?.label, DEFAULT_LABEL),
  );
  readonly maxFileSizeMb = computed(() => {
    const resolved = resolveConfigValue(
      this.maxFileSizeMbInput(),
      this.config()?.maxFileSizeMb,
      DEFAULT_MAX_FILE_SIZE_MB,
    );
    return resolved > 0 ? resolved : DEFAULT_MAX_FILE_SIZE_MB;
  });
  readonly maxFiles = computed(() => {
    const resolved = resolveConfigValue(
      this.maxFilesInput(),
      this.config()?.maxFiles,
      DEFAULT_MAX_FILES,
    );
    return resolved > 0 ? Math.floor(resolved) : DEFAULT_MAX_FILES;
  });

  readonly maxFileSizeBytes = computed(() => this.maxFileSizeMb() * BYTES_PER_MB);

  readonly #files = signal<readonly TrackedFile[]>([]);
  readonly files = this.#files.asReadonly();

  /** Whether a drag operation is currently hovering the dropzone. */
  readonly isDragging = signal(false);

  /** Most recent rejection message (oversize / too many / type mismatch). */
  readonly rejection = signal<string>('');

  readonly hasFiles = computed(() => this.#files().length > 0);
  readonly canAddMore = computed(() => this.#files().length < this.maxFiles());

  readonly uploadingCount = computed(
    () => this.#files().filter((file) => file.status === 'uploading').length,
  );
  readonly doneCount = computed(
    () => this.#files().filter((file) => file.status === 'done').length,
  );

  readonly summaryLabel = computed(() => {
    const total = this.#files().length;
    if (total === 0) {
      return '';
    }
    const done = this.doneCount();
    return `${done} de ${total} subido(s)`;
  });

  readonly #xhrs = new Map<string, XMLHttpRequest>();
  #idSeq = 0;

  constructor() {
    this.#destroyRef.onDestroy(() => {
      for (const xhr of this.#xhrs.values()) {
        xhr.abort();
      }
      this.#xhrs.clear();
    });
  }

  /** Wire the hidden <input type=file> change event. */
  onFileInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.addFiles(target.files);
    // Reset so re-selecting the same file fires `change` again.
    target.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.canAddMore()) {
      this.isDragging.set(true);
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    this.addFiles(event.dataTransfer?.files ?? null);
  }

  /** Validate + enqueue a FileList, then kick off uploads. */
  addFiles(list: FileList | null): void {
    if (!list || list.length === 0) {
      return;
    }

    this.rejection.set('');
    const accept = this.acceptedTypes();
    const maxBytes = this.maxFileSizeBytes();
    const additions: TrackedFile[] = [];
    let remaining = this.maxFiles() - this.#files().length;
    let rejectedTooMany = false;
    let rejectedType = false;
    let rejectedSize = false;

    for (const file of Array.from(list)) {
      if (remaining <= 0) {
        rejectedTooMany = true;
        break;
      }

      if (accept && !matchesAccept(file, accept)) {
        rejectedType = true;
        continue;
      }

      if (file.size > maxBytes) {
        rejectedSize = true;
        continue;
      }

      additions.push({
        id: `file-${this.#idSeq++}`,
        name: file.name,
        size: file.size,
        file,
        progress: 0,
        status: 'queued',
        error: '',
      });
      remaining -= 1;
    }

    if (rejectedTooMany) {
      this.rejection.set(`Máximo ${this.maxFiles()} archivo(s).`);
    } else if (rejectedSize) {
      this.rejection.set(`Cada archivo debe pesar máximo ${this.maxFileSizeMb()} MB.`);
    } else if (rejectedType) {
      this.rejection.set('Tipo de archivo no permitido.');
    }

    if (additions.length === 0) {
      return;
    }

    this.#files.update((files) => [...files, ...additions]);
    this.#emitChange();

    for (const tracked of additions) {
      this.#startUpload(tracked);
    }
  }

  removeFile(id: string): void {
    const xhr = this.#xhrs.get(id);
    if (xhr) {
      xhr.abort();
      this.#xhrs.delete(id);
    }
    this.#files.update((files) => files.filter((file) => file.id !== id));
    this.#emitChange();
  }

  clearAll(): void {
    for (const xhr of this.#xhrs.values()) {
      xhr.abort();
    }
    this.#xhrs.clear();
    this.#files.set([]);
    this.#emitChange();
  }

  trackById(_index: number, file: TrackedFile): string {
    return file.id;
  }

  formatSize(bytes: number): string {
    return formatFileSize(bytes);
  }

  #startUpload(tracked: TrackedFile): void {
    const endpoint = this.uploadEndpoint().trim();

    // No endpoint configured (or no XHR available): mark as ready locally so the
    // control is still usable for preview / form-bound scenarios.
    if (!endpoint || typeof XMLHttpRequest !== 'function') {
      this.#patch(tracked.id, { status: 'done', progress: 100 });
      this.#emitChange();
      return;
    }

    this.#patch(tracked.id, { status: 'uploading', progress: 0, error: '' });

    const xhr = new XMLHttpRequest();
    this.#xhrs.set(tracked.id, xhr);

    xhr.upload.addEventListener('progress', (progressEvent) => {
      if (!progressEvent.lengthComputable) {
        return;
      }
      const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
      this.#patch(tracked.id, { progress: percent, status: 'uploading' });
      this.#emitChange();
    });

    xhr.addEventListener('load', () => {
      this.#xhrs.delete(tracked.id);
      if (xhr.status >= 200 && xhr.status < 300) {
        this.#patch(tracked.id, { status: 'done', progress: 100, error: '' });
      } else {
        this.#patch(tracked.id, { status: 'error', error: `Error ${xhr.status}` });
      }
      this.#emitChange();
    });

    xhr.addEventListener('error', () => {
      this.#xhrs.delete(tracked.id);
      this.#patch(tracked.id, { status: 'error', error: 'Fallo de red' });
      this.#emitChange();
    });

    xhr.addEventListener('abort', () => {
      this.#xhrs.delete(tracked.id);
    });

    const formData = new FormData();
    formData.append('file', tracked.file, tracked.name);

    xhr.open('POST', endpoint);
    xhr.send(formData);
  }

  #patch(id: string, patch: Partial<Omit<TrackedFile, 'id' | 'file'>>): void {
    this.#files.update((files) =>
      files.map((file) => (file.id === id ? { ...file, ...patch } : file)),
    );
  }

  #emitChange(): void {
    const snapshot: readonly UploadFileSnapshot[] = this.#files().map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      progress: file.progress,
      status: file.status,
      error: file.error,
    }));
    this.fileschange.emit({ files: snapshot });
  }
}
