import { Injectable, InjectionToken, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import { formatearImporte } from '@synergos/vitals-core';
import {
  ETAPAS_DEL_DESPACHO,
  esEstadoDeDevolucion,
  type ActoDelDespacho,
  type BandejaDeLaTienda,
  type DestinoDelEnvio,
  type DetalleDelPedido,
  type DevolucionDeLaTienda,
  type EtapaDelDespacho,
  type EventoDelEnvio,
  type MotivoSinEnvio,
  type MovimientoDeLaDevolucion,
  type PedidoDeLaTienda,
  type ResultadoDelActo,
  type ResultadoDelMovimiento,
  type SellerKpiMetric,
  type SellerKpiUnit,
  type SellerListing,
  type SellerListingStatus,
  type SellerMessage,
  type SellerOrder,
  type SellerOrderStatus,
  type SellerPublishReceipt,
  type SellerPublishRequest,
  type SellerReputation,
  type SellerReturn,
  type SellerReturnAction,
  type SellerReturnStatus,
  type SellerSummary,
  type SellerThread,
} from './seller.model';

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
 * `fetch`, pero sin `apiBase` no llama a nada —ni a una ruta del propio sitio, que podría ser de
 * otra cosa—: la base es configuración del despliegue (ADR 0137) y no hay una de respaldo
 * compilada. Rechaza, y cada llamada lo dice como ante cualquier caída.
 */
function llamar(apiBase: string, url: string, init?: RequestInit): Promise<Response> {
  return apiBase ? fetch(url, init) : Promise.reject(new Error('sin-api'));
}

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

@Injectable()
export class SellerApiClient {
  readonly #logger = inject(LoggerService);
  readonly #muestras = inject(MUESTRAS_DE_LA_CONSOLA);

  // ─── Summary (KPIs + reputación) ─────────────────────────────────────────────

  summary(apiBase: string): Promise<LecturaDeLaConsola<SellerSummary>> {
    return this.leer(apiBase, `${apiBase}/seller/summary`, 'GET /api/shop/seller/summary', normalizeSummary, mockSummary);
  }

  // ─── La bandeja del personal (013-seller-operaciones, T012) ────────────────────

  /**
   * Una página de la bandeja: los pedidos pagados de la tienda entera en `etapa` (o todos), con las cuentas por etapa de
   * la tienda y las compras que el servidor no alcanzó a confirmar. Es la ruta del personal: la de «Mis compras»
   * (`orders`) es la del comprador, y la consola ya no la lee.
   */
  pedidos(apiBase: string, etapa: EtapaDelDespacho | null, pagina: number): Promise<LecturaDeLaConsola<BandejaDeLaTienda>> {
    const consulta = new URLSearchParams();
    if (etapa) consulta.set('etapa', etapa);
    consulta.set('pagina', String(Math.max(1, Math.trunc(pagina) || 1)));
    return this.leer(
      apiBase,
      `${apiBase}/seller/orders?${consulta.toString()}`,
      'GET /api/shop/seller/orders',
      normalizeBandeja,
      () => mockBandeja(etapa),
      (bandeja) => bandeja.pedidos.length === 0,
    );
  }

  /** El detalle de un pedido pagado, con su envío. */
  pedido(apiBase: string, orderRef: string): Promise<LecturaDeLaConsola<DetalleDelPedido>> {
    return this.leer(
      apiBase,
      `${apiBase}/seller/orders/${encodeURIComponent(orderRef)}`,
      'GET /api/shop/seller/orders/{orderRef}',
      normalizeDetalle,
      () => mockDetalle(orderRef),
    );
  }

  // ─── Ventas ──────────────────────────────────────────────────────────────────

  /**
   * «Mis compras» del comprador (`GET orders`): la consola la leía como sus ventas, y el personal veía sus propias
   * compras. Desde 013-seller-operaciones T012 la consola lee la bandeja del personal ({@link pedidos}). Queda aquí sin
   * llamador y fuera de la API del cliente —desconectada, no borrada (Synergos es un superset)— hasta que el arquitecto
   * decida su retiro: está anotado en la bitácora de 013.
   */
  private orders(apiBase: string, currency: string): Promise<LecturaDeLaConsola<readonly SellerOrder[]>> {
    return this.leer(
      apiBase,
      `${apiBase}/orders`,
      'GET /api/shop/orders',
      (data) => normalizeOrders(data, currency),
      () => mockOrders(currency),
    );
  }

  /**
   * Hace avanzar un pedido en la escalera de despacho.
   *
   * **`null` es «no se pudo», y no hay respaldo (#77).** Esto devolvía
   * `nextOrderStatus(current)` cuando el `POST` no llegaba, y su propio docstring lo
   * describía como una degradación deliberada —«degrades to a local, coherent next-status
   * when the endpoint is missing»—. El endpoint **no existe**: `ShopCatalogController`
   * declara `order/{orderRef}/tracking` como GET y nada con `/advance`, así que fallaba el
   * **100 %** de las veces y el vendedor veía su pedido pasar a «Enviado» sin que nada se
   * hubiera movido.
   *
   * Y la regla que lo caza ya estaba escrita en `CLAUDE.md` (regla 19): **un método de
   * escritura que pide como PARÁMETRO lo mismo que promete DEVOLVER deja la decisión en el
   * llamador y el servidor es decoración.** La firma era
   * `advanceShipment(apiBase, orderRef, current)` devolviendo algo derivado de `current`.
   * Por eso `current` ya no se recibe: sin él, el respaldo no se puede escribir.
   *
   * Desde 013-seller-operaciones T021 la consola da los actos por la ruta del personal ({@link avanzar}). Queda aquí sin
   * llamador y fuera de la API del cliente —desconectada, no borrada (Synergos es un superset)— hasta que el arquitecto
   * decida su retiro: está anotado en la bitácora de 013, con {@link orders}.
   */
  private async advanceShipment(apiBase: string, orderRef: string): Promise<SellerOrderStatus | null> {
    const url = `${apiBase}/order/${encodeURIComponent(orderRef)}/tracking/advance`;
    try {
      const data = await this.postJson(apiBase, url, { orderRef });
      const status = normalizeOrderStatus(isRecord(data) ? data['status'] : undefined);
      if (status) {
        return status;
      }
      throw new Error('advance-shape');
    } catch (error) {
      this.avisar('POST /api/shop/order/{ref}/tracking/advance', error);
      return null;
    }
  }

  /**
   * El acto del personal sobre un pedido (013-seller-operaciones, T021): `POST seller/orders/{ref}/advance` con
   * `{ acto, guia }`. Devuelve el pedido como lo dejó el servidor, o que no se hizo (#77) con su código y la etapa en que
   * sigue: la fila no se mueve por su cuenta.
   *
   * 401 y 403 son la sesión y el permiso; un 5xx, la red o un `transient` son «no se pudo ahora»; lo demás es un rechazo
   * con su código. Un 200 que no se entiende se hizo igual: el servidor dijo que sí, y la consola vuelve a leer.
   */
  async avanzar(apiBase: string, orderRef: string, acto: ActoDelDespacho, guia?: string): Promise<ResultadoDelActo> {
    const endpoint = 'POST /api/shop/seller/orders/{orderRef}/advance';
    if (typeof fetch !== 'function' || !apiBase) {
      this.avisar(endpoint, new Error(apiBase ? 'fetch-unavailable' : 'sin-api'));
      return { hecho: false, por: 'caida', codigo: null, etapa: null };
    }
    const url = `${apiBase}/seller/orders/${encodeURIComponent(orderRef)}/advance`;
    let respuesta: Response;
    try {
      respuesta = await llamar(apiBase, url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ acto, guia: guia ?? null }),
      });
    } catch (error) {
      this.avisar(endpoint, error);
      return { hecho: false, por: 'caida', codigo: null, etapa: null };
    }
    let cuerpo: unknown = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      cuerpo = null;
    }
    if (respuesta.ok) {
      return { hecho: true, pedido: normalizePedido(cuerpo) };
    }
    if (respuesta.status === 401 || respuesta.status === 403) {
      return { hecho: false, por: respuesta.status === 401 ? 'sin-sesion' : 'sin-permiso', codigo: null, etapa: null };
    }
    const codigo = isRecord(cuerpo) ? textoONulo(cuerpo['code']) : null;
    const etapa = isRecord(cuerpo) && esEtapa(cuerpo['etapa']) ? cuerpo['etapa'] : null;
    const transitorio = respuesta.status >= 500 || (isRecord(cuerpo) && cuerpo['transient'] === true);
    if (transitorio) {
      this.avisar(endpoint, new Error(`HTTP ${respuesta.status}`));
    }
    return { hecho: false, por: transitorio ? 'caida' : 'rechazo', codigo, etapa };
  }

  // ─── Publicaciones ───────────────────────────────────────────────────────────

  listings(apiBase: string, currency: string): Promise<LecturaDeLaConsola<readonly SellerListing[]>> {
    return this.leer(
      apiBase,
      `${apiBase}/seller/products`,
      'GET /api/shop/seller/products',
      (data) => normalizeListings(data, currency),
      () => mockListings(currency),
    );
  }

  // ─── Devoluciones (RMA) ──────────────────────────────────────────────────────

  /**
   * La cola de devoluciones de la tienda entera (013-seller-operaciones, T025): `GET seller/returns`, en el orden del
   * servidor —lo que más espera, primero—, con el estado exacto y el camino de cada pedido.
   */
  devoluciones(apiBase: string): Promise<LecturaDeLaConsola<readonly DevolucionDeLaTienda[]>> {
    return this.leer(apiBase, `${apiBase}/seller/returns`, 'GET /api/shop/seller/returns', normalizeDevoluciones, mockDevoluciones);
  }

  /**
   * Mueve una devolución: `POST return/{rmaId}/advance` con `{ status, note }`, que es lo que lee el CMS
   * (`ReturnAdvanceBody`). Devuelve el estado en que quedó, o que no se movió (#77) con el motivo que dio el servidor:
   * un reembolso que no sale deja la devolución recibida, y lo dice.
   */
  async moverDevolucion(
    apiBase: string,
    rmaId: string,
    status: MovimientoDeLaDevolucion,
    note?: string,
  ): Promise<ResultadoDelMovimiento> {
    const endpoint = 'POST /api/shop/return/{rmaId}/advance';
    if (typeof fetch !== 'function' || !apiBase) {
      this.avisar(endpoint, new Error(apiBase ? 'fetch-unavailable' : 'sin-api'));
      return { hecho: false, por: 'caida', motivo: null };
    }
    const url = `${apiBase}/return/${encodeURIComponent(rmaId)}/advance`;
    let respuesta: Response;
    try {
      respuesta = await llamar(apiBase, url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: note ?? null }),
      });
    } catch (error) {
      this.avisar(endpoint, error);
      return { hecho: false, por: 'caida', motivo: null };
    }
    let cuerpo: unknown = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      cuerpo = null;
    }
    if (respuesta.ok) {
      return { hecho: true, estado: isRecord(cuerpo) && esEstadoDeDevolucion(cuerpo['estado']) ? cuerpo['estado'] : null };
    }
    if (respuesta.status === 401 || respuesta.status === 403) {
      return { hecho: false, por: respuesta.status === 401 ? 'sin-sesion' : 'sin-permiso', motivo: null };
    }
    const motivo = isRecord(cuerpo) ? textoONulo(cuerpo['error']) : null;
    if (respuesta.status >= 500) {
      this.avisar(endpoint, new Error(`HTTP ${respuesta.status}`));
      return { hecho: false, por: 'caida', motivo };
    }
    return { hecho: false, por: 'rechazo', motivo };
  }

  /**
   * Las devoluciones de QUIEN PREGUNTA (`GET returns`): la consola las leía como la cola de la tienda, y el personal veía
   * las suyas como comprador. Desde 013-seller-operaciones T025 la consola lee la cola del personal
   * ({@link devoluciones}). Queda aquí sin llamador y fuera de la API del cliente —desconectada, no borrada (Synergos es
   * un superset)— hasta que el arquitecto decida su retiro: está anotado en la bitácora de 013, con {@link orders}.
   */
  private returns(apiBase: string): Promise<LecturaDeLaConsola<readonly SellerReturn[]>> {
    return this.leer(apiBase, `${apiBase}/returns`, 'GET /api/shop/returns', normalizeReturns, mockReturns);
  }

  /**
   * Resuelve un RMA.
   *
   * **`null` es «no se pudo» (#77).** Devolvía
   * `action === 'approve' ? 'aprobado' : 'rechazado'`, o sea el ECO de la intención de
   * quien llamó presentado como la respuesta del servidor — la regla 19 otra vez, con el
   * parámetro haciendo de resultado.
   *
   * Y mandaba `{ action }`, que el CMS no lee (`ReturnAdvanceBody` es `{ status, note }`): contestaba 400 siempre, así
   * que aprobar o rechazar desde la consola no funcionó nunca (G-7 lo señaló en 013). Desde T025 pasa por
   * {@link moverDevolucion}, y queda desconectada —privada, sin llamador, no borrada— con {@link returns}.
   */
  private async advanceReturn(
    apiBase: string,
    rmaId: string,
    action: SellerReturnAction,
  ): Promise<SellerReturnStatus | null> {
    const movida = await this.moverDevolucion(apiBase, rmaId, action === 'approve' ? 'approved' : 'rejected');
    return movida.hecho ? (action === 'approve' ? 'en-revision' : 'rechazado') : null;
  }

  // ─── Publicar producto ───────────────────────────────────────────────────────

  /**
   * Publica un producto.
   *
   * **`null` es «no quedó publicado», y es el arreglo del peor de los tres (#77).** Esto
   * devolvía `{ productId: 'PUB-<timestamp36>', status: 'publicado' }` cuando el `POST` no
   * llegaba. Y no llegaba nunca: `ShopCatalogController` **no declara `seller/product`**, así
   * que el vendedor llenaba el formulario, pulsaba publicar, y la pantalla le decía
   * «Publicación creada» con una referencia que no existe en ninguna parte — mientras el
   * componente emitía el evento `productpublished` hacia el host, metía la publicación
   * fantasma en su propia lista y **le borraba el borrador**.
   *
   * Es el quinto de la familia que `CLAUDE.md` ya tiene documentada cuatro veces: el
   * `claimId` de la devolución (regla 9), el `CERT-<random>` (14), el `CITA-<timestamp>` (18)
   * y el `MOCK-<ts>`/`ENR-` (21). Un identificador cuyo valor entero es ser cierto no se
   * rellena: sin dato, se dice que no hay dato.
   */
  async publishProduct(
    apiBase: string,
    request: SellerPublishRequest,
  ): Promise<SellerPublishReceipt | null> {
    const url = `${apiBase}/seller/product`;
    try {
      const data = await this.postJson(apiBase, url, request);
      const receipt = normalizePublishReceipt(data);
      if (receipt) {
        return receipt;
      }
      throw new Error('publish-shape');
    } catch (error) {
      this.avisar('POST /api/shop/seller/product', error);
      return null;
    }
  }

  // ─── Mensajes / preguntas ────────────────────────────────────────────────────

  threads(apiBase: string): Promise<LecturaDeLaConsola<readonly SellerThread[]>> {
    return this.leer(apiBase, `${apiBase}/messages`, 'GET /api/shop/messages', normalizeThreads, mockThreads);
  }

  /**
   * Responde en el hilo. **`null` es «no salió»** (UI#92), la forma de las otras escrituras
   * de este cliente (#77).
   *
   * Devolvía un `msg-<ts>` con el texto y la fecha de hoy cuando el `POST` no llegaba, y la
   * consola lo pintaba en el hilo como enviado: el comprador nunca recibía la respuesta y el
   * vendedor creía haberla dado. **Y llegaba al `catch` aunque el borde SÍ la guardara**: el
   * CMS contesta el HILO entero (`ThreadDto`, con la respuesta al final de `messages`) y esto
   * leía un mensaje suelto en la raíz, así que el respaldo tapaba también el caso bueno
   * (regla 9). Por eso `normalizeReply` lee las dos formas: si sólo se quitara la
   * fabricación, una respuesta guardada saldría como «no se envió» e invitaría a mandarla
   * dos veces.
   */
  async reply(apiBase: string, threadId: string, body: string): Promise<SellerMessage | null> {
    const url = `${apiBase}/messages/${encodeURIComponent(threadId)}/reply`;
    try {
      const data = await this.postJson(apiBase, url, { body });
      const message = normalizeReply(data);
      if (message) {
        return message;
      }
      throw new Error('reply-shape');
    } catch (error) {
      // No pasa por `noSePudo`: eso es de las LECTURAS, y aquí no hay ejemplo que enseñar —
      // hay una respuesta que no salió.
      this.#logger.warn('Shop seller API "POST /api/shop/messages/{id}/reply" — the reply was NOT sent.', error);
      return null;
    }
  }

  // ─── HTTP helpers ────────────────────────────────────────────────────────────

  /**
   * Una lectura, con lo que pasó: 401 es sin sesión y 403 sin permiso (el servidor contestó que no); la red, un 5xx
   * o una forma que el normalizador no entiende son una caída. Sin `apiBase` no se llama a nada (ADR 0137), y eso
   * también es una caída: no hay dónde leer.
   */
  private async leer<T>(
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
      respuesta = await llamar(apiBase, url, { method: 'GET', headers: { Accept: 'application/json' } });
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
  private noSePudo<T>(endpoint: string, muestra: () => T, error: unknown): LecturaDeLaConsola<T> {
    this.avisar(endpoint, error);
    return this.#muestras ? { tipo: 'muestras', datos: muestra() } : { tipo: 'caida' };
  }

  private postJson(apiBase: string, url: string, body: unknown): Promise<unknown> {
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
  private request(apiBase: string, url: string, init: RequestInit): Promise<unknown> {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch-unavailable'));
    }
    if (!apiBase) {
      return Promise.reject(new Error('sin-api'));
    }
    return llamar(apiBase, url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    }).then((response) =>
      response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)),
    );
  }

  private avisar(endpoint: string, error: unknown): void {
    this.#logger.warn(`Shop seller API "${endpoint}" unavailable.`, error);
  }
}

