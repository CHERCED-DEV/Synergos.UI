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
  };
}

/** Los textos de la red, como los pinta cada vista. */
export type TextosDeLaRed = ReturnType<typeof textosDeLaRed>;
