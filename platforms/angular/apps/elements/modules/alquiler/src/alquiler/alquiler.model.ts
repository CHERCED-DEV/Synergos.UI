/**
 * La forma de lo que `AlquilerController` emite, y los normalizadores que la leen.
 *
 * **Lo que NO hay acá, y es deliberado: un seed de ejemplo.** Los otros verticales traen su
 * `*.mock.ts` porque nacieron antes que su backend; éste nace después, y el CMS ya sirve un
 * catálogo sembrado por defecto (`Synergos:Catalog:Sources:Alquiler`). Un segundo seed de este
 * lado sería una segunda verdad sobre qué equipos hay, y la que se vería es la que nadie autora.
 * Sin datos se dice que no hay datos.
 */

/** Un objeto cualquiera venido de la red. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Texto, o cadena vacía. */
export function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Un número, **o `null` cuando no llegó**.
 *
 * No cae a cero: cero es un precio VÁLIDO que no falla en ninguna parte hasta que alguien mira
 * la factura. Cada llamador decide qué significa la ausencia — el catálogo omite el equipo, la
 * ficha no pinta el botón de reservar (`a_failed_tryparse_is_not_a_value`).
 */
export function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Un booleano, **o `null` cuando la clave no llegó**.
 *
 * `readBoolean(x, true)` con un default es cómo el otro árbol se pasó una HU entera reponiendo
 * lo que el borde había dejado de fabricar a propósito. Acá la ausencia sobrevive al
 * normalizador y la decide quien la pinta.
 */
export function readBooleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** Una lista de textos, o vacía. */
export function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(readString).filter((s) => s !== '') : [];
}

/** Un tramo de tarifa por duración. */
export interface EquipmentRate {
  readonly code: string;
  readonly label: string;
  readonly minDays: number;
  readonly perDay: number;
  readonly description: string;
}

/** Una fila de la ficha técnica. */
export interface EquipmentSpec {
  readonly label: string;
  readonly value: string;
}

/** La tarjeta de un equipo en el listado. */
export interface EquipmentCard {
  readonly equipmentId: string;
  readonly name: string;
  readonly category: string;
  readonly summary: string;
  readonly coverUrl: string;
  readonly dailyRate: number;
  readonly deposit: number;
  readonly units: number;
}

/** La ficha completa de un equipo. */
export interface EquipmentDetail extends EquipmentCard {
  readonly description: string;
  readonly galleryUrls: readonly string[];
  readonly minDays: number;
  readonly maxDays: number;
  readonly includes: readonly string[];
  readonly requirements: readonly string[];
  readonly rates: readonly EquipmentRate[];
  readonly specs: readonly EquipmentSpec[];
}

/** Lo que costaría, sin comprometer nada. */
export interface RentalQuote {
  readonly equipmentId: string;
  readonly quantity: number;
  readonly days: number;
  readonly perDay: number;
  readonly rentalTotal: number;
  /** Lo que se RETIENE. No se suma al total, y la pantalla lo dice. */
  readonly deposit: number;
}

/** Los tres estados que el borde emite. */
export type RentalState = 'reserved' | 'returned' | 'cancelled';

/** El comprobante de un alquiler. */
export interface RentalAgreement {
  readonly rentalId: string;
  readonly equipmentName: string;
  readonly quantity: number;
  readonly start: string;
  readonly end: string;
  readonly rentalTotal: number;
  readonly depositHeld: number;
  readonly issuedUtc: string;
  readonly seal: string;
  /**
   * Si el sello COMPRUEBA. `null` es «no consta» y **no** se rellena con `true`: un comprobante
   * que se pinta como válido sin haberlo comprobado es exactamente lo que el sello existe para
   * impedir, y quien lo enseña en la puerta no tiene cómo saberlo.
   */
  readonly verified: boolean | null;
}

/** Un alquiler tal como lo lee esta app. */
export interface Rental {
  readonly rentalId: string;
  readonly equipmentId: string;
  readonly quantity: number;
  readonly start: string;
  readonly end: string;
  readonly state: RentalState;
  readonly quote: RentalQuote | null;
  readonly depositHeld: number;
  readonly damageCharged: number;
  readonly agreement: RentalAgreement | null;
}

/**
 * El estado que el borde afirma, **parseado y no adivinado**.
 *
 * Un valor que no se reconozca devuelve `null` y deja el alquiler fuera de la bandeja, que es
 * mejor que decir «reservado» de algo que ya se cerró: omitir la clave, o caer a un valor del
 * vocabulario, es afirmar por cuenta del consumidor lo que el servidor no dijo
 * (`an_omitted_key_can_be_an_assertion`).
 */
