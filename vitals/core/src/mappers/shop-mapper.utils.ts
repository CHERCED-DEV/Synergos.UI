type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null;
}

function readUnknown(data: UnknownRecord, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
}

function readFirstUnknown(data: UnknownRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    const raw = readUnknown(data, key);
    if (raw !== undefined) {
      return raw;
    }
  }

  return undefined;
}

export function readString(data: UnknownRecord, key: string, fallback = ''): string {
  const raw = readUnknown(data, key);
  if (typeof raw === 'string') {
    return raw;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  return fallback;
}

export function readStringFromKeys(
  data: UnknownRecord,
  keys: readonly string[],
  fallback = '',
): string {
  const raw = readFirstUnknown(data, keys);
  if (typeof raw === 'string') {
    return raw;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  return fallback;
}

export function readBooleanAsString(data: UnknownRecord, key: string, fallback: boolean): string {
  const raw = readUnknown(data, key);
  if (typeof raw === 'boolean') {
    return String(raw);
  }
  if (typeof raw === 'string') {
    if (raw.toLowerCase() === 'true') return 'true';
    if (raw.toLowerCase() === 'false') return 'false';
  }
  return String(fallback);
}

export function readBooleanAsStringFromKeys(
  data: UnknownRecord,
  keys: readonly string[],
  fallback: boolean,
): string {
  const raw = readFirstUnknown(data, keys);
  if (typeof raw === 'boolean') {
    return String(raw);
  }
  if (typeof raw === 'string') {
    if (raw.toLowerCase() === 'true') return 'true';
    if (raw.toLowerCase() === 'false') return 'false';
  }
  return String(fallback);
}

export function readNumberAsString(data: UnknownRecord, key: string, fallback: number): string {
  const raw = readUnknown(data, key);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return String(parsed);
    }
  }
  return String(fallback);
}

export function readNumberAsStringFromKeys(
  data: UnknownRecord,
  keys: readonly string[],
  fallback: number,
): string {
  const raw = readFirstUnknown(data, keys);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return String(parsed);
    }
  }
  return String(fallback);
}

export function readTheme(data: UnknownRecord, fallback = 'light'): string {
  const direct = readString(data, 'theme', '');
  if (direct) return direct;

  const domVariant = asRecord(data['domVariant']);
  if (!domVariant) return fallback;
  return readString(domVariant, 'theme', fallback);
}

export function readVariant(data: UnknownRecord, fallback = 'default'): string {
  const legacy = readString(data, 'variantKey', '');
  if (legacy) return legacy;

  const direct = readString(data, 'variant', '');
  if (direct) return direct;

  const domVariant = asRecord(data['domVariant']);
  if (!domVariant) return fallback;
  return readString(domVariant, 'variant', fallback);
}

export function readHeadingText(data: UnknownRecord, fallback = ''): string {
  const direct = readString(data, 'headingText', '');
  if (direct) return direct;

  const heading = asRecord(data['heading']);
  if (!heading) return fallback;
  return readString(heading, 'headingText', fallback);
}

export function normalizeProductCardLayout(value: string): string {
  switch (value.trim().toLowerCase()) {
    case 'horizontal':
      return 'horizontal';
    case 'standard':
    case 'vertical':
    default:
      return 'vertical';
  }
}

export function normalizeProductGridSort(value: string): string {
  switch (value.trim().toLowerCase()) {
    case 'newest':
    case 'price-asc':
    case 'price-desc':
    case 'relevance':
      return value.trim().toLowerCase();
    case 'name':
    default:
      return 'relevance';
  }
}

export function parseCurrencyLikeNumber(value: string, fallback = 0): number {
  const normalized = value.replace(/[^0-9,.-]/g, '').replace(/,(?=\d{3}\b)/g, '');
  const parsed = Number(normalized.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readMediaImage(data: UnknownRecord): { src: string; alt: string } {
  const media = asRecord(data['media']);
  const mediaNode = media ? asRecord(media['media']) : null;

  return {
    src: readString(data, 'imageSrc', readString(mediaNode ?? {}, 'src', '')),
    alt: readString(
      data,
      'imageAlt',
      readString(mediaNode ?? {}, 'alt', readString(media ?? {}, 'altText', '')),
    ),
  };
}

export function readArrayAsJsonString(data: UnknownRecord, key: string): string {
  const raw = readUnknown(data, key);
  if (!Array.isArray(raw)) {
    return '';
  }
  return JSON.stringify(raw);
}

export function readJsonValueAsString(data: UnknownRecord, key: string): string {
  const raw = readUnknown(data, key);
  if (raw === null || raw === undefined) {
    return '';
  }
  if (typeof raw === 'string') {
    return raw;
  }
  if (typeof raw === 'object' || Array.isArray(raw)) {
    return JSON.stringify(raw);
  }
  return String(raw);
}
