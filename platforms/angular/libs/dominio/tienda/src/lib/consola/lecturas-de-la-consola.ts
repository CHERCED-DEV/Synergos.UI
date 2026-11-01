import { Injectable, InjectionToken, inject } from '@angular/core';
import { LoggerService, llamarAlBorde } from '@synergos/core';

/**
 * Thin HTTP client over the Tienda backend contract, seller side. Programs
 * against:
 *
 *  - `GET  /api/shop/seller/summary`                    → `{ kpis, reputation }`
 *  - `GET  /api/shop/orders`                            → `{ orders }` (ventas)
 *  - `POST /api/shop/order/{ref}/tracking/advance`      → `{ orderRef, status }`
 *  - `GET  /api/shop/seller/products`                   → `{ items }` (publicaciones)
 *  - `GET  /api/shop/returns`                           → `{ returns }` (RMA queue)
 *  - `POST /api/shop/return/{rmaId}/advance` `{action}` → `{ rmaId, status }`
 *  - `POST /api/shop/seller/product` `{...}`            → `{ productId, status }`
 *  - `GET  /api/shop/messages`                          → `{ threads }`
 *  - `POST /api/shop/messages/{id}/reply` `{ body }`    → `{ id, body, date }`
 *
 * **Cada lectura dice lo que pasó** (013-seller-operaciones, T006; la T2, «la UI no miente»): leída, o por qué no
 * —sin sesión (401), sin permiso (403) o caída (la red, un 5xx, una forma que no se entiende)—. Las muestras de
 * abajo sólo salen con {@link MUESTRAS_DE_LA_CONSOLA}, y entonces marcadas como tales: antes caían solas con
 * cualquier fallo y el vendedor veía pedidos, devoluciones y reputación inventados con un cartel.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */

/**
 * Los pedidos, publicaciones, devoluciones, hilos e indicadores DE EJEMPLO de la consola, sólo para una demo que lo
 * declare (013-seller-operaciones, T006). El molde de `MUESTRAS_DE_LA_CONSOLA` de la academia (010) y de
 * `MUESTRAS_DE_LA_CUENTA` de la tienda (004).
 *
 * La consola caía a sus `mock*` con cualquier fallo, con un cartel de «datos de ejemplo»: un personal de la tienda
 * veía ventas, devoluciones y reputación que nadie tenía. El camino real ya no los pinta: sin sesión lo dice, sin
 * permiso lo dice, y caída dice que no se pudo cargar. Se conservan detrás de esta marca, que una demo provee a
 * propósito (`{ provide: MUESTRAS_DE_LA_CONSOLA, useValue: true }`) y que nadie hereda sin escribirla.
 */
export const MUESTRAS_DE_LA_CONSOLA = new InjectionToken<boolean>('MUESTRAS_DE_LA_CONSOLA', {
  factory: () => false,
});

/**
 * Lo que dice una lectura de la consola: leída, vacía, de ejemplo (sólo con la marca), o por qué no.
 *
 * Vacía es una lista que el servidor contestó sin nada: es una respuesta, no una caída, y con la marca tampoco se tapa
 * con la muestra (el molde de 010). Sin sesión y sin permiso tampoco son caídas: el servidor contestó, y contestó que
 * no; con la marca no se tapan, porque un personal que perdió la sesión tiene que enterarse aunque la página sea una
 * demo.
 */
export type LecturaDeLaConsola<T> =
  | { readonly tipo: 'leidas'; readonly datos: T }
  | { readonly tipo: 'vacia'; readonly datos: T }
  | { readonly tipo: 'muestras'; readonly datos: T }
  | { readonly tipo: 'sin-sesion' }
  | { readonly tipo: 'sin-permiso' }
  | { readonly tipo: 'caida' };

/**
 * Cómo lee y escribe la consola del vendedor (014-despiece-tienda, T009): la lectura que dice lo que pasó, la muestra
 * sólo con la marca, y el POST de una escritura. Era la parte privada del cliente único de la consola; la comparten
 * sus adaptadores, uno por capacidad.
 */
@Injectable({ providedIn: 'root' })
export class LecturasDeLaConsola {
  readonly logger = inject(LoggerService);
  readonly #muestras = inject(MUESTRAS_DE_LA_CONSOLA);

  // ─── HTTP helpers ────────────────────────────────────────────────────────────

  /**
   * Una lectura, con lo que pasó: 401 es sin sesión y 403 sin permiso (el servidor contestó que no); la red, un 5xx
   * o una forma que el normalizador no entiende son una caída. Sin `apiBase` no se llama a nada (ADR 0137), y eso
   * también es una caída: no hay dónde leer.
   */
  async leer<T>(
    apiBase: string,
    url: string,
    endpoint: string,
    normalizar: (value: unknown) => T | null,
    muestra: () => T,
    esVacia: (datos: T) => boolean = (datos) => Array.isArray(datos) && datos.length === 0,
  ): Promise<LecturaDeLaConsola<T>> {
    if (typeof fetch !== 'function' || !apiBase) {
      return this.noSePudo(endpoint, muestra, new Error(apiBase ? 'fetch-unavailable' : 'sin-api'));
    }
    let respuesta: Response;
    try {
      respuesta = await llamarAlBorde(apiBase, url, { method: 'GET', headers: { Accept: 'application/json' } });
    } catch (error) {
      return this.noSePudo(endpoint, muestra, error);
    }
    if (respuesta.status === 401 || respuesta.status === 403) {
      await respuesta.body?.cancel();
      return { tipo: respuesta.status === 401 ? 'sin-sesion' : 'sin-permiso' };
    }
    if (!respuesta.ok) {
      await respuesta.body?.cancel();
      return this.noSePudo(endpoint, muestra, new Error(`HTTP ${respuesta.status}`));
    }
    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch (error) {
      return this.noSePudo(endpoint, muestra, error);
    }
    const datos = normalizar(cuerpo);
    if (datos === null) {
      return this.noSePudo(endpoint, muestra, new Error('forma'));
    }
    return esVacia(datos) ? { tipo: 'vacia', datos } : { tipo: 'leidas', datos };
  }

  /** Una lectura que no se pudo: la muestra sólo con la marca; si no, caída. */
  noSePudo<T>(endpoint: string, muestra: () => T, error: unknown): LecturaDeLaConsola<T> {
    this.avisar(endpoint, error);
    return this.#muestras ? { tipo: 'muestras', datos: muestra() } : { tipo: 'caida' };
  }

  postJson(apiBase: string, url: string, body: unknown): Promise<unknown> {
    return this.request(apiBase, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * Sin `apiBase` no se llama a nada —ni a una ruta del propio sitio, que podría ser de otra
   * cosa—: la base es configuración del despliegue (ADR 0137) y no hay una de respaldo
   * compilada. Se rechaza, y la escritura que la pidió dice que no se hizo (#77).
   */
  request(apiBase: string, url: string, init: RequestInit): Promise<unknown> {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch-unavailable'));
    }
    if (!apiBase) {
      return Promise.reject(new Error('sin-api'));
    }
    return llamarAlBorde(apiBase, url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    }).then((response) =>
      response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)),
    );
  }

  avisar(endpoint: string, error: unknown): void {
    this.logger.warn(`Shop seller API "${endpoint}" unavailable.`, error);
  }
}
