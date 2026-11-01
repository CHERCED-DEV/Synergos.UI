import { inject, Injectable, signal } from '@angular/core';
import {
  type ActoDelDespacho,
  BandejaDelPersonalApi,
  type DetalleDelPedido,
  GUIA_MAXIMA,
  type LecturaDeLaConsola,
  type PedidoDeLaTienda,
  type ResultadoDelActo,
} from '@synergos/dominio/tienda';
import { type ConsoleRowAction } from '@synergos/shells';
import { t } from '@synergos/vitals-core';
import { type EstadoDeLectura } from './comun-de-la-consola';
import { EstadoDeLaConsola } from './estado-de-la-consola';
import { PresentacionDeLaConsola } from './presentacion';

/** El detalle abierto: el pedido de la fila, cómo va su lectura y lo que trajo. */
interface DetalleAbierto {
  readonly pedido: PedidoDeLaTienda;
  readonly estado: EstadoDeLectura;
  readonly datos: DetalleDelPedido | null;
}

/** El despacho de un pedido de la bandeja: su detalle, la guía del envío y los actos del personal, con lo que contesta el servidor. (014-despiece-tienda, T011) */
@Injectable()
export class DespachoDeLaConsola {
  readonly #bandeja = inject(BandejaDelPersonalApi);
  readonly #estado = inject(EstadoDeLaConsola);
  readonly #presentacion = inject(PresentacionDeLaConsola);

  /** El pedido cuyo detalle está abierto, y cómo va su lectura. */
  readonly detalle = signal<DetalleAbierto | null>(null);

  /** Lo que ocupa el lugar del acto mientras vuela: no hace nada, y el acto no se puede pedir dos veces. */
  readonly accionEnVuelo: ConsoleRowAction = { id: 'acto-en-vuelo', label: t('Seller.Operaciones.ActInFlight', 'Guardando…') };

  /** El pedido cuyo acto está en vuelo. */
  readonly actoEnVuelo = signal<string | null>(null);

  /** El pedido que se va a marcar enviado, con su guía a medio escribir. */
  readonly envioAbierto = signal<PedidoDeLaTienda | null>(null);

  readonly guia = signal('');

  /** Marcar enviado pide antes la guía, que es opcional: abre su formulario. */
  abrirEnvio(pedido: PedidoDeLaTienda): void {
    this.guia.set('');
    this.envioAbierto.set(pedido);
  }

  cerrarEnvio(): void {
    this.envioAbierto.set(null);
    this.guia.set('');
  }

  /**
   * Da un acto sobre un pedido (T021). Uno a la vez: mientras vuela, el acto de esa fila no se puede pedir otra vez, y un
   * segundo clic no sale. La fila se mueve sólo con la respuesta del servidor; si no se hizo (#77), sigue donde estaba y
   * el aviso dice por qué y en qué etapa sigue.
   */
  async actuar(pedido: PedidoDeLaTienda, acto: ActoDelDespacho, guia?: string): Promise<void> {
    if (this.actoEnVuelo() !== null) {
      return;
    }
    const escrita = guia?.trim() ?? '';
    if (escrita.length > GUIA_MAXIMA || /[\r\n]/.test(escrita)) {
      this.#estado.actionError.set(this.#presentacion.textoGuiaInvalida);
      return;
    }
    this.actoEnVuelo.set(pedido.orderRef);
    this.#estado.actionError.set(null);
    try {
      const resultado = await this.#bandeja.avanzar(this.#estado.apiBase(), pedido.orderRef, acto, escrita || undefined);
      if (!resultado.hecho) {
        if (resultado.por === 'sin-sesion' || resultado.por === 'sin-permiso') {
          this.#estado.marcar('ventas', resultado.por);
          return;
        }
        this.#estado.actionError.set(this.textoDelActoQueNoSalio(pedido, resultado));
        return;
      }
      this.cerrarEnvio();
      // La fila se mueve con lo que diga el servidor: se vuelve a leer la bandeja, con su etapa y sus actos nuevos.
      await this.#estado.loadOrders();
    } finally {
      this.actoEnVuelo.set(null);
    }
  }

  /** Por qué un acto no salió, con la etapa en que sigue el pedido. */
  textoDelActoQueNoSalio(
    pedido: PedidoDeLaTienda,
    resultado: Extract<ResultadoDelActo, { readonly hecho: false }>,
  ): string {
    const sigueEn = t('Seller.Operaciones.StillIn', 'El pedido sigue en «{etapa}».', {
      etapa: this.#presentacion.textoEtapas[resultado.etapa ?? pedido.etapa],
    });
    return `${this.motivoDelActo(pedido, resultado)} ${sigueEn}`;
  }

  /** El motivo, por el código del servidor (los de `contracts/puerta-vendedor.md` de 013). */
  motivoDelActo(pedido: PedidoDeLaTienda, resultado: Extract<ResultadoDelActo, { readonly hecho: false }>): string {
    if (resultado.por === 'caida') {
      return t('Seller.Operaciones.TryAgain', 'No pudimos hacerlo ahora y nada cambió: vuelve a intentarlo.');
    }
    switch (resultado.codigo) {
      case 'flow.original_no_encontrada':
      case 'flow.original_no_completada':
      case 'flow.original_sin_dato':
      case 'fulfillment.shipment_not_found':
        return t('Seller.Operaciones.CantDispatch', 'Este pedido no se puede despachar desde la consola.');
      case 'fulfillment.transition_not_allowed':
        return t('Seller.Operaciones.ShipFirst', 'Primero márcalo enviado.');
      case 'fulfillment.shipment_closed':
        return t('Seller.Operaciones.ShipmentClosed', 'El envío ya terminó.');
      case 'tienda.despacho_no_disponible':
        return this.#presentacion.textoDespachoNoDisponible;
      case 'tienda.acto_fuera_de_orden':
        return t('Seller.Operaciones.OutOfOrder', 'Ese paso ya no le toca a este pedido.');
      case 'tienda.guia_invalida':
        return this.#presentacion.textoGuiaInvalida;
      default:
        return t('Seller.Operaciones.ActFailed', 'No pudimos mover el pedido {numero}.', { numero: pedido.orderNumber });
    }
  }

  // ─── El detalle de un pedido (013-seller-operaciones, T012) ────────────────
  /** Abre el detalle de un pedido: su envío, a dónde va y con quién. Reabrirlo es «Reintentar». */
  async abrirDetalle(pedido: PedidoDeLaTienda): Promise<void> {
    this.detalle.set({ pedido, estado: 'cargando', datos: null });
    let resultado: LecturaDeLaConsola<DetalleDelPedido>;
    try {
      resultado = await this.#bandeja.pedido(this.#estado.apiBase(), pedido.orderRef);
    } catch {
      resultado = { tipo: 'caida' };
    }
    if (this.detalle()?.pedido.orderRef !== pedido.orderRef) {
      return; // mientras volaba se abrió otro, o se cerró
    }
    if (resultado.tipo === 'sin-sesion' || resultado.tipo === 'sin-permiso') {
      this.#estado.marcar('ventas', resultado.tipo);
    }
    this.detalle.set({
      pedido,
      estado: resultado.tipo,
      datos: resultado.tipo === 'leidas' || resultado.tipo === 'vacia' || resultado.tipo === 'muestras' ? resultado.datos : null,
    });
  }

  cerrarDetalle(): void {
    this.detalle.set(null);
  }
}
