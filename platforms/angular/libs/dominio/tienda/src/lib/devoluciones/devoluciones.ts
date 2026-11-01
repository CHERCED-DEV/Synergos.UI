import { Injectable, inject, signal } from '@angular/core';
import { ConfiguracionDeLaTienda } from '../comun/configuracion';
import { TEXTOS_DE_LA_TIENDA } from '../comun/textos';
import type { OrderLine, ShopOrder } from '../pedidos/pedidos.model';
import { DevolucionesApi } from './devoluciones-api.client';
import type { ReturnCase, ReturnReason } from './devoluciones.model';

/** Lo que el comprador está a punto de mandar. */
export interface BorradorDeDevolucion {
  readonly orderRef: string;
  /** Con lo que el servidor busca el pedido; `orderRef` es la clave de la pantalla (el número). */
  readonly apiRef: string;
  readonly line: OrderLine;
  readonly reason: ReturnReason;
}

/**
 * La línea, tal como la nombra el borde: `productId` o `productId/variantId`
 * (`StubReturnService:163`). Se compone acá porque el `lineId` que se manda tiene
 * que poder cruzarse con el `lineRef` que vuelve.
 */
export function lineRefOf(line: OrderLine): string {
  return line.variantId ? `${line.productId}/${line.variantId}` : line.productId;
}

/**
 * Las devoluciones de quien compró (014-despiece-tienda, T008): los reclamos de cada pedido, leídos del servidor, y el
 * que está a punto de pedir.
 */
@Injectable()
export class DevolucionesDeLaTienda {
  readonly #api = inject(DevolucionesApi);
  readonly #config = inject(ConfiguracionDeLaTienda);
  readonly #textos = inject(TEXTOS_DE_LA_TIENDA);

  /**
   * Los reclamos por pedido, **leídos del servidor** (#32).
   *
   * Antes sólo lo escribía `startReturn` y nunca se cargaba, así que al recargar
   * la página el reclamo desaparecía, «Iniciar devolución» volvía a aparecer y el
   * comprador abría un SEGUNDO reclamo sobre el mismo pedido. El
   * `GET /order/{ref}/return` existía desde siempre y no lo llamaba nadie.
   */
  readonly returnsByRef = signal<Readonly<Record<string, readonly ReturnCase[]>>>({});
  /** Los pedidos cuyos reclamos SÍ se pudieron leer. Ver `canReturn`. */
  readonly returnsLoaded = signal<ReadonlySet<string>>(new Set<string>());
  readonly returnDraft = signal<BorradorDeDevolucion | null>(null);
  readonly returnSending = signal(false);
  readonly returnError = signal('');

  /**
   * Si se puede pedir la devolución de esta línea.
   *
   * **La autorización la da el SERVIDOR** (`line.canReturn`, #34), con el mismo
   * gate que aplica el POST — el principio de `canReview` (ADR 0112). Esto lo
   * deducía de `order.status` pidiendo `delivered || shipped`, estados que el
   * dominio **no emite** —el enum tiene `Pending`, `Paid`, `Cancelled`—, así que
   * el botón era inalcanzable contra un servidor real (#33). La copia no se
   * desvió por descuido: se desvió porque era una copia.
   *
   * Lo único que queda de este lado es lo que el servidor no sabe de esta pantalla: **si ya se leyeron los
   * reclamos** —con la lectura caída, un mapa vacío se leería como «no hay ninguno» y ofrecería abrir un segundo
   * sobre la misma línea (#32)—.
   *
   * **El seguimiento ya no decide** (004-tienda-compra, etapa 3). Refinaba con «todavía no llegó», pero nadie avanza
   * el envío (el efecto «seguimiento del envío» está diferido, es del vendedor) y el seguimiento no pasa de «pagado»:
   * «Pedir devolución» no se ofrecía nunca, en ninguno de los dos caminos, aunque el servidor dijera `canReturn`.
   */
  canReturnLine(order: ShopOrder, line: OrderLine): boolean {
    return (
      line.canReturn &&
      this.returnsLoaded().has(order.orderNumber) &&
      this.claimForLine(order.orderNumber, line) === null
    );
  }