// ─── Normalisers (defensive — tolerate partial/loose API shapes) ───────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return fallback;
}

function readList(value: unknown, key: string): readonly unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value) && Array.isArray(value[key])) {
    return value[key];
  }
  return null;
}

/**
 * Lo legible de una lista, o `null` si el servidor mandó entradas y no se entendió ninguna: eso es una forma ilegible
 * —una caída—, no una lista vacía. Vacía es sólo la que el servidor mandó sin nada. Sin esto, un contrato que se movió
 * (hoy `GET messages` contesta `threadId` y no `id`) se pintaba como «no tienes mensajes».
 */
function legibles<T>(recibidas: readonly unknown[], leidas: readonly T[]): readonly T[] | null {
  return recibidas.length > 0 && leidas.length === 0 ? null : leidas;
}

const KPI_UNITS: readonly SellerKpiUnit[] = ['currency', 'count', 'rating', 'percent'];

function normalizeSummary(value: unknown): SellerSummary | null {
  if (!isRecord(value) || !Array.isArray(value['kpis'])) {
    return null;
  }
  const kpis = value['kpis']
    .map((entry): SellerKpiMetric | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim();
      const label = readString(entry['label']).trim();
      if (!id || !label) {
        return null;
      }
      const unitRaw = readString(entry['unit']).trim().toLowerCase();
      const delta = entry['delta'] === undefined ? undefined : readNumber(entry['delta']);
      const hint = readString(entry['hint']).trim();
      return {
        id,
        label,
        value: readNumber(entry['value']),
        unit: (KPI_UNITS as readonly string[]).includes(unitRaw)
          ? (unitRaw as SellerKpiUnit)
          : 'count',
        delta,
        hint: hint || undefined,
      };
    })
    .filter((kpi): kpi is SellerKpiMetric => kpi !== null);
  if (kpis.length === 0) {
    return null;
  }
  const reputationRaw = isRecord(value['reputation']) ? value['reputation'] : {};
  const reputation: SellerReputation = {
    score: readNumber(reputationRaw['score']),
    level: readString(reputationRaw['level']).trim(),
    onTimeRate: readNumber(reputationRaw['onTimeRate']),
    claimRate: readNumber(reputationRaw['claimRate']),
    responseRate: readNumber(reputationRaw['responseRate']),
  };
  return { kpis, reputation };
}

