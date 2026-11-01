// La API pública de @synergos/dominio/tienda (014-despiece-tienda, I2).
//
// El dominio de la Tienda que componen sus dos apps, `storefront` y `seller`: los modelos por capacidad (catálogo,
// carrito, compra, pedidos, devoluciones, lista de deseos, mensajes, reseñas y vendedor). No es una hoja del design
// system: lo que se pinta lo deciden las apps, y lo que aquí se nombra es el vocabulario de la tienda.
//
// Se empaqueta dentro de cada elemento que la usa (`BUNDLED_SYNERGOS`), como `shop` y `shells`: es código de la
// vertical, que cambia con sus apps. Cuando una segunda vertical adopte una capacidad, esa capacidad sube a una lib
// compartida (spec de 014, regla 4).

export * from './lib/catalogo/catalogo.model';
export * from './lib/carrito/carrito.model';
export * from './lib/compra/compra.model';
export * from './lib/pedidos/pedidos.model';
export * from './lib/devoluciones/devoluciones.model';
export { MOTIVOS_DE_DEVOLUCION, etiquetaDelMotivo } from './lib/devoluciones/motivos';
export * from './lib/deseos/deseos.model';
export * from './lib/mensajes/mensajes.model';
export * from './lib/resenas/resenas.model';
export * from './lib/vendedor/escritorio.model';

// Los adaptadores, uno por capacidad (T009): cada uno habla con su parte del borde del CMS. La fontanería común
// (llamar sólo con la base de la API, pedir JSON, leer sin confiar en la forma) vive en @synergos/core.
export { LecturasDeLaTienda, ShopWriteFailedError } from './lib/comun/lecturas';
export { CatalogoApi } from './lib/catalogo/catalogo-api.client';
export { CuponApi } from './lib/carrito/cupon-api.client';
export { CompraApi } from './lib/compra/compra-api.client';
export { MUESTRAS_DE_LA_CUENTA, PedidosApi } from './lib/pedidos/pedidos-api.client';
export { DevolucionesApi } from './lib/devoluciones/devoluciones-api.client';
export { DeseosApi } from './lib/deseos/deseos-api.client';
export { MensajesApi } from './lib/mensajes/mensajes-api.client';
export { ResenasApi } from './lib/resenas/resenas-api.client';
export { EscritorioApi } from './lib/vendedor/escritorio-api.client';

// La compra: la estrategia que el motor de transacciones usa para la tienda, y la compra por la puerta.
export * from './lib/compra/shop-fulfillment.strategy';
export * from './lib/compra/tienda-compra';