  /** Si todavía no se sabe si este pedido tiene reclamos. */
  returnsUnknown(order: ShopOrder): boolean {
    return !this.returnsLoaded().has(order.orderNumber);
  }

  /** Los reclamos de un pedido, tal como los devolvió el servidor. */
  returnsFor(orderRef: string): readonly ReturnCase[] {
    return this.returnsByRef()[orderRef] ?? [];
  }

  /** Si esta línea ya tiene un reclamo vivo. Un rechazo NO cuenta: se puede reabrir. */
  claimForLine(orderRef: string, line: OrderLine): ReturnCase | null {
    const lineRef = lineRefOf(line);
    return (
      this.returnsFor(orderRef).find(
        (claim) => claim.lineRef === lineRef && claim.status !== 'rechazado',
      ) ?? null
    );
  }

  /**
   * Abre el formulario de devolución de UNA línea.
   *
   * Es por línea y no por pedido porque **el reclamo es por línea**: el borde
   * guarda `LineRef`, `ProductName`, `Quantity` y `RefundAmount`, y devolver «el
   * pedido» de tres artículos cuando llegó uno roto no es lo que nadie quiere.
   *
   * `orders` son los de «Mis compras»: de ahí sale la referencia con la que el servidor busca el pedido.
   */
  openReturn(orderRef: string, line: OrderLine, orders: readonly ShopOrder[]): void {
    const apiRef = orders.find((order) => order.orderNumber === orderRef)?.orderRef ?? orderRef;
    this.returnDraft.set({ orderRef, apiRef, line, reason: 'damaged' });
    this.returnError.set('');
  }

  closeReturn(): void {
    this.returnDraft.set(null);
    this.returnError.set('');
  }

  setReturnReason(reason: ReturnReason): void {
    this.returnDraft.update((draft) => (draft ? { ...draft, reason } : draft));
  }

  /**
   * Pide la devolución.
   *
   * **No se da por abierta si el servidor no lo confirmó** — el cliente inventaba
   * un `claimId` y la pantalla decía «Reclamo abierto», así que el comprador se
   * iba con un número que no existe en ninguna parte (#32). Y como el borde
   * explica el rechazo en `{ error }` («solo se puede devolver sobre una orden
   * pagada»), esa frase se enseña tal cual: la escribió quien sabe por qué.
   */
  async submitReturn(): Promise<void> {
    const draft = this.returnDraft();
    if (!draft || this.returnSending()) {
      return;
    }
    this.returnSending.set(true);
    this.returnError.set('');

    const result = await this.#api.requestReturn(
      this.#config.apiBase(),
      draft.apiRef,
      lineRefOf(draft.line),
      draft.reason,
    );
    this.returnSending.set(false);

    if (result.ok) {
      this.returnsByRef.update((map) => ({
        ...map,
        [draft.orderRef]: [
          ...(map[draft.orderRef] ?? []).filter((c) => c.claimId !== result.claim.claimId),
          result.claim,
        ],
      }));
      this.returnDraft.set(null);
      return;
    }

    this.returnError.set(result.detail || this.#textos.devolucionNoAbierta[result.reason]);
  }

  /**
   * Carga los reclamos de cada pedido.
   *
   * Va pedido a pedido porque el borde lo expone así (`GET /order/{ref}/return`).
   * **El pedido cuya lectura falla NO se marca como cargado**, así que su botón
   * no se ofrece en vez de ofrecerse sobre un estado que no se conoce.
   */
  async loadReturns(orders: readonly ShopOrder[]): Promise<void> {
    const resultados = await Promise.all(
      orders.map(async (order) => ({
        ref: order.orderNumber,
        claims: await this.#api.orderReturns(this.#config.apiBase(), order.orderRef),
      })),
    );
    const mapa: Record<string, readonly ReturnCase[]> = { ...this.returnsByRef() };
    const cargados = new Set(this.returnsLoaded());
    for (const { ref, claims } of resultados) {
      if (claims === null) {
        continue;
      }
      mapa[ref] = claims;
      cargados.add(ref);
    }
    this.returnsByRef.set(mapa);
    this.returnsLoaded.set(cargados);
  }
}
