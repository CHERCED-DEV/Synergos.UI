import type { TextosDeBlogs } from '@synergos/dominio/blogs';
import { t } from '@synergos/vitals-core';

/**
 * Los textos que la fachada de la red le dice a quien la usa (012-blogs-social, I2): la app los pone porque una
 * librería no traduce (ADR 0136). Los de la sección `Blogs.Comentarios` del diccionario son getters: `t()` se lee al
 * decirlos, como cuando vivían en el componente.
 */
export function textosDeEstaRed(): TextosDeBlogs {
  return {
    feedNoCargo: 'No pudimos cargar el feed. Intenta de nuevo.',
    publicarNoGuardado: 'No pudimos publicar. Tu texto sigue acá — intenta de nuevo.',
    publicarFallo: 'No pudimos publicar. Intenta de nuevo.',
    articuloFallo: 'No pudimos publicar el artículo. Intenta de nuevo.',
    reaccionNoGuardada: 'No pudimos guardar tu reacción. Intenta de nuevo.',
    seguirNoGuardado: 'No pudimos actualizar a quién sigues. Intenta de nuevo.',
    publicacionNoAbrio: 'No pudimos abrir la publicación.',
    perfilNoCargo: 'No pudimos cargar el perfil.',
    notificacionesNoCargaron: 'No pudimos cargar las notificaciones.',
    busquedaFallo: 'No pudimos buscar. Intenta de nuevo.',
    mensajesNoCargaron: 'No pudimos cargar tus mensajes.',
    conversacionNoAbrio: 'No pudimos abrir la conversación.',
    mensajeNoEnviado: 'Tu mensaje NO se envió. Queda en el hilo para reintentarlo.',
    mensajeSigueSinEnviar: 'Tu mensaje sigue sin enviarse. Queda en el hilo.',
    guardadosNoCargaron: 'No pudimos cargar tus guardados.',
    guardarFallo: 'No pudimos guardar el post. Intenta de nuevo.',
    quitarGuardadoFallo: 'No pudimos quitarlo de guardados. Intenta de nuevo.',
    estudioNoCargo: 'No pudimos cargar el estudio.',
    conversacionAjena: 'Esa conversación no es tuya.',
    sesionParaVer: 'Inicia sesión para ver esta sección.',
    sesionParaNotificaciones: 'Inicia sesión para ver tus notificaciones.',
    sesionParaMensajes: 'Inicia sesión para ver tus mensajes.',
    sesionParaEnviar: 'Inicia sesión para enviar mensajes.',
    sesionParaGuardados: 'Inicia sesión para ver tus guardados.',
    sesionParaGuardar: 'Inicia sesión para guardar este post.',
    sesionParaGestionarGuardados: 'Inicia sesión para gestionar tus guardados.',
    sesionParaEstudio: 'Inicia sesión para ver tu estudio.',
    quienLee: 'Tú',
    membresia: (plan) => `Membresía ${plan}`,
    get comentarioEnRevision(): string {
      return t('Blogs.Comentarios.EnRevision', 'Tu comentario quedó en revisión: se verá cuando lo apruebe un moderador.');
    },
    get comentarioSinSesion(): string {
      return t('Blogs.Comentarios.SinSesion', 'Inicia sesión para comentar.');
    },
    get comentarioNoPublicado(): string {
      return t('Blogs.Comentarios.NoPublicado', 'Tu comentario NO se publicó. Sigue en la caja para reintentarlo.');
    },
    get meGustaSinSesion(): string {
      return t('Blogs.Comentarios.MeGustaSinSesion', 'Inicia sesión para dar me gusta.');
    },
    get meGustaNoGuardado(): string {
      return t('Blogs.Comentarios.MeGustaNoGuardado', 'No pudimos guardar tu me gusta. Intenta de nuevo.');
    },
  };
}