const ORDER_STATUSES: readonly SellerOrderStatus[] = [
  'pending',
  'paid',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
];

function normalizeOrderStatus(value: unknown): SellerOrderStatus | null {
  const raw = readString(value).trim().toLowerCase();
  return (ORDER_STATUSES as readonly string[]).includes(raw)
    ? (raw as SellerOrderStatus)
    : null;
}

/** Local forward step used only while the advance endpoint is missing. */
function normalizeOrders(value: unknown, currency: string): readonly SellerOrder[] | null {
  const list = readList(value, 'orders');
  if (!list) {
    return null;
  }
  const orders = list
    .map((entry): SellerOrder | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const orderNumber = readString(entry['orderNumber']).trim() || readString(entry['id']).trim();
      if (!orderNumber) {
        return null;
      }
      const rawLines = Array.isArray(entry['items']) ? entry['items'] : [];
      return {
        orderNumber,
        date: readString(entry['date']).trim(),
        buyer:
          readString(entry['buyer']).trim() || readString(entry['customer']).trim(),
        status: normalizeOrderStatus(entry['status']) ?? 'paid',
        total: readNumber(entry['total'] ?? entry['amount']),
        currency: readString(entry['currency']).trim() || currency,
        items: rawLines.map((line) => ({
          title: isRecord(line) ? readString(line['title']).trim() : '',
          qty: isRecord(line) ? Math.max(1, Math.trunc(readNumber(line['qty']))) : 1,
          amount: isRecord(line) ? readNumber(line['amount']) : 0,
        })),
      };
    })
    .filter((order): order is SellerOrder => order !== null);
  return legibles(list, orders);
}

