import type { BlogsView } from '@synergos/dominio/blogs';

/**
 * La vista que el editor elige en el bloque (`vista`, el desplegable `DTSelectVistaDeBlogs`) y la vista de la red que
 * abre (012-blogs-social, I3, T020). El vocabulario del bloque es el del CMS; el de la app no cambia. La suscripción no
 * tiene página: está apagada (P5).
 */
export const VISTAS_DEL_BLOQUE = {
  inicio: 'feed',
  explorar: 'search',
  publicacion: 'post',
  perfil: 'profile',
  notificaciones: 'notifications',
  mensajes: 'messages',
  guardados: 'saved',
  escribir: 'write',
  estudio: 'studio',
  moderacion: 'moderation',
} as const satisfies Readonly<Record<string, BlogsView>>;

export type VistaDelBloque = keyof typeof VISTAS_DEL_BLOQUE;

/** Los valores que acepta `vista`, en el orden del desplegable. */
export const VALORES_DE_LA_VISTA = Object.keys(VISTAS_DEL_BLOQUE) as readonly VistaDelBloque[];

/** El nombre en el bloque de una vista de la red, o `undefined` si no tiene página (la suscripción). */
export function vistaDelBloque(view: BlogsView): VistaDelBloque | undefined {
  return VALORES_DE_LA_VISTA.find((valor) => VISTAS_DEL_BLOQUE[valor] === view);
}

/** La vista de la red que abre el valor del bloque; la de por defecto si no hay valor o no se conoce. */
export function vistaDeLaApp(valor: string | undefined, porDefecto: BlogsView): BlogsView {
  return valor && valor in VISTAS_DEL_BLOQUE ? VISTAS_DEL_BLOQUE[valor as VistaDelBloque] : porDefecto;
}
