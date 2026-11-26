import { t } from '@synergos/vitals-core';

/**
 * Lo que dice la red en general: la sección `Blogs.Red` del diccionario (ADR 0136; 012-blogs-social, vuelta de valor).
 * Son getters: `t()` se lee al pintar, como los de `Blogs.Comentarios` y `Blogs.Moderacion`.
 */
export function textosDeLaRed() {
  return {
    get perfilSinSesion(): string {
      return t('Blogs.Red.PerfilSinSesion', 'Inicia sesión para ver tu perfil');
    },
    get perfilSinSesionTexto(): string {
      return t('Blogs.Red.PerfilSinSesionTexto', 'Tu perfil reúne lo que publicas, a quién sigues y quién te sigue.');
    },
    get sesionParaPublicar(): string {
      return t('Blogs.Red.SesionParaPublicar', 'Inicia sesión para publicar');
    },
    get escribirSinSesion(): string {
      return t('Blogs.Red.EscribirSinSesion', 'Inicia sesión para escribir un artículo');
    },
    get escribirSinSesionTexto(): string {
      return t('Blogs.Red.EscribirSinSesionTexto', 'Tus artículos salen con tu nombre y tu perfil. Entra y escribe aquí el tuyo.');
    },
    /** La publicación que no existe, o que la moderación retiró (012, vuelta de valor, tanda 13). */
    get publicacionNoDisponible(): string {
      return t('Blogs.Red.PublicacionNoDisponible', 'Esta publicación no está disponible');
    },
    get publicacionNoDisponibleTexto(): string {
      return t('Blogs.Red.PublicacionNoDisponibleTexto', 'Puede que la hayan retirado o que el enlace esté incompleto.');
    },
    /** El `<h1>` de una publicación abierta, para el lector de pantalla: su tarjeta titula con un `<h2>`, o sin título. */
    publicacionDe(autor: string): string {
      return t('Blogs.Red.PublicacionDe', 'Publicación de {autor}').replace('{autor}', autor);
    },
    /** «1 publicación» o «N publicaciones», con la cifra ya formateada (`1,2 k`). */
    publicaciones(cantidad: number, cifra: string): string {
      return cantidad === 1
        ? t('Blogs.Red.UnaPublicacion', '1 publicación')
        : t('Blogs.Red.Publicaciones', '{cifra} publicaciones').replace('{cifra}', cifra);
    },
  };
}

/** Los textos de la red, como los pinta cada vista. */
export type TextosDeLaRed = ReturnType<typeof textosDeLaRed>;