// ─── La bandeja del personal: la forma de `VendedorDeLaTiendaController` (T011) ───

function textoONulo(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function esEtapa(value: unknown): value is EtapaDelDespacho {
  return typeof value === 'string' && (ETAPAS_DEL_DESPACHO as readonly string[]).includes(value);
}

/** Un pedido de la bandeja, o `null` si no se entiende: sin su referencia, su etapa o su camino no hay qué pintar. */
function normalizePedido(value: unknown): PedidoDeLaTienda | null {
  if (!isRecord(value)) {
    return null;
  }
  const orderRef = readString(value['orderRef']).trim();
  const orderNumber = readString(value['orderNumber']).trim();
  const camino = value['camino'];
  if (!orderRef || !orderNumber || !esEtapa(value['etapa']) || (camino !== 'puerta' && camino !== 'directa')) {
    return null;
  }
  const lineas = Array.isArray(value['lineas']) ? value['lineas'] : [];
  return {
    orderRef,
    orderNumber,
    fecha: readString(value['fecha']).trim(),
    comprador: readString(value['comprador']).trim(),
    camino,
    etapa: value['etapa'],
    total: readNumber(value['total']),
    totalFormatted: readString(value['totalFormatted']).trim(),
    moneda: readString(value['moneda']).trim(),
    lineas: lineas.filter(isRecord).map((l) => ({
      title: readString(l['title']).trim(),
      qty: Math.max(1, Math.trunc(readNumber(l['qty']))),
      amount: readNumber(l['amount']),
      amountFormatted: readString(l['amountFormatted']).trim(),
    })),
    actos: Array.isArray(value['actos']) ? value['actos'].filter((a): a is string => typeof a === 'string') : [],
    motivoSinActos: textoONulo(value['motivoSinActos']),
  };
}

/**
 * La bandeja, o `null` si su forma no se entiende. Las cuentas son de la tienda entera y van las cuatro: una que falta
 * no es un cero, es una respuesta que no se entiende (un `?? 0` afirmaría «no hay»).
 */
function normalizeBandeja(value: unknown): BandejaDeLaTienda | null {
  if (!isRecord(value) || !Array.isArray(value['pedidos']) || !isRecord(value['cuentas'])) {
    return null;
  }
  const cuentasCrudas = value['cuentas'];
  if (!ETAPAS_DEL_DESPACHO.every((e) => typeof cuentasCrudas[e] === 'number')) {
    return null;
  }
  const pedidos = legibles(value['pedidos'], value['pedidos'].map(normalizePedido).filter((p): p is PedidoDeLaTienda => p !== null));
  if (!pedidos) {
    return null;
  }
  return {
    pedidos,
    pagina: Math.max(1, Math.trunc(readNumber(value['pagina']))),
    porPagina: Math.max(1, Math.trunc(readNumber(value['porPagina']))),
    total: Math.max(0, Math.trunc(readNumber(value['total']))),
    cuentas: {
      paid: cuentasCrudas['paid'] as number,
      preparing: cuentasCrudas['preparing'] as number,
      shipped: cuentasCrudas['shipped'] as number,
      delivered: cuentasCrudas['delivered'] as number,
    },
    sinConciliar: Math.max(0, Math.trunc(readNumber(value['sinConciliar']))),
  };
}

function normalizeDestino(value: unknown): DestinoDelEnvio | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    line1: textoONulo(value['line1']),
    line2: textoONulo(value['line2']),
    city: textoONulo(value['city']),
    region: textoONulo(value['region']),
    postalCode: textoONulo(value['postalCode']),
    country: textoONulo(value['country']),
    contact: textoONulo(value['contact']),
  };
}