export function readRentalState(value: unknown): RentalState | null {
  const raw = readString(value).trim().toLowerCase();
  return raw === 'reserved' || raw === 'returned' || raw === 'cancelled' ? raw : null;
}

/** Normaliza una tarjeta; `null` si le falta lo que la hace utilizable. */
export function normalizeCard(value: unknown): EquipmentCard | null {
  if (!isRecord(value)) return null;
  const equipmentId = readString(value['equipmentId']).trim();
  const dailyRate = readNumber(value['dailyRate']);
  const deposit = readNumber(value['deposit']);
  if (!equipmentId || dailyRate === null || deposit === null) return null;
  return {
    equipmentId,
    name: readString(value['name']) || equipmentId,
    category: readString(value['category']),
    summary: readString(value['summary']),
    coverUrl: readString(value['coverUrl']),
    dailyRate,
    deposit,
    units: readNumber(value['units']) ?? 0,
  };
}

/** Normaliza un tramo; `null` si no se puede aplicar. */
export function normalizeRate(value: unknown): EquipmentRate | null {
  if (!isRecord(value)) return null;
  const minDays = readNumber(value['minDays']);
  const perDay = readNumber(value['perDay']);
  if (minDays === null || perDay === null) return null;
  return {
    code: readString(value['code']),
    label: readString(value['label']),
    minDays,
    perDay,
    description: readString(value['description']),
  };
}

/** Normaliza la ficha; `null` si le falta lo que la hace utilizable. */
export function normalizeDetail(value: unknown): EquipmentDetail | null {
  const card = normalizeCard(value);
  if (!card || !isRecord(value)) return null;

  const minDays = readNumber(value['minDays']);
  const maxDays = readNumber(value['maxDays']);

  // Sin límites no se puede ofrecer reservar: el formulario no sabría qué ventana admitir, y
  // inventarlos mandaría a la gente a un rechazo del servidor.
  if (minDays === null || maxDays === null) return null;

  const specs = Array.isArray(value['specs'])
    ? value['specs']
        .map((s) => (isRecord(s) ? { label: readString(s['label']), value: readString(s['value']) } : null))
        .filter((s): s is EquipmentSpec => s !== null && s.label !== '')
    : [];

  return {
    ...card,
    description: readString(value['description']),
    galleryUrls: readStringArray(value['galleryUrls']),
    minDays,
    maxDays,
    includes: readStringArray(value['includes']),
    requirements: readStringArray(value['requirements']),
    rates: Array.isArray(value['rates'])
      ? value['rates'].map(normalizeRate).filter((r): r is EquipmentRate => r !== null)
      : [],
    specs,
  };
}

/** Normaliza una cotización; `null` si le falta un número. */
export function normalizeQuote(value: unknown): RentalQuote | null {
  if (!isRecord(value)) return null;
  const days = readNumber(value['days']);
  const perDay = readNumber(value['perDay']);
  const rentalTotal = readNumber(value['rentalTotal']);
  const deposit = readNumber(value['deposit']);
  if (days === null || perDay === null || rentalTotal === null || deposit === null) return null;
  return {
    equipmentId: readString(value['equipmentId']),
    quantity: readNumber(value['quantity']) ?? 1,
    days,
    perDay,
    rentalTotal,
    deposit,
  };
}

/** Normaliza un comprobante; `null` si no trae a qué alquiler pertenece. */
export function normalizeAgreement(value: unknown): RentalAgreement | null {
  if (!isRecord(value)) return null;
  const rentalId = readString(value['rentalId']).trim();
  if (!rentalId) return null;
  return {
    rentalId,
    equipmentName: readString(value['equipmentName']),
    quantity: readNumber(value['quantity']) ?? 0,
    start: readString(value['start']),
    end: readString(value['end']),
    rentalTotal: readNumber(value['rentalTotal']) ?? 0,
    depositHeld: readNumber(value['depositHeld']) ?? 0,
    issuedUtc: readString(value['issuedUtc']),
    seal: readString(value['seal']),
    verified: readBooleanOrNull(value['verified']),
  };
}

/** Normaliza un alquiler; `null` si no trae identificador o estado reconocible. */
export function normalizeRental(value: unknown): Rental | null {
  if (!isRecord(value)) return null;
  const rentalId = readString(value['rentalId']).trim();
  const state = readRentalState(value['state']);
  if (!rentalId || state === null) return null;
  return {
    rentalId,
    equipmentId: readString(value['equipmentId']),
    quantity: readNumber(value['quantity']) ?? 0,
    start: readString(value['start']),
    end: readString(value['end']),
    state,
    quote: normalizeQuote(value['quote']),
    depositHeld: readNumber(value['depositHeld']) ?? 0,
    damageCharged: readNumber(value['damageCharged']) ?? 0,
    agreement: normalizeAgreement(value['agreement']),
  };
}
