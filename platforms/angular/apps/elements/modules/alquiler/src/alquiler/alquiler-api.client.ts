import { Injectable } from '@angular/core';
import {
  normalizeAgreement,
  normalizeCard,
  normalizeDetail,
  normalizeQuote,
  normalizeRental,
  type EquipmentCard,
  type EquipmentDetail,
  type Rental,
  type RentalAgreement,
  type RentalQuote,
} from './alquiler.model';

/**
 * El cliente contra el contrato EXACTO de `AlquilerController` (#147). Sólo estas rutas:
 *
 *  - `GET  /api/alquiler/equipment?category=`        → `EquipmentCardDto[]`
 *  - `GET  /api/alquiler/equipment/{id}`             → `EquipmentDetailDto`
 *  - `POST /api/alquiler/quote`                      → `QuoteDto`
 *  - `POST /api/alquiler/rentals`                    → `RentalDto`
 *  - `POST /api/alquiler/rentals/{id}/return`        → `RentalDto`
 *  - `POST /api/alquiler/rentals/{id}/cancel`        → `RentalDto`
 *  - `GET  /api/alquiler/rentals`                    → `AgreementDto[]`   🔒 sesión
 *  - `GET  /api/alquiler/rentals/{id}/agreement`     → `AgreementDto`
 *
 * **Nada degrada a datos de ejemplo, y es la diferencia con los seis verticales anteriores.**
 * Ellos nacieron antes que su backend y su `catch` servía un seed visible; éste nace después, y
 * el CMS ya siembra su catálogo por defecto. Un seed de este lado sería una segunda verdad sobre
 * qué equipos hay. Y para lo transaccional la degradación nunca fue legítima: un comprobante
 * fabricado se lo lleva alguien a la puerta de una bodega.
 *
 * **El 401 viaja tipado**: no significa «el backend no está», significa «no hay sesión», y
 * taparlo con una bandeja vacía le diría a quien no entró que no tiene alquileres.
 */

/** El borde exige sesión. NO es una caída: es un hueco de identidad. */
export class AlquilerUnauthorizedError extends Error {
  constructor(readonly url: string) {
    super(`HTTP 401 ${url}`);
    this.name = 'AlquilerUnauthorizedError';
  }
}

/** El borde rechazó por una regla de negocio, con su código. */
export class AlquilerRejectedError extends Error {
  constructor(readonly code: string, readonly detail: string) {
    super(detail || code);
    this.name = 'AlquilerRejectedError';
  }
}

/**
 * `instanceof` no cruza bundles —la clase puede venir de otra copia del módulo—, así que se
 * discrimina por `name`. Es el mismo motivo por el que el runtime se comparte en vez de
 * duplicarse.
 */
export function isUnauthorized(error: unknown): error is AlquilerUnauthorizedError {
  return error instanceof Error && error.name === 'AlquilerUnauthorizedError';
}

/** Si el fallo trae un código de rechazo del borde. */
export function isRejected(error: unknown): error is AlquilerRejectedError {
  return error instanceof Error && error.name === 'AlquilerRejectedError';
}

@Injectable()
export class AlquilerApiClient {
  /** El catálogo publicado. */
  async equipment(apiBase: string, category: string): Promise<readonly EquipmentCard[]> {
    const url = category
      ? `${apiBase}/equipment?category=${encodeURIComponent(category)}`
      : `${apiBase}/equipment`;
    const data = await this.getJson(url);
    return Array.isArray(data)
      ? data.map(normalizeCard).filter((c): c is EquipmentCard => c !== null)
      : [];
  }

  /** La ficha de un equipo, o `null` si no existe o le faltan los límites. */
  async detail(apiBase: string, equipmentId: string): Promise<EquipmentDetail | null> {
    const url = `${apiBase}/equipment/${encodeURIComponent(equipmentId)}`;
    const data = await this.getJson(url);
    return normalizeDetail(data);
  }

  /**
   * Cuánto costaría. No compromete nada, así que su fallo se puede tragar: la ficha se queda
   * sin precio calculado y el botón de reservar no se ofrece.
   */
  async quote(
    apiBase: string, equipmentId: string, quantity: number, start: string, end: string,
  ): Promise<RentalQuote | null> {
    const url = `${apiBase}/quote`;
    const body = { equipmentId, quantity, start, end };
    const data = await this.postJson(url, body);
    return normalizeQuote(data);
  }

  /**
   * Reserva.
   *
   * **La llave es DETERMINISTA sobre lo que se reserva** —equipo, cantidad y ventana— para que un
   * reintento tras un timeout no aparte una segunda vez. El arrendatario no entra en la semilla
   * porque lo resuelve el servidor desde la sesión, y meterlo acá sería fiarse de quien llama.
   *
   * **No devuelve nada inventado.** Si el borde no contesta, lanza: un identificador de alquiler
   * fabricado se lo lleva alguien a recoger un andamio que nadie apartó.
   */
  async reserve(
    apiBase: string, equipmentId: string, quantity: number, start: string, end: string,
  ): Promise<Rental> {
    const url = `${apiBase}/rentals`;
    const idempotencyKey = llaveDe('rent', equipmentId, String(quantity), start, end);
    const body = { equipmentId, quantity, start, end, idempotencyKey };
    const data = await this.postJson(url, body);
    const rental = normalizeRental(data);
    if (!rental) {
      throw new Error('El borde contestó algo que no es un alquiler.');
    }
    return rental;
  }