const MOTIVOS_SIN_ENVIO: readonly MotivoSinEnvio[] = ['sin_direccion', 'sin_envio', 'envio_no_disponible'];

/** El detalle: el pedido, más su envío tal como lo dijo el servidor (o por qué no lo trae). */
function normalizeDetalle(value: unknown): DetalleDelPedido | null {
  const pedido = normalizePedido(value);
  if (!pedido || !isRecord(value)) {
    return null;
  }
  const envio = value['envio'];
  const motivo = value['motivoSinEnvio'];
  return {
    ...pedido,
    envio: isRecord(envio)
      ? {
          destino: normalizeDestino(envio['destino']),
          transportadora: textoONulo(envio['transportadora']),
          estado: textoONulo(envio['estado']),
          eventos: (Array.isArray(envio['eventos']) ? envio['eventos'] : []).filter(isRecord).map(
            (e): EventoDelEnvio => ({ estado: readString(e['estado']).trim(), nota: textoONulo(e['nota']), fecha: readString(e['fecha']).trim() }),
          ),
        }
      : null,
    motivoSinEnvio: (MOTIVOS_SIN_ENVIO as readonly unknown[]).includes(motivo) ? (motivo as MotivoSinEnvio) : null,
  };
}

/**
 * Una devolución de la cola, o `null` si no se entiende: sin `rmaId` o sin un estado exacto no se sabe qué acción le
 * toca, y pintarle una supuesta sería decidir por el servidor.
 */
