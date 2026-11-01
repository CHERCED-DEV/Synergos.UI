import { inject, Injectable } from '@angular/core';
import {
  type ActoDelDespacho,
  type DestinoDelEnvio,
  type DetalleDelPedido,
  type DevolucionDeLaTienda,
  type EstadoDeLaDevolucion,
  type EtapaDelDespacho,
  ETAPAS_DEL_DESPACHO,
  GUIA_MAXIMA,
  type MovimientoDeLaDevolucion,
  type PedidoDeLaTienda,
  type SellerKpiMetric,
  type SellerListing,
  type SellerReturn,
} from '@synergos/dominio/tienda';
import { type StatusTagTone } from '@synergos/shared';
import { type ConsoleFilter, type ConsoleRowAction } from '@synergos/shells';
import { formatearImporte, t } from '@synergos/vitals-core';
import { momentoDeLaConsola } from '../fechas-de-la-consola';
import { PREFIJO_DE_LA_DEVOLUCION, PREFIJO_DEL_ACTO } from './comun-de-la-consola';
import { EstadoDeLaConsola } from './estado-de-la-consola';

/** Lo que dice y cómo pinta la consola: sus textos del diccionario (sección `Seller`), los formatos y las etiquetas de cada estado. (014-despiece-tienda, T011) */
@Injectable()
export class PresentacionDeLaConsola {
  readonly #estado = inject(EstadoDeLaConsola);

  /** Los textos de la consola, de la sección `Seller.Operaciones` del diccionario (ADR 0136). */
  readonly textoSinSesion = t('Seller.Operaciones.SignIn', 'Inicia sesión para atender la tienda.');

  readonly textoIniciarSesion = t('Seller.Operaciones.SignInAction', 'Iniciar sesión');

  readonly textoSinPermiso = t('Seller.Operaciones.StaffOnly', 'Esta consola es del personal de la tienda.');

  readonly textoCaida = t('Seller.Operaciones.LoadFailed', 'No pudimos cargar esta sección.');

  readonly textoReintentar = t('Seller.Operaciones.Retry', 'Reintentar');

  readonly textoDeMuestras = t('Seller.Operaciones.Samples', 'Estás viendo datos de ejemplo, no los de la tienda.');

  readonly textoBandejaVacia = t('Seller.Operaciones.OrdersEmpty', 'No hay pedidos pagados en esta etapa.');

  readonly textoVerDetalle = t('Seller.Operaciones.ViewDetail', 'Ver detalle');

  readonly textoDestino = t('Seller.Operaciones.Destination', 'Destino');

  readonly textoTransportadora = t('Seller.Operaciones.Carrier', 'Transportadora');

  readonly textoCerrar = t('Seller.Operaciones.Close', 'Cerrar');

  readonly textoCargando = t('Seller.Operaciones.Loading', 'Cargando…');

  readonly textoSinDireccion = t('Seller.Operaciones.NoAddress', 'Este pedido no tiene una dirección registrada.');

  readonly textoSinEnvio = t('Seller.Operaciones.NoShipment', 'Este pedido todavía no tiene envío.');

  readonly textoEnvioNoDisponible = t('Seller.Operaciones.ShipmentUnavailable', 'No pudimos leer el envío ahora.');

  /** Cómo se llama cada etapa del despacho: en la columna, en los filtros y en las cuentas. */
  readonly textoEtapas: Readonly<Record<EtapaDelDespacho, string>> = {
    paid: t('Seller.Operaciones.StagePaid', 'Por preparar'),
    preparing: t('Seller.Operaciones.StagePreparing', 'En preparación'),
    shipped: t('Seller.Operaciones.StageShipped', 'En camino'),
    delivered: t('Seller.Operaciones.StageDelivered', 'Entregado'),
  };

  /**
   * Los filtros de la bandeja: todos, o una etapa. Las etiquetas no llevan las cuentas, y es a propósito: el shell lleva
   * el filtro activo atado a la lista de filtros, y una lista que cambia con cada lectura lo devolvería a «Todos» con
   * la bandeja filtrada. Las cuentas de la tienda van en la banda de indicadores de Ventas.
   */
  readonly filtrosDeVentas: readonly ConsoleFilter[] = [
    { key: 'todas', label: t('Seller.Operaciones.StageAll', 'Todos') },
    ...ETAPAS_DEL_DESPACHO.map((etapa) => ({ key: etapa, label: this.textoEtapas[etapa] })),
  ];

