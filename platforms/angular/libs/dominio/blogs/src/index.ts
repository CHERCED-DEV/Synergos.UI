// La API pública de @synergos/dominio/blogs (012-blogs-social, I2).
//
// El dominio de la red social que compone la app `blogs`: el modelo (publicaciones, autores, reacciones, comentarios,
// mensajes, notificaciones y el estudio) y un adaptador por capacidad. No es una hoja del design system: lo que se pinta
// lo decide la app, y lo que aquí se nombra es el vocabulario de la red.
//
// Se empaqueta dentro del elemento que la usa (`BUNDLED_SYNERGOS`), como `dominio/tienda`: es código de la vertical,
// que cambia con su app. Cuando una segunda vertical adopte una capacidad, esa capacidad sube a una lib compartida
// (spec de 012, regla 4).

export * from './lib/comun/blogs.model';
export {
  BlogsForbiddenError,
  BlogsUnauthorizedError,
  BlogsWriteFailedError,
  isBlogsForbidden,
  isBlogsUnauthorized,
  type PublishOutcome,
} from './lib/comun/errores';

// Los datos de ejemplo: la degradación de las LECTURAS, con el cartel que lo dice.
export * from './lib/comun/blogs.mock';

// Los adaptadores, uno por capacidad (T014): cada uno habla con su parte del borde del CMS. La fontanería —el transporte
// con los estados de sesión tipados y el cartel de «datos de ejemplo»— es `BordeDeBlogs`, una por app.
export { BordeDeBlogs } from './lib/comun/borde-de-blogs';
export { ContenidoApi } from './lib/contenido/contenido-api.client';
export { ComentariosApi } from './lib/comentarios/comentarios-api.client';
export { ReaccionesApi } from './lib/reacciones/reacciones-api.client';
export { SeguidoresApi } from './lib/seguidores/seguidores-api.client';
export { PerfilApi } from './lib/perfil/perfil-api.client';
export { NotificacionesApi } from './lib/notificaciones/notificaciones-api.client';
export { ExplorarApi } from './lib/explorar/explorar-api.client';
export { MensajesApi } from './lib/mensajes/mensajes-api.client';
export { GuardadosApi } from './lib/guardados/guardados-api.client';
export { EstudioApi } from './lib/estudio/estudio-api.client';

// La fachada: el estado de la red por caso de uso (T013). Se provee por elemento —cada red de la página tiene la suya— y
// la app le da sus textos (`TEXTOS_DE_BLOGS`), su navegación, su región viva y sus CustomEvents; los adaptadores, en
// cambio, son de la app entera.
export { TEXTOS_DE_BLOGS, type TextosDeBlogs } from './lib/comun/textos';
export {
  RedDeBlogs,
  SIN_CIFRAS,
  VISTAS_CON_PANEL,
  type ConexionDeLaRed,
  type EventosDeLaRed,
  type NavegacionDeLaRed,
} from './lib/comun/red-de-blogs';
export { InicioDeBlogs } from './lib/contenido/inicio';
export { CompositorDeBlogs, MAXIMO_DE_UNA_NOTA } from './lib/contenido/compositor';
export {
  ArticuloDeBlogs,
  MINIMO_DEL_CUERPO,
  type AsistenteDelArticulo,
  type BorradorDelArticulo,
} from './lib/contenido/articulo';
export { PublicacionDeBlogs } from './lib/comentarios/publicacion';
export { ReaccionesDeBlogs } from './lib/reacciones/reacciones';
export { SeguidoresDeBlogs } from './lib/seguidores/seguidores';
export { PerfilDeBlogs } from './lib/perfil/perfil';
export { GuardadosDeBlogs } from './lib/guardados/guardados';
export { NotificacionesDeBlogs } from './lib/notificaciones/notificaciones';
export { ExplorarDeBlogs, PESTANAS_DE_EXPLORAR, type CriteriosDeExplorar } from './lib/explorar/explorar';
export { MensajesDeBlogs } from './lib/mensajes/mensajes';
export { EstudioDeBlogs, SECCIONES_DEL_ESTUDIO } from './lib/estudio/estudio';
export {
  SUSCRIPCION_ENCENDIDA,
  SuscripcionDeBlogs,
  type BusDeBlogs,
  type ResultadoDeLaSuscripcion,
} from './lib/suscripcion/suscripcion';
