/** Las vistas de `<synergos-seller>` y las secciones del panel: son de la app, no del dominio (014-despiece-tienda). */

/** Top-level view of the seller console. */
export type SellerView = 'panel' | 'publicar' | 'mensajes';

/**
 * Las vistas que el editor elige en el bloque (`vista`, el desplegable `DTSelectVistaDeLaConsola`, 014-despiece-tienda
 * I3): las mismas de la app, con el mismo nombre.
 */
export const VISTAS_DE_LA_CONSOLA: readonly SellerView[] = ['panel', 'publicar', 'mensajes'];

/** Sections of the SH-5 console (dashboard). */
export type SellerSectionId = 'ventas' | 'publicaciones' | 'devoluciones' | 'reputacion';
