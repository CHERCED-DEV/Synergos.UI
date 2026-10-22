import type { SessionItem } from '@synergos/transaction-engine';
import { direccionDeEnvio, leerCompra, sujetoDeLaLinea } from './tienda-compra';

/** La lectura de la compra de la puerta y lo que viaja (004-tienda-compra, T018): nada se inventa. */

const respuesta = (total: { amount: number; currency: string } | null) => ({
  id: 'saga-1',
  flujo: 'tienda.compra',
  numero: 'COMPRA01',
  estado: 'Running',
  datos: {
    lineasDelPedido: [{ sujeto: { kind: 'tienda.producto', id: 'CAMI-001:azul' }, cantidad: 1, precioUnitario: { amount: 35_000, currency: 'COP' } }],
    subtotal: total,
    descuento: null,
    impuesto: null,
    total,
    pedido: null,
    envio: null,
    cobroId: null,
  },
  compensacionesPendientes: 1,
  error: null,
  deshaciendo: false,
});

const item = (productId: string, variantId: string): SessionItem => ({
  id: `product:${productId}:${variantId}`,
  kind: 'product',
  productRef: productId,
  label: productId,
  selection: { productId, variantId },
  amount: 1,
  quantity: 1,
});

describe('tienda-compra: lo que se lee y lo que viaja', () => {
  it('un total que el servidor no dio es null, nunca un cero; y lo pendiente por deshacer cuenta', () => {
    const sinTotal = leerCompra(respuesta(null));
    expect(sinTotal.total).toBeNull();
    expect(sinTotal.subtotal).toBeNull();
    expect(sinTotal.deshaciendo).toBe(true);

    const conTotal = leerCompra(respuesta({ amount: 35_000, currency: 'COP' }));
    expect(conTotal.total).toEqual({ amount: 35_000, currency: 'COP' });
    expect(conTotal.lineas).toEqual([
      { productoId: 'CAMI-001', varianteId: 'azul', cantidad: 1, precioUnitario: { amount: 35_000, currency: 'COP' } },
    ]);
  });

  it('el sujeto de una línea es el de la oferta: producto, o producto:variante; la variante sintética es el producto', () => {
    expect(sujetoDeLaLinea(item('TAZA-001', 'TAZA-001-default'))).toBe('TAZA-001');
    expect(sujetoDeLaLinea(item('TAZA-001', ''))).toBe('TAZA-001');
    expect(sujetoDeLaLinea(item('CAMI-001', 'azul'))).toBe('CAMI-001:azul');
  });

  it('la dirección de cerrar lleva el país del despliegue en mayúsculas, y el contacto sólo si lo hay', () => {
    expect(direccionDeEnvio({ direccion: ' Calle 1 ', ciudad: ' Bogotá ', pais: 'co', contacto: ' Ana ' })).toEqual({
      linea1: 'Calle 1',
      ciudad: 'Bogotá',
      pais: 'CO',
      contacto: 'Ana',
    });
    expect(direccionDeEnvio({ direccion: 'Calle 1', ciudad: 'Bogotá', pais: 'CO' })).toEqual({ linea1: 'Calle 1', ciudad: 'Bogotá', pais: 'CO' });
  });
});
