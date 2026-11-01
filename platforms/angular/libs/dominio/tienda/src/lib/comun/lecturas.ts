import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';

/**
 * Una ESCRITURA que no quedó en el servidor. **Lanza; no devuelve nada que parezca un
 * acuse** (UI#92). El gemelo de `AcademyWriteFailedError` (CMS#117). **No enciende
 * `degraded`**: ese cartel dice «estás viendo datos de ejemplo», y un pedido no es un
 * ejemplo.
 */
export class ShopWriteFailedError extends Error {
  constructor(
    readonly endpoint: string,
    override readonly cause: unknown,
  ) {
    super(`Shop write "${endpoint}" did not reach the server.`);
    this.name = 'ShopWriteFailedError';
  }
}

/**
 * Lo que comparten los adaptadores de la tienda (014-despiece-tienda, T009): si alguna LECTURA cayó a su muestra
 * —el cartel de «datos de ejemplo»— y qué se dice en el log de cada caída. Era el estado privado del cliente único
 * (`ShopApiClient`), que la estrategia de pago y la tienda leían de la MISMA instancia; sigue siendo una por app.
 *
 * **Graceful degradation — sólo de LECTURAS:** if a read endpoint is not yet wired (network error / non-OK), the
 * adapter falls back to visible **mock data** and logs a `TODO`. Every mock path flips the `degraded` flag so the
 * shell can surface a "datos de ejemplo" notice.
 *
 * **Las ESCRITURAS no degradan** (UI#92, reglas 4, 9, 19 y 38): abrir la orden, colocar el pedido y tocar los
 * favoritos LANZAN {@link ShopWriteFailedError} cuando el borde no contesta.
 */
@Injectable({ providedIn: 'root' })
export class LecturasDeLaTienda {
  readonly #logger = inject(LoggerService);

  /** Set to `true` after any mock fallback so the UI can flag example data. */
  #degraded = false;

  get degraded(): boolean {
    return this.#degraded;
  }

  markDegraded(endpoint: string, error: unknown): void {
    this.#degraded = true;
    // TODO(backend): remove the mock fallback once the Tienda API responds.
    this.#logger.warn(`Shop API "${endpoint}" unavailable — using mock data.`, error);
  }

  /** Una LECTURA que no llegó y que no tiene ejemplo que enseñar: no enciende `degraded`, porque no hay muestra. */
  readFailed(endpoint: string, error: unknown): void {
    this.#logger.warn(`Shop API "${endpoint}" unavailable — nothing shown in its place.`, error);
  }

  /**
   * Una ESCRITURA que no llegó. **No marca `degraded` y no devuelve nada**: el cartel de
   * «datos de ejemplo» es de las LECTURAS, y aquí no hay ejemplo que enseñar.
   */
  writeFailed(endpoint: string, error: unknown): never {
    this.#logger.warn(`Shop API "${endpoint}" unavailable — nothing was saved.`, error);
    throw new ShopWriteFailedError(endpoint, error);
  }
}
