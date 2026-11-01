import type { ReturnCase, TextosDeLaTienda } from '@synergos/dominio/tienda';

/** El estado de un reclamo, como lo lee quien compra y quien vende. */
export function estadoDelReclamo(claim: ReturnCase): string {
  switch (claim.status) {
    case 'abierto':
      return 'Reclamo abierto';
    case 'en-revision':
      return 'En revisión';
    case 'resuelto':
      return 'Resuelto';
    case 'rechazado':
      return 'Rechazado';
  }
}

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
  comprasCaidas: 'No pudimos cargar tus compras.',
  // Lo que se dice según por qué rebotó la devolución (#32).
  devolucionNoAbierta: {
    unauthenticated: 'Inicia sesión para pedir una devolución.',
    // Sin oferta de login: la sesión no es el problema (ADR 0112).
    forbidden: 'Esta compra no está a tu nombre.',
    'not-found': 'No encontramos ese pedido.',
    invalid: 'No se puede devolver esa línea. Revisa el pedido.',
    failed: 'No pudimos abrir el reclamo. Intenta de nuevo.',
  },
  // Lo que se dice cuando no se pudo mover el reclamo.
  reclamoNoMovido: {
    unauthenticated: 'Inicia sesión para gestionar devoluciones.',
    forbidden: 'No tienes permiso para mover este reclamo.',
    'not-found': 'Ese reclamo ya no existe.',
    illegal: 'Ese cambio de estado no es posible desde el estado actual.',
    failed: 'No pudimos guardar el cambio. El reclamo sigue como estaba.',
  },
  reclamoMovido: (claim) => `Reclamo ${claim.claimId}: ${estadoDelReclamo(claim)}.`,
  opinionAprobada: 'Opinión aprobada. Ya se ve en el producto.',
  opinionRechazada: 'Opinión rechazada. No se publicará.',
  opinionYaAtendida: 'Otra persona ya la había atendido.',
  opinionAjena: 'No puedes moderar las opiniones de este producto.',
  opinionNoGuardada: 'No pudimos guardar la decisión. La opinión sigue como estaba.',
};
