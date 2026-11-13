import { t } from '@synergos/vitals-core';

/**
 * Lo que dicen el panel de denunciar y la cola de moderación (012-blogs-social, I5): la sección `Blogs.Moderacion`
 * del diccionario (ADR 0136). Son getters: `t()` se lee al pintar, como los de `Blogs.Comentarios`.
 */
export function textosDeModeracion() {
  return {
    get denunciar(): string {
      return t('Blogs.Moderacion.Denunciar', 'Denunciar');
    },
    get titulo(): string {
      return t('Blogs.Moderacion.Titulo', '¿Por qué denuncias esto?');
    },
    get ayuda(): string {
      return t('Blogs.Moderacion.Ayuda', 'Lo revisará una persona de moderación. Quien lo publicó no sabrá que fuiste tú.');
    },
    get enviar(): string {
      return t('Blogs.Moderacion.Enviar', 'Enviar denuncia');
    },
    get cancelar(): string {
      return t('Blogs.Moderacion.Cancelar', 'Cancelar');
    },
    get cerrar(): string {
      return t('Blogs.Moderacion.Cerrar', 'Cerrar');
    },
    get cola(): string {
      return t('Blogs.Moderacion.Cola', 'Moderación');
    },
    get denuncias(): string {
      return t('Blogs.Moderacion.Denuncias', 'Denuncias');
    },
    get colaVacia(): string {
      return t('Blogs.Moderacion.ColaVacia', 'No hay denuncias pendientes.');
    },
    get mantener(): string {
      return t('Blogs.Moderacion.Mantener', 'Mantener');
    },
    get retirar(): string {
      return t('Blogs.Moderacion.Retirar', 'Retirar');
    },
    get porQue(): string {
      return t('Blogs.Moderacion.PorQue', '¿Por qué lo decides?');
    },
    get confirmar(): string {
      return t('Blogs.Moderacion.Confirmar', 'Confirmar');
    },
    get sinPermiso(): string {
      return t('Blogs.Moderacion.SinPermiso', 'No tienes permiso para moderar.');
    },
    get sesionParaModerar(): string {
      return t('Blogs.Moderacion.SesionParaModerar', 'Inicia sesión para moderar.');
    },
    get colaNoCargo(): string {
      return t('Blogs.Moderacion.ColaNoCargo', 'No pudimos cargar la cola de moderación.');
    },
    get que(): string {
      return t('Blogs.Moderacion.Que', 'Qué');
    },
    get contenido(): string {
      return t('Blogs.Moderacion.Contenido', 'Contenido');
    },
    get motivo(): string {
      return t('Blogs.Moderacion.Motivo', 'Motivo');
    },
    get fecha(): string {
      return t('Blogs.Moderacion.Fecha', 'Fecha');
    },
    get publicacion(): string {
      return t('Blogs.Moderacion.Publicacion', 'Publicación');
    },
    get comentario(): string {
      return t('Blogs.Moderacion.Comentario', 'Comentario');
    },
  };
}

/** Los textos de la moderación, como los pinta cada pieza. */
export type TextosDeModeracion = ReturnType<typeof textosDeModeracion>;
