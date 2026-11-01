import { Injectable, computed, inject, signal } from '@angular/core';
import { ConfiguracionDeLaTienda } from '../comun/configuracion';
import { TEXTOS_DE_LA_TIENDA } from '../comun/textos';
import { DevolucionesApi } from '../devoluciones/devoluciones-api.client';
import type { ReturnAdvance, ReturnCase, ReturnStatus } from '../devoluciones/devoluciones.model';
import { EscritorioApi } from './escritorio-api.client';
import type { SellerDeskResult, SellerOrder, ShopModerationItem } from './escritorio.model';

/**
 * El orden de la cola de devoluciones (#32).
 *
 * Lo que espera al vendedor va arriba; lo cerrado, abajo. Ordenar por fecha
 * dejaría un reclamo sin abrir debajo de tres ya resueltos.
 */
const RETURN_QUEUE_ORDER: Readonly<Record<ReturnStatus, number>> = {
  abierto: 0,
  'en-revision': 1,
  resuelto: 2,
  rechazado: 3,
};

/**
 * El escritorio del vendedor dentro de la tienda (#32; 014-despiece-tienda, T008): lo que tiene por atender, y mover
 * un reclamo o decidir sobre una opinión con lo que contesta el servidor, nunca con lo que se pulsó.
 */
@Injectable()
export class EscritorioDeLaTienda {
  readonly #api = inject(EscritorioApi);
  readonly #devoluciones = inject(DevolucionesApi);
  readonly #config = inject(ConfiguracionDeLaTienda);
  readonly #textos = inject(TEXTOS_DE_LA_TIENDA);

  readonly desk = signal<SellerDeskResult | null>(null);
  readonly deskLoaded = signal(false);
  readonly deskBusyId = signal<string | null>(null);
  readonly deskNotice = signal('');
  readonly deskFailed = signal(false);

  async loadDesk(): Promise<void> {
    if (this.deskLoaded()) {
      return;
    }
    this.desk.set(await this.#api.sellerDesk(this.#config.apiBase()));
    this.deskLoaded.set(true);
  }

  readonly sellerOrders = computed<readonly SellerOrder[]>(() => this.desk()?.orders ?? []);

  /**
   * La cola de devoluciones, con **las que esperan al vendedor primero**.
   *
   * `abierto` es «nadie la ha mirado» y `en-revision` ya está en marcha; lo
   * resuelto y lo rechazado son historia y van al final. Ordenar por fecha
   * dejaría un reclamo sin abrir debajo de tres ya cerrados.
   */
  readonly sellerReturns = computed<readonly ReturnCase[]>(() =>
    [...(this.desk()?.returns ?? [])].sort(
      (a, b) => RETURN_QUEUE_ORDER[a.status] - RETURN_QUEUE_ORDER[b.status],
    ),
  );

  /** Las reportadas primero, y entre ellas la más reportada. Igual que en #31. */
  readonly sellerModeration = computed<readonly ShopModerationItem[]>(() =>
    [...(this.desk()?.moderation ?? [])].sort((a, b) => {
      if (a.reason !== b.reason) {
        return a.reason === 'reported' ? -1 : 1;
      }
      return b.reportCount - a.reportCount;
    }),
  );

  readonly openReturnCount = computed(
    () =>
      this.sellerReturns().filter((c) => c.status === 'abierto' || c.status === 'en-revision')
        .length,
  );

  /**
   * El vendedor mueve un reclamo.
   *
   * **El estado se actualiza sólo con lo que devuelve el servidor**, nunca con lo
   * que se pulsó: `refunded` dispara un reembolso de verdad, así que pintar
   * «Resuelto» sobre un POST que falló diría que se devolvió una plata que sigue
   * donde estaba. Y el borde explica la transición ilegal en `{ error }` —«no se
   * puede pasar de rechazado a recibido»—, así que esa frase se enseña tal cual.
   */
  async advanceReturn(claimId: string, status: ReturnAdvance): Promise<void> {
    if (this.deskBusyId() !== null) {
      return;
    }
    this.deskBusyId.set(claimId);
    this.deskFailed.set(false);
    this.deskNotice.set('');

    const result = await this.#devoluciones.advanceReturn(this.#config.apiBase(), claimId, status);
    this.deskBusyId.set(null);

    if (result.ok) {
      this.desk.update((desk) =>
        desk
          ? {
              ...desk,
              returns: desk.returns.map((c) => (c.claimId === claimId ? result.claim : c)),
            }
          : desk,
      );
      this.deskNotice.set(this.#textos.reclamoMovido(result.claim));
      return;
    }

    this.deskFailed.set(true);
    this.deskNotice.set(result.detail || this.#textos.reclamoNoMovido[result.reason]);
  }

  /** La cola de opiniones, con el mismo criterio que Educación (#31). */
  async decideSellerReview(reviewId: string, decision: 'approve' | 'reject'): Promise<void> {
    if (this.deskBusyId() !== null) {
      return;
    }
    this.deskBusyId.set(reviewId);
    this.deskFailed.set(false);
    this.deskNotice.set('');

    const result = await this.#api.decideShopModeration(this.#config.apiBase(), reviewId, decision);
    this.deskBusyId.set(null);

    // `already-decided` sale de la cola igual: otra persona la atendió.
    if (result.ok || result.reason === 'already-decided') {
      this.desk.update((desk) =>
        desk
          ? { ...desk, moderation: desk.moderation.filter((item) => item.id !== reviewId) }
          : desk,
      );
      this.deskNotice.set(
        result.ok
          ? decision === 'approve'
            ? this.#textos.opinionAprobada
            : this.#textos.opinionRechazada
          : this.#textos.opinionYaAtendida,
      );
      return;
    }

    this.deskFailed.set(true);
    this.deskNotice.set(
      result.reason === 'forbidden' ? this.#textos.opinionAjena : this.#textos.opinionNoGuardada,
    );
  }
}
