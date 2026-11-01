import {
  type DevolucionDeLaTienda,
  type EstadoDeLaDevolucion,
  etiquetaDelMotivo,
  type MovimientoDeLaDevolucion,
  type PedidoDeLaTienda,
  type SellerListing,
} from '@synergos/dominio/tienda';
import { type ConsoleColumn, type ConsoleFilter } from '@synergos/shells';
import { type PresentacionDeLaConsola } from '../../estado/presentacion';

/*
 * Las columnas y las filas del panel (014-despiece-tienda, T011): cómo cada registro del dominio se vuelve una fila de
 * SH-5. Funciones puras: lo que dice cada celda lo pone la presentación de la consola, que llega como argumento.
 */

/**
 * One pre-rendered row for the SH-5 table: the shell treats rows as opaque, so
 * the component projects each domain record into formatted `cells` keyed by
 * column and keeps the raw record for actions.
 */
export interface SellerRowVm {
  readonly id: string;
  readonly kind: 'order' | 'listing' | 'return';
  readonly cells: Readonly<Record<string, string>>;
  /** Visual tone of the `estado` chip. */
  readonly tone: 'ok' | 'warn' | 'info' | 'muted';
  readonly pedido?: PedidoDeLaTienda;
  readonly listing?: SellerListing;
  readonly devolucion?: DevolucionDeLaTienda;
}

export const ORDER_COLUMNS: readonly ConsoleColumn[] = [
  { key: 'orden', label: 'Orden' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'comprador', label: 'Comprador' },
  { key: 'productos', label: 'Productos' },
  { key: 'total', label: 'Total', align: 'end' },
  { key: 'estado', label: 'Estado' },
];

export const LISTING_COLUMNS: readonly ConsoleColumn[] = [
  { key: 'titulo', label: 'Publicación' },
  { key: 'sku', label: 'SKU' },
  { key: 'precio', label: 'Precio', align: 'end' },
  { key: 'stock', label: 'Stock', align: 'end' },
  { key: 'preguntas', label: 'Preguntas', align: 'end' },
  { key: 'estado', label: 'Estado' },
];

export const RETURN_COLUMNS: readonly ConsoleColumn[] = [
  { key: 'rma', label: 'RMA' },
  { key: 'orden', label: 'Orden' },
  { key: 'producto', label: 'Producto' },
  { key: 'motivo', label: 'Motivo' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'estado', label: 'Estado' },
];

export const LISTING_FILTERS: readonly ConsoleFilter[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'activas', label: 'Activas' },
  { key: 'pausadas', label: 'Pausadas' },
  { key: 'agotadas', label: 'Agotadas' },
];

/** Lo que dice una celda sin dato: una raya, y no un texto que lo invente. */
const SIN_DATO = '—';

/** Lo que puede pasarle a una devolución desde cada estado (la máquina del CMS: `StubReturnService`). */
export const MOVIMIENTOS_DESDE: Readonly<Record<EstadoDeLaDevolucion, readonly MovimientoDeLaDevolucion[]>> = {
  Requested: ['approved', 'rejected'],
  Approved: ['received'],
  Received: ['refunded'],
  Refunded: [],
  Rejected: [],
};

// ─── Row projections (domain → opaque cells for the shell) ─────────────────
/** Un pedido de la bandeja: la fecha en la hora del sitio, el total que formateó el servidor y la etapa con su nombre. */
export function pedidoRow(pedido: PedidoDeLaTienda, presentacion: PresentacionDeLaConsola): SellerRowVm {
  return {
    id: pedido.orderRef,
    kind: 'order',
    pedido,
    tone: pedido.etapa === 'delivered' ? 'ok' : pedido.etapa === 'shipped' ? 'info' : 'warn',
    cells: {
      orden: pedido.orderNumber,
      fecha: presentacion.momento(pedido.fecha),
      comprador: pedido.comprador || SIN_DATO,
      productos: pedido.lineas
        .map((line) => (line.qty > 1 ? `${line.title} ×${line.qty}` : line.title))
        .join(' · '),
      total: pedido.totalFormatted || presentacion.formatPrice(pedido.total, pedido.moneda),
      estado: presentacion.textoEtapas[pedido.etapa],
    },
  };
}

/** Una publicación: su precio en su moneda o, si no la trae, en la de la consola (`moneda`). */
export function listingRow(listing: SellerListing, presentacion: PresentacionDeLaConsola, moneda: string): SellerRowVm {
  return {
    id: listing.id,
    kind: 'listing',
    listing,
    tone:
      listing.status === 'activa' ? 'ok' : listing.status === 'pausada' ? 'muted' : 'warn',
    cells: {
      titulo: listing.title,
      sku: listing.sku,
      precio: presentacion.formatPrice(listing.amount, listing.currency || moneda),
      stock: presentacion.formatNumber(listing.stock),
      preguntas: presentacion.formatNumber(listing.questionsOpen),
      estado: presentacion.listingStatusLabel(listing.status),
    },
  };
}

export function returnRow(devolucion: DevolucionDeLaTienda, presentacion: PresentacionDeLaConsola): SellerRowVm {
  return {
    id: devolucion.rmaId,
    kind: 'return',
    devolucion,
    tone:
      devolucion.estado === 'Refunded'
        ? 'ok'
        : devolucion.estado === 'Rejected'
          ? 'muted'
          : devolucion.estado === 'Requested'
            ? 'warn'
            : 'info',
    cells: {
      rma: devolucion.rmaId,
      orden: devolucion.orderNumber ?? SIN_DATO,
      producto: devolucion.cantidad > 1 ? `${devolucion.producto} ×${devolucion.cantidad}` : devolucion.producto,
      motivo: etiquetaDelMotivo(devolucion.motivo),
      fecha: devolucion.solicitada ? presentacion.momento(devolucion.solicitada) : SIN_DATO,
      estado: presentacion.textoEstadosDeDevolucion[devolucion.estado],
    },
  };
}
