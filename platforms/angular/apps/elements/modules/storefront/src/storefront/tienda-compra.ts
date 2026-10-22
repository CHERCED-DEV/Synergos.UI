import type { BffTienda } from '@synergos/contracts';
import type { SessionData, SessionItem } from '@synergos/transaction-engine';
import {
  abrirTiendaCompra,
  cancelarTiendaCompra,
  cerrarTiendaCompra,
  consultarTiendaCompra,
  cotizarTiendaCompra,
  type Flujo,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';

/**
 * La compra de la tienda por la puerta (004-tienda-compra, ADR 0140), tipada con el contrato GENERADO de
 * `Synergos.Bff.Tienda`: la clave del flujo, sus cinco operaciones y la lectura de su respuesta.
 *
 * <p>Habla SÓLO con el coordinador (`<synergos-flujo>`) que la vista coloca alrededor del elemento, y el
 * transporte sale del envoltorio GENERADO del flujo (`generados/tienda.compra.ts`, núcleo N3: «gana el
 * generado»). Un renombre en el orquestador se regenera en `bff-tienda.contract.ts` y en ese envoltorio, y
 * rompe la compilación de este fichero.</p>
 *
 * <p><b>Lo que se lee no se inventa</b>: un total que el servidor no dio es `null` —la pantalla no muestra
 * precio—, nunca un cero.</p>
 */
export const FLUJO_DE_LA_COMPRA = 'tienda.compra' as const satisfies Flujo;

/** La clase de lo que se compra, la que declara la definición del flujo para cada línea (NR-1). */
export const KIND_DEL_PRODUCTO = 'tienda.producto' as const;

/** El dinero como lo publica el contrato: unidades MAYORES de su moneda. */
export interface Importe {
  readonly amount: number;
  readonly currency: string;
}

/** Una línea de lo que se compró, como la cobró el servidor. */
export interface LineaComprada {
  readonly productoId: string;
  readonly varianteId: string | null;
  readonly cantidad: number;
  readonly precioUnitario: Importe;
}

/** Lo que la pantalla necesita de una compra: lo que contestó el servidor, sin adornos. */
export interface CompraDeTienda {
  readonly id: string;
  /** El número que dice el aviso y «Mis compras». */
  readonly numero: string;
  /** Running, Completed, Compensating, Compensated o CompensationFailed. */
  readonly estado: string;
  readonly subtotal: Importe | null;
  readonly descuento: Importe | null;
  /** `null` si el servidor no lo dio: la pantalla no muestra precio. */
  readonly total: Importe | null;
  readonly lineas: readonly LineaComprada[];
  /** Si queda algo por deshacer: mientras tanto no se afirma que no se cobró. */
  readonly deshaciendo: boolean;
}

/** Lo que costaría la compra, sin apartar ni cobrar nada. */
export interface CotizacionDeTienda {
  readonly subtotal: Importe | null;
  readonly descuento: Importe | null;
  readonly total: Importe | null;
}

/** El id de un sujeto `tienda.producto`: `producto` o `producto:variante`. */
function lineaComprada(l: { readonly sujeto: { readonly id: string }; readonly cantidad: number; readonly precioUnitario: Importe }): LineaComprada {
  const corte = l.sujeto.id.indexOf(':');
  return {
    productoId: corte < 0 ? l.sujeto.id : l.sujeto.id.slice(0, corte),
    varianteId: corte < 0 ? null : l.sujeto.id.slice(corte + 1),
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
  };
}

export function leerCompra(r: BffTienda.TiendaCompraRespuesta): CompraDeTienda {
  return {
    id: r.id,
    numero: r.numero,
    estado: r.estado,
    subtotal: r.datos.subtotal,
    descuento: r.datos.descuento,
    total: r.datos.total,
    lineas: (r.datos.lineasDelPedido ?? []).map(lineaComprada),
    deshaciendo: r.deshaciendo || r.compensacionesPendientes > 0,
  };
}

export function leerCotizacion(r: BffTienda.TiendaCompraCotizacion): CotizacionDeTienda {
  return { subtotal: r.datos.subtotal, descuento: r.datos.descuento, total: r.datos.total };
}

function leida(r: ResultadoDelFlujo<BffTienda.TiendaCompraRespuesta>): ResultadoDelFlujo<CompraDeTienda> {
  return r.ok ? { ...r, valor: leerCompra(r.valor) } : r;
}

/**
 * El sujeto de una línea del carrito, el MISMO que publica la oferta y usa la canasta del CMS:
 * `producto` o `producto:variante`. La variante sintética del «agregar rápido» de la grilla
 * (`{producto}-default`) no es una variante del catálogo: es el producto.
 */
export function sujetoDeLaLinea(item: SessionItem): string {
  const seleccion = item.selection as Readonly<Record<string, unknown>>;
  const producto = typeof seleccion['productId'] === 'string' && seleccion['productId'] ? seleccion['productId'] : item.productRef;
  const variante = typeof seleccion['variantId'] === 'string' ? seleccion['variantId'].trim() : '';
  return variante === '' || variante === `${producto}-default` ? producto : `${producto}:${variante}`;
}

/**
 * Lo que se le pide a la puerta para ABRIR la compra, y también para COTIZARLA: el mismo cuerpo, así lo que
 * la vista previa muestra es lo que abrir autorizaría. Cada producto va como REFERENCIA con la clase que
 * declara la definición (NR-1); del navegador viajan sólo el sujeto, la cantidad y el código del cupón —el
 * precio lo pone el servidor—.
 */
export function cuerpoDeLaCompra(session: SessionData, codigo?: string | null): BffTienda.TiendaCompraEntrada {
  const lineas = session.items.map((item) => ({
    producto: { kind: KIND_DEL_PRODUCTO, id: sujetoDeLaLinea(item) },
    cantidad: Math.max(1, Math.trunc(item.quantity)),
  }));
  return codigo ? { lineas, promocion: codigo } : { lineas };
}

/** Los datos de envío del formulario, con el país del despliegue. */
export interface DatosDeEnvio {
  readonly direccion: string;
  readonly ciudad: string;
  /** ISO 3166-1 alfa-2: lo declara el CMS (`shippingCountry`), el formulario no lo pregunta. */
  readonly pais: string;
  readonly contacto?: string;
}

/** La dirección de «cerrar», con los nombres del contrato. */
export function direccionDeEnvio(datos: DatosDeEnvio): BffTienda.TiendaCompraCerrarEntrada['direccion'] {
  const contacto = datos.contacto?.trim();
  return {
    linea1: datos.direccion.trim(),
    ciudad: datos.ciudad.trim(),
    pais: datos.pais.trim().toUpperCase(),
    ...(contacto ? { contacto } : {}),
  };
}

/** Lo que costaría, SIN apartar nada: la fase que abre, anticipada hasta antes de apartar. Sin llave. */
export async function cotizarCompraDeTienda(
  desde: Element,
  cuerpo: BffTienda.TiendaCompraEntrada,
): Promise<ResultadoDelFlujo<CotizacionDeTienda>> {
  const r = await cotizarTiendaCompra(desde, { cuerpo });
  return r.ok ? { ...r, valor: leerCotizacion(r.valor) } : r;
}

/** Aparta y autoriza. La llave es la de la intención: la misma al reintentar no aparta dos veces. */
export async function abrirCompraDeTienda(
  desde: Element,
  cuerpo: BffTienda.TiendaCompraEntrada,
  llave: string,
): Promise<ResultadoDelFlujo<CompraDeTienda>> {
  return leida(await abrirTiendaCompra(desde, { cuerpo, llave }));
}

export async function consultarCompraDeTienda(desde: Element, id: string): Promise<ResultadoDelFlujo<CompraDeTienda>> {
  return leida(await consultarTiendaCompra(desde, { consulta: { id } }));
}

/** Captura, consume, despacha a `direccion`, cumple el pedido y avisa. */
export async function cerrarCompraDeTienda(
  desde: Element,
  id: string,
  direccion: BffTienda.TiendaCompraCerrarEntrada['direccion'],
): Promise<ResultadoDelFlujo<CompraDeTienda>> {
  return leida(await cerrarTiendaCompra(desde, { consulta: { id }, cuerpo: { direccion } }));
}

export async function cancelarCompraDeTienda(desde: Element, id: string): Promise<ResultadoDelFlujo<CompraDeTienda>> {
  return leida(await cancelarTiendaCompra(desde, { consulta: { id } }));
}