  /** Ver el detalle de un pedido: su envío, a dónde va y con quién. */
  readonly accionDetalle: ConsoleRowAction = { id: 'detalle', label: this.textoVerDetalle };

  // ─── Los actos del despacho (013-seller-operaciones, T021) ─────────────────
  /** El botón de cada acto: sale sólo si el servidor lo pone en `actos`. */
  readonly accionDelActo: Readonly<Record<ActoDelDespacho, ConsoleRowAction>> = {
    preparar: { id: `${PREFIJO_DEL_ACTO}preparar`, label: t('Seller.Operaciones.ActPrepare', 'Preparar'), kind: 'primary' },
    enviar: { id: `${PREFIJO_DEL_ACTO}enviar`, label: t('Seller.Operaciones.ActShip', 'Marcar enviado'), kind: 'primary' },
    entregar: { id: `${PREFIJO_DEL_ACTO}entregar`, label: t('Seller.Operaciones.ActDeliver', 'Marcar entregado'), kind: 'primary' },
  };

  readonly guiaMaxima = GUIA_MAXIMA;

  readonly textoGuia = t('Seller.Operaciones.TrackingNumber', 'Guía (opcional)');

  readonly textoAyudaDeLaGuia = t('Seller.Operaciones.TrackingHint', 'Hasta 80 caracteres, en una línea.');

  readonly textoCancelar = t('Seller.Operaciones.Cancel', 'Cancelar');

  readonly textoGuiaInvalida = t('Seller.Operaciones.TrackingInvalid', 'La guía: hasta 80 caracteres, en una línea.');

  readonly textoDespachoNoDisponible = t(
    'Seller.Operaciones.DispatchUnavailable',
    'Los pedidos de la puerta no se despachan desde este sitio.',
  );

  // ─── La cola de devoluciones (013-seller-operaciones, T025) ────────────────
  /** El botón de cada movimiento; salen por el estado EXACTO de la devolución. */
  readonly accionDeLaDevolucion: Readonly<Record<MovimientoDeLaDevolucion, ConsoleRowAction>> = {
    approved: { id: `${PREFIJO_DE_LA_DEVOLUCION}approved`, label: t('Seller.Operaciones.ReturnApprove', 'Aprobar'), kind: 'primary' },
    rejected: { id: `${PREFIJO_DE_LA_DEVOLUCION}rejected`, label: t('Seller.Operaciones.ReturnReject', 'Rechazar'), kind: 'danger' },
    received: { id: `${PREFIJO_DE_LA_DEVOLUCION}received`, label: t('Seller.Operaciones.ReturnReceive', 'Marcar recibida'), kind: 'primary' },
    refunded: { id: `${PREFIJO_DE_LA_DEVOLUCION}refunded`, label: t('Seller.Operaciones.ReturnRefund', 'Reembolsar'), kind: 'primary' },
  };

  /** Cómo se llama cada estado de una devolución: en la columna y en lo que no se movió. */
  readonly textoEstadosDeDevolucion: Readonly<Record<EstadoDeLaDevolucion, string>> = {
    Requested: t('Seller.Operaciones.ReturnRequested', 'Pedida'),
    Approved: t('Seller.Operaciones.ReturnApproved', 'Aprobada'),
    Received: t('Seller.Operaciones.ReturnReceived', 'Recibida'),
    Refunded: t('Seller.Operaciones.ReturnRefunded', 'Reembolsada'),
    Rejected: t('Seller.Operaciones.ReturnRejected', 'Rechazada'),
  };

  /** Los filtros de la cola: todas, las que piden algo y las cerradas. */
  readonly filtrosDeDevoluciones: readonly ConsoleFilter[] = [
    { key: 'todas', label: t('Seller.Operaciones.ReturnsAll', 'Todas') },
    { key: 'abiertas', label: t('Seller.Operaciones.ReturnsOpen', 'Abiertas') },
    { key: 'resueltas', label: t('Seller.Operaciones.ReturnsClosed', 'Resueltas') },
  ];