  /**
   * El equipo volvió. `amount` es el daño, ya calculado por quien lo recibió.
   *
   * **La acción va escrita en la URL y no en una variable**, y eso no es estilo: G-7 resuelve la
   * ruta de un `const url` y descarta los segmentos interpolados, así que un
   * `` `…/${accion}` `` colapsa sobre la ruta hermana y el gate acusa a un cuerpo correcto de
   * mandar la clave del otro. Medido: con la acción interpolada, denunciaba que `POST /rentals`
   * manda `amount`. Un gate que grita sobre algo que está bien se desactiva a la tercera.
   */
  async return(apiBase: string, rentalId: string, amount: number): Promise<Rental> {
    const url = `${apiBase}/rentals/${encodeURIComponent(rentalId)}/return`;
    return this.settle(url, llaveDe('return', rentalId, String(amount)), amount);
  }

  /** Se cancela antes de que salga. `amount` es la penalidad. */
  async cancel(apiBase: string, rentalId: string, amount: number): Promise<Rental> {
    const url = `${apiBase}/rentals/${encodeURIComponent(rentalId)}/cancel`;
    return this.settle(url, llaveDe('cancel', rentalId, String(amount)), amount);
  }

  /** Mis contratos. Lanza `AlquilerUnauthorizedError` sin sesión. */
  async mine(apiBase: string): Promise<readonly RentalAgreement[]> {
    const url = `${apiBase}/rentals`;
    const data = await this.getJson(url);
    return Array.isArray(data)
      ? data.map(normalizeAgreement).filter((a): a is RentalAgreement => a !== null)
      : [];
  }

  /** El comprobante de un alquiler, con su sello ya comprobado por el servidor. */
  async agreement(apiBase: string, rentalId: string): Promise<RentalAgreement | null> {
    const url = `${apiBase}/rentals/${encodeURIComponent(rentalId)}/agreement`;
    const data = await this.getJson(url);
    return normalizeAgreement(data);
  }

  /**
   * Cierra un alquiler.
   *
   * La llave lleva el MONTO dentro: cobrar de la garantía es un movimiento RELATIVO, así que
   * corregir la cifra y repetir con la misma llave devolvería lo de antes contestando 200 y
   * diciendo «puesto» (`seeded_content_needs_fingerprint`, addendum #114).
   */
  private async settle(url: string, idempotencyKey: string, amount: number): Promise<Rental> {
    const body = { amount, idempotencyKey };
    const data = await this.postJson(url, body);
    const rental = normalizeRental(data);
    if (!rental) {
      throw new Error('El borde contestó algo que no es un alquiler.');
    }
    return rental;
  }

  private async getJson(url: string): Promise<unknown> {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    return this.leer(res, url);
  }

  private async postJson(url: string, body: unknown): Promise<unknown> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    return this.leer(res, url);
  }

  private async leer(res: Response, url: string): Promise<unknown> {
    if (res.status === 401) {
      throw new AlquilerUnauthorizedError(url);
    }

    if (!res.ok) {
      // **Un 4xx y un 5xx no son lo mismo aunque los dos traigan `code`.** Un 409 es una regla
      // de negocio y su motivo es lo que hay que enseñar; un 503 es que el servicio no está, y
      // enseñar su `detail` le dice a quien alquila que el problema es lo que pidió. El árbol de
      // servicios ya reparte así —el rechazo transitorio cae al camino de infraestructura— y
      // repetir acá su tabla de códigos sería una segunda verdad que se desincroniza.
      if (res.status >= 500) {
        throw new Error(`HTTP ${res.status} ${url}`);
      }

      const cuerpo = await res.json().catch(() => null);
      if (cuerpo && typeof cuerpo === 'object' && 'code' in cuerpo) {
        const code = String((cuerpo as Record<string, unknown>)['code'] ?? '');
        const detail = String((cuerpo as Record<string, unknown>)['detail'] ?? '');
        throw new AlquilerRejectedError(code, detail);
      }
      throw new Error(`HTTP ${res.status} ${url}`);
    }

    return res.json();
  }
}

/**
 * Una llave de idempotencia estable sobre lo que se pide.
 *
 * <b>No usa una marca de tiempo ni un aleatorio</b>: eso haría que cada reintento fuera una
 * petición nueva, que es exactamente lo que la llave existe para impedir.
 */
function llaveDe(...partes: readonly string[]): string {
  const semilla = partes.join('|');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < semilla.length; i++) {
    const c = semilla.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `alq-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}
