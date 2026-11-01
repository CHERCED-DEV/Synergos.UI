import { inject, Injectable, signal } from '@angular/core';
import {
  type DevolucionDeLaTienda,
  DevolucionesDelPersonalApi,
  type MovimientoDeLaDevolucion,
  type ResultadoDelMovimiento,
} from '@synergos/dominio/tienda';
import { t } from '@synergos/vitals-core';
import { EstadoDeLaConsola } from './estado-de-la-consola';
import { PresentacionDeLaConsola } from './presentacion';

/** Mover una devolución de la cola y confirmar un reembolso antes de mandarlo, con lo que contesta el servidor. (014-despiece-tienda, T011) */
@Injectable()
export class ReembolsosDeLaConsola {
  readonly #devolucionesApi = inject(DevolucionesDelPersonalApi);
  readonly #estado = inject(EstadoDeLaConsola);
  readonly #presentacion = inject(PresentacionDeLaConsola);

  /** La devolución que se está moviendo. */
  readonly devolucionEnVuelo = signal<string | null>(null);

  /** La devolución que se va a reembolsar, esperando que se confirme. */
  readonly reembolsoAbierto = signal<DevolucionDeLaTienda | null>(null);

  /**
   * Mueve una devolución (T025). Una a la vez: mientras vuela, su fila no ofrece otra acción y un segundo clic no sale.
   * La cola se vuelve a leer sólo con la respuesta del servidor; si no se movió (#77) —un reembolso que no salió, por
   * ejemplo—, sigue donde estaba y el aviso dice el motivo del servidor y en qué estado sigue.
   */
  async moverDevolucion(devolucion: DevolucionDeLaTienda, movimiento: MovimientoDeLaDevolucion): Promise<void> {
    if (this.devolucionEnVuelo() !== null) {
      return;
    }
    this.devolucionEnVuelo.set(devolucion.rmaId);
    this.#estado.actionError.set(null);
    try {
      const resultado = await this.#devolucionesApi.moverDevolucion(this.#estado.apiBase(), devolucion.rmaId, movimiento);
      if (!resultado.hecho) {
        if (resultado.por === 'sin-sesion' || resultado.por === 'sin-permiso') {
          this.#estado.marcar('devoluciones', resultado.por);
          return;
        }
        this.#estado.actionError.set(this.textoDeLaDevolucionQueNoSeMovio(devolucion, resultado));
        return;
      }
      this.reembolsoAbierto.set(null);
      this.#estado.marcar('devoluciones', 'sin-cargar');
      await this.#estado.loadReturns();
    } finally {
      this.devolucionEnVuelo.set(null);
    }
  }

  /** Reembolsar mueve plata: pide confirmarlo antes. */
  abrirReembolso(devolucion: DevolucionDeLaTienda): void {
    this.reembolsoAbierto.set(devolucion);
  }

  cerrarReembolso(): void {
    this.reembolsoAbierto.set(null);
  }

  /** Por qué una devolución no se movió, con el estado en que sigue. */
  textoDeLaDevolucionQueNoSeMovio(
    devolucion: DevolucionDeLaTienda,
    resultado: Extract<ResultadoDelMovimiento, { readonly hecho: false }>,
  ): string {
    const motivo =
      resultado.por === 'caida'
        ? t('Seller.Operaciones.TryAgain', 'No pudimos hacerlo ahora y nada cambió: vuelve a intentarlo.')
        : (resultado.motivo ?? t('Seller.Operaciones.ReturnFailed', 'No pudimos mover la devolución {rma}.', { rma: devolucion.rmaId }));
    const sigueEn = t('Seller.Operaciones.ReturnStillIn', 'La devolución sigue en «{estado}».', {
      estado: this.#presentacion.textoEstadosDeDevolucion[devolucion.estado],
    });
    return `${motivo} ${sigueEn}`;
  }
}