  readonly textoConfirmarReembolso = t('Seller.Operaciones.RefundConfirmAction', 'Sí, reembolsar');

  textoDelEnvio(numero: string): string {
    return t('Seller.Operaciones.ShipOrder', 'Enviar el pedido {numero}', { numero });
  }

  /** Por qué un pedido no tiene actos, dicho para quien despacha; vacío si no hay motivo que decir. */
  textoSinActosDe(motivo: string | null): string {
    switch (motivo) {
      case 'entregado':
        return t('Seller.Operaciones.Delivered', 'Este pedido ya se entregó.');
      case 'despacho_no_disponible':
        return this.textoDespachoNoDisponible;
      default:
        return '';
    }
  }

  textoDelDetalle(numero: string): string {
    return t('Seller.Operaciones.OrderDetail', 'Pedido {numero}', { numero });
  }

  /** El instante en es-CO y en la hora del sitio. */
  momento(instante: string): string {
    return momentoDeLaConsola(instante, this.#estado.zonaHoraria());
  }

  /** La fecha, el comprador y el total del pedido, en una línea. */
  resumenDelPedido(pedido: PedidoDeLaTienda): string {
    return [this.momento(pedido.fecha), pedido.comprador, pedido.totalFormatted].filter(Boolean).join(' · ');
  }

  /** A dónde va, en una línea; con su contacto entre paréntesis. */
  destinoEnUnaLinea(destino: DestinoDelEnvio): string {
    const lugar = [destino.line1, destino.line2, destino.city, destino.region, destino.country].filter(Boolean).join(', ');
    return destino.contact ? `${lugar} (${destino.contact})` : lugar;
  }

  /** Por qué el pedido no trae su envío entero, dicho para quien despacha. */
  textoSinEnvioDe(motivo: DetalleDelPedido['motivoSinEnvio']): string {
    switch (motivo) {
      case 'sin_direccion':
        return this.textoSinDireccion;
      case 'sin_envio':
        return this.textoSinEnvio;
      case 'envio_no_disponible':
        return this.textoEnvioNoDisponible;
      default:
        return '';
    }
  }

  textoDelReembolso(devolucion: DevolucionDeLaTienda): string {
    return t('Seller.Operaciones.RefundConfirm', 'Reembolsar {monto} de la devolución {rma}: la plata vuelve a quien compró.', {
      monto: devolucion.montoFormatted || this.formatPrice(devolucion.monto, devolucion.moneda),
      rma: devolucion.rmaId,
    });
  }

  /** El tono del design system para el de una fila de la consola (`syn-status-tag`). */
  toneDeLaFila(tone: 'ok' | 'warn' | 'info' | 'muted'): StatusTagTone {
    switch (tone) {
      case 'ok':
        return 'success';
      case 'warn':
        return 'warning';
      case 'info':
        return 'pending';
      case 'muted':
        return 'inactive';
    }
  }

  // ─── Labels + formatting (UI copy only — data comes from the API) ──────────

  listingStatusLabel(status: SellerListing['status']): string {
    switch (status) {
      case 'activa':
        return 'Activa';
      case 'pausada':
        return 'Pausada';
      case 'agotada':
        return 'Sin stock';
    }
  }

  returnStatusLabel(status: SellerReturn['status']): string {
    switch (status) {
      case 'abierto':
        return 'Abierta';
      case 'en-revision':
        return 'En revisión';
      case 'aprobado':
        return 'Aprobada';
      case 'rechazado':
        return 'Rechazada';
    }
  }

  formatPercent(value: number): string {
    return `${this.formatNumber(value)} %`;
  }

  formatRating(value: number): string {
    return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value)} / 5`;
  }

  formatKpiValue(metric: SellerKpiMetric): string {
    switch (metric.unit) {
      case 'currency':
        return this.formatPrice(metric.value, this.#estado.currency());
      case 'rating':
        return this.formatRating(metric.value);
      case 'percent':
        return this.formatPercent(metric.value);
      default:
        return this.formatNumber(metric.value);
    }
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value);
  }

  /** Un importe con su moneda; sin moneda (todavía no llegó ningún precio) se pinta el número solo. */
  formatPrice(amount: number, currency: string): string {
    return formatearImporte(amount, currency);
  }
}