function normalizeDevolucion(value: unknown): DevolucionDeLaTienda | null {
  if (!isRecord(value)) {
    return null;
  }
  const rmaId = readString(value['rmaId']).trim();
  const estado = value['estado'];
  if (!rmaId || !esEstadoDeDevolucion(estado)) {
    return null;
  }
  const camino = value['camino'];
  return {
    rmaId,
    orderRef: readString(value['orderRef']).trim(),
    orderNumber: textoONulo(value['orderNumber']),
    camino: camino === 'puerta' || camino === 'directa' ? camino : null,
    producto: readString(value['producto']).trim(),
    cantidad: Math.max(0, Math.trunc(readNumber(value['cantidad']))),
    motivo: readString(value['motivo']).trim(),
    monto: readNumber(value['monto']),
    montoFormatted: readString(value['montoFormatted']).trim(),
    moneda: readString(value['moneda']).trim(),
    estado,
    nota: textoONulo(value['nota']),
    solicitada: readString(value['solicitada']).trim(),
    actualizada: readString(value['actualizada']).trim(),
  };
}

function normalizeDevoluciones(value: unknown): readonly DevolucionDeLaTienda[] | null {
  if (!isRecord(value) || !Array.isArray(value['devoluciones'])) {
    return null;
  }
  return legibles(
    value['devoluciones'],
    value['devoluciones'].map(normalizeDevolucion).filter((d): d is DevolucionDeLaTienda => d !== null),
  );
}

const LISTING_STATUSES: readonly SellerListingStatus[] = ['activa', 'pausada', 'agotada'];

function normalizeListings(value: unknown, currency: string): readonly SellerListing[] | null {
  const list = readList(value, 'items');
  if (!list) {
    return null;
  }
  const listings = list
    .map((entry): SellerListing | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim() || readString(entry['sku']).trim();
      const title = readString(entry['title']).trim() || readString(entry['name']).trim();
      if (!id || !title) {
        return null;
      }
      const statusRaw = readString(entry['status']).trim().toLowerCase();
      const stock = Math.max(0, Math.trunc(readNumber(entry['stock'])));
      return {
        id,
        title,
        sku: readString(entry['sku']).trim() || id,
        amount: readNumber(entry['amount'] ?? entry['price']),
        currency: readString(entry['currency']).trim() || currency,
        stock,
        status: (LISTING_STATUSES as readonly string[]).includes(statusRaw)
          ? (statusRaw as SellerListingStatus)
          : stock > 0
            ? 'activa'
            : 'agotada',
        questionsOpen: Math.max(0, Math.trunc(readNumber(entry['questionsOpen']))),
      };
    })
    .filter((listing): listing is SellerListing => listing !== null);
  return legibles(list, listings);
}

const RETURN_STATUSES: readonly SellerReturnStatus[] = [
  'abierto',
  'en-revision',
  'aprobado',
  'rechazado',
];

function normalizeReturnStatus(value: unknown): SellerReturnStatus | null {
  const raw = readString(value).trim().toLowerCase();
  return (RETURN_STATUSES as readonly string[]).includes(raw)
    ? (raw as SellerReturnStatus)
    : null;
}

function normalizeReturns(value: unknown): readonly SellerReturn[] | null {
  const list = readList(value, 'returns');
  if (!list) {
    return null;
  }
  const returns = list
    .map((entry): SellerReturn | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const rmaId = readString(entry['rmaId']).trim() || readString(entry['claimId']).trim();
      if (!rmaId) {
        return null;
      }
      return {
        rmaId,
        orderNumber: readString(entry['orderNumber']).trim(),
        productTitle:
          readString(entry['productTitle']).trim() || readString(entry['title']).trim(),
        reason: readString(entry['reason']).trim(),
        date: readString(entry['date']).trim(),
        status: normalizeReturnStatus(entry['status']) ?? 'abierto',
      };
    })
    .filter((rma): rma is SellerReturn => rma !== null);
  return legibles(list, returns);
}

function normalizePublishReceipt(value: unknown): SellerPublishReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const productId = readString(value['productId']).trim() || readString(value['id']).trim();
  if (!productId) {
    return null;
  }
  return {
    productId,
    status: readString(value['status']).trim() || 'publicado',
  };
}

function normalizeMessage(value: unknown, fallbackFrom: 'buyer' | 'seller'): SellerMessage | null {
  if (!isRecord(value)) {
    return null;
  }
  const body = readString(value['body']).trim() || readString(value['text']).trim();
  if (!body) {
    return null;
  }
  const fromRaw = readString(value['from']).trim().toLowerCase();
  return {
    id: readString(value['id']).trim() || `msg-${Math.random().toString(36).slice(2, 8)}`,
    from: fromRaw === 'buyer' || fromRaw === 'seller' ? fromRaw : fallbackFrom,
    body,
    date: readString(value['date']).trim(),
  };
}

/**
 * Lo que el borde devuelve al responder: el HILO entero (`ThreadDto` del CMS:
 * `{ threadId, messages: [{ messageId, from, body, sentAt }] }`), con la respuesta recién
 * guardada al final. Se toma ESA, con el id que le dio el servidor. Un mensaje suelto en la
 * raíz (`{ id, body, date }`) también se acepta. `from` del borde es un correo, así que la
 * autoría la pone quien la mandó: es la respuesta del vendedor.
 */
