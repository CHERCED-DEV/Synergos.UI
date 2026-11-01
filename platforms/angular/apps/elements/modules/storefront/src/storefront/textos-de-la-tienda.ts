import type { TextosDeLaTienda } from '@synergos/dominio/tienda';

/**
 * Lo que la fachada de la tienda le dice a quien compra, en esta app (014-despiece-tienda, T008). La lib decide cuál
 * se dice; el texto es de la app, y su deuda se cuenta aquí.
 */
export const TEXTOS_DE_ESTA_TIENDA: TextosDeLaTienda = {
  busquedaCaida: 'No pudimos cargar los productos. Intenta de nuevo.',
  productoCaido: 'No pudimos abrir el producto. Intenta de nuevo.',
  favoritoNoGuardado: 'No pudimos guardar el cambio en tus favoritos. Intenta de nuevo.',
  resenaEnRevision: 'Gracias. Tu opinión quedó en revisión y se publicará cuando la aprueben.',
  resenaPublicada: '¡Gracias! Tu opinión ya está publicada.',
  resenaSinSesion: 'Inicia sesión para dejar tu opinión.',
  resenaNoCompraste: 'Solo quien compró este producto puede opinar sobre él.',
  resenaInvalida: 'Revisa la calificación y el texto de tu opinión.',
  resenaCaida: 'No pudimos publicar tu opinión. Intenta de nuevo.',
  reporteRecibido: 'Gracias por avisar. Vamos a revisarla.',
  reporteSinSesion: 'Inicia sesión para reportar una opinión.',
  reporteCaido: 'No pudimos registrar el reporte. Intenta de nuevo.',
};