function normalizeReply(value: unknown): SellerMessage | null {
  if (!isRecord(value) || !Array.isArray(value['messages'])) {
    return normalizeMessage(value, 'seller');
  }
  const last = value['messages'].at(-1);
  if (!isRecord(last)) {
    return null;
  }
  const id = readString(last['messageId']).trim() || readString(last['id']).trim();
  const body = readString(last['body']).trim();
  if (!id || !body) {
    return null;
  }
  return {
    id,
    from: 'seller',
    body,
    date: (readString(last['sentAt']).trim() || readString(last['date']).trim()).slice(0, 10),
  };
}

function normalizeThreads(value: unknown): readonly SellerThread[] | null {
  const list = readList(value, 'threads');
  if (!list) {
    return null;
  }
  const threads = list
    .map((entry): SellerThread | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim();
      const subject = readString(entry['subject']).trim();
      if (!id || !subject) {
        return null;
      }
      const rawMessages = Array.isArray(entry['messages']) ? entry['messages'] : [];
      let messages = rawMessages
        .map((message) => normalizeMessage(message, 'buyer'))
        .filter((message): message is SellerMessage => message !== null);
      // Buyer-side thread shape only carries `lastMessage` — surface it as one message.
      const lastMessage = readString(entry['lastMessage']).trim();
      if (messages.length === 0 && lastMessage) {
        messages = [
          {
            id: `${id}-last`,
            from: 'buyer',
            body: lastMessage,
            date: readString(entry['date']).trim(),
          },
        ];
      }
      return {
        id,
        subject,
        counterpart:
          readString(entry['counterpart']).trim() || readString(entry['buyer']).trim(),
        date: readString(entry['date']).trim(),
        unread: readBoolean(entry['unread']),
        messages,
      };
    })
    .filter((thread): thread is SellerThread => thread !== null);
  return legibles(list, threads);
}

// ─── Muestras: sólo con MUESTRAS_DE_LA_CONSOLA, y con su cartel ────────────────

function mockSummary(): SellerSummary {
  return {
    kpis: [
      {
        id: 'ventas',
        label: 'Ventas del mes',
        value: 48_350_000,
        unit: 'currency',
        delta: 12,
        hint: 'vs. mes anterior',
      },
      { id: 'ordenes', label: 'Órdenes', value: 138, unit: 'count', delta: 8, hint: 'este mes' },
      {
        id: 'reputacion',
        label: 'Reputación',
        value: 4.8,
        unit: 'rating',
        delta: 0,
        hint: 'promedio 90 días',
      },
      {
        id: 'preguntas',
        label: 'Preguntas sin responder',
        value: 3,
        unit: 'count',
        delta: -2,
        hint: 'últimas 24 h',
      },
    ],
    reputation: {
      score: 4.8,
      level: 'Vendedor destacado',
      onTimeRate: 97,
      claimRate: 1.2,
      responseRate: 92,
    },
  };
}

function mockOrders(currency: string): readonly SellerOrder[] {
  return [
    {
      orderNumber: 'ORD-2026-00521',
      date: '2026-07-02',
      buyer: 'María G.',
      status: 'paid',
      total: 1_499_000,
      currency,
      items: [{ title: 'Audífonos Sony WH-1000XM5', qty: 1, amount: 1_499_000 }],
    },
    {
      orderNumber: 'ORD-2026-00518',
      date: '2026-07-01',
      buyer: 'Carlos R.',
      status: 'preparing',
      total: 778_000,
      currency,
      items: [{ title: 'Mouse Logitech MX Master 3S', qty: 2, amount: 389_000 }],
    },
    {
      orderNumber: 'ORD-2026-00512',
      date: '2026-06-28',
      buyer: 'Andrea P.',
      status: 'shipped',
      total: 389_000,
      currency,
      items: [{ title: 'Mouse Logitech MX Master 3S', qty: 1, amount: 389_000 }],
    },
    {
      orderNumber: 'ORD-2026-00481',
      date: '2026-06-10',
      buyer: 'Julián T.',
      status: 'delivered',
      total: 1_888_000,
      currency,
      items: [{ title: 'Audífonos Sony WH-1000XM5', qty: 1, amount: 1_499_000 }],
    },
  ];
}

/** Los pedidos de ejemplo como los pinta la bandeja: los de {@link mockOrders}, en pesos. */
function mockPedidos(): readonly PedidoDeLaTienda[] {
  return mockOrders('COP').map((o, i): PedidoDeLaTienda => ({
    orderRef: `muestra-${o.orderNumber}`,
    orderNumber: o.orderNumber,
    fecha: `${o.date}T15:00:00Z`,
    comprador: o.buyer,
    camino: i % 2 === 0 ? 'puerta' : 'directa',
    etapa: o.status === 'preparing' || o.status === 'shipped' || o.status === 'delivered' ? o.status : 'paid',
    total: o.total,
    totalFormatted: formatearImporte(o.total, o.currency),
    moneda: o.currency,
    lineas: o.items.map((l) => ({
      title: l.title,
      qty: l.qty,
      amount: l.amount * l.qty,
      amountFormatted: formatearImporte(l.amount * l.qty, o.currency),
    })),
    actos: [],
    motivoSinActos: null,
  }));
}

function mockBandeja(etapa: EtapaDelDespacho | null): BandejaDeLaTienda {
  const todos = mockPedidos();
  const pedidos = etapa ? todos.filter((p) => p.etapa === etapa) : todos;
  const cuenta = (e: EtapaDelDespacho): number => todos.filter((p) => p.etapa === e).length;
  return {
    pedidos,
    pagina: 1,
    porPagina: 50,
    total: pedidos.length,
    cuentas: { paid: cuenta('paid'), preparing: cuenta('preparing'), shipped: cuenta('shipped'), delivered: cuenta('delivered') },
    sinConciliar: 0,
  };
}

/** La cola de ejemplo: sólo con la marca de la demo, y una por estado para que se vean sus acciones. */
function mockDevoluciones(): readonly DevolucionDeLaTienda[] {
  // Del primer pedido de ejemplo: su moneda y el importe de su línea, sin escribir una moneda aquí.
  const pedido = mockPedidos()[0];
  const linea = pedido.lineas[0];
  const base = {
    orderRef: pedido.orderRef,
    orderNumber: pedido.orderNumber,
    camino: pedido.camino,
    cantidad: 1,
    monto: linea.amount,
    montoFormatted: linea.amountFormatted,
    moneda: pedido.moneda,
    nota: null,
    solicitada: pedido.fecha,
    actualizada: pedido.fecha,
  };
  return [
    { ...base, rmaId: 'demo-rma-1', producto: 'Audífonos inalámbricos', motivo: 'No encienden', estado: 'Requested' },
    { ...base, rmaId: 'demo-rma-2', producto: 'Funda de silicona', motivo: 'Color equivocado', estado: 'Received' },
    { ...base, rmaId: 'demo-rma-3', producto: 'Cargador USB-C', motivo: 'Llegó roto', estado: 'Approved' },
  ];
}

function mockDetalle(orderRef: string): DetalleDelPedido {
  const pedido = mockPedidos().find((p) => p.orderRef === orderRef) ?? mockPedidos()[0];
  return {
    ...pedido,
    envio: {
      destino: { line1: 'Calle 93 # 11-26', line2: null, city: 'Bogotá', region: 'Cundinamarca', postalCode: null, country: 'CO', contact: pedido.comprador },
      transportadora: 'servientrega',
      estado: 'Ready',
      eventos: [{ estado: 'Ready', nota: null, fecha: pedido.fecha }],
    },
    motivoSinEnvio: null,
  };
}

function mockListings(currency: string): readonly SellerListing[] {
  return [
    {
      id: 'PMOCK-1',
      title: 'Audífonos Sony WH-1000XM5',
      sku: 'SONY-XM5-BLK',
      amount: 1_499_000,
      currency,
      stock: 12,
      status: 'activa',
      questionsOpen: 2,
    },
    {
      id: 'PMOCK-3',
      title: 'Mouse Logitech MX Master 3S',
      sku: 'LOGI-MX3S',
      amount: 389_000,
      currency,
      stock: 34,
      status: 'activa',
      questionsOpen: 1,
    },
    {
      id: 'PMOCK-6',
      title: 'Parlante Sony SRS-XB23',
      sku: 'SONY-XB23',
      amount: 329_000,
      currency,
      stock: 0,
      status: 'agotada',
      questionsOpen: 0,
    },
    {
      id: 'PMOCK-9',
      title: 'Teclado mecánico compacto 65%',
      sku: 'KEYB-65',
      amount: 259_000,
      currency,
      stock: 8,
      status: 'pausada',
      questionsOpen: 0,
    },
  ];
}

function mockReturns(): readonly SellerReturn[] {
  return [
    {
      rmaId: 'RMA-2026-0043',
      orderNumber: 'ORD-2026-00481',
      productTitle: 'Audífonos Sony WH-1000XM5',
      reason: 'Producto llegó con el estuche rayado',
      date: '2026-06-30',
      status: 'abierto',
    },
    {
      rmaId: 'RMA-2026-0041',
      orderNumber: 'ORD-2026-00470',
      productTitle: 'Mouse Logitech MX Master 3S',
      reason: 'No era el color esperado',
      date: '2026-06-26',
      status: 'en-revision',
    },
    {
      rmaId: 'RMA-2026-0038',
      orderNumber: 'ORD-2026-00455',
      productTitle: 'Parlante Sony SRS-XB23',
      reason: 'Defecto de fábrica en el botón de encendido',
      date: '2026-06-20',
      status: 'aprobado',
    },
  ];
}

function mockThreads(): readonly SellerThread[] {
  return [
    {
      id: 'th-1',
      subject: 'Consulta sobre garantía · Audífonos Sony WH-1000XM5',
      counterpart: 'María G.',
      date: '2026-07-03',
      unread: true,
      messages: [
        {
          id: 'th-1-m1',
          from: 'buyer',
          body: '¿Tiene garantía oficial en Colombia?',
          date: '2026-07-03',
        },
      ],
    },
    {
      id: 'th-2',
      subject: 'Pedido ORD-2026-00512',
      counterpart: 'Andrea P.',
      date: '2026-06-29',
      unread: false,
      messages: [
        {
          id: 'th-2-m1',
          from: 'buyer',
          body: '¿Cuándo despachan mi pedido?',
          date: '2026-06-28',
        },
        {
          id: 'th-2-m2',
          from: 'seller',
          body: 'Tu pedido salió de bodega, llega mañana.',
          date: '2026-06-29',
        },
      ],
    },
    {
      id: 'th-3',
      subject: 'Pregunta · Mouse Logitech MX Master 3S',
      counterpart: 'Julián T.',
      date: '2026-06-27',
      unread: true,
      messages: [
        {
          id: 'th-3-m1',
          from: 'buyer',
          body: '¿Sirve para Mac y Windows a la vez?',
          date: '2026-06-27',
        },
      ],
    },
  ];
}
