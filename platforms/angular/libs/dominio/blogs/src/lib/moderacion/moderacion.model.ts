/** Lo que se puede denunciar de la red (012-blogs-social, I5): el tipo que declara el CMS para cada cosa. */
export type TipoDenunciable = 'blogs.publicacion' | 'blogs.comentario';

/**
 * Lo que se va a denunciar. Un comentario se nombra por su publicación y su id, `{publicación}:{comentario}`: el CMS
 * sabe en qué hilo vive. `resumen` es lo que el panel cita de lo denunciado.
 */
export interface ObjetivoDeLaDenuncia {
  readonly tipo: TipoDenunciable;
  readonly id: string;
  readonly resumen: string;
}

/** Lo que decide quien modera. */
export type DecisionDeModeracion = 'mantener' | 'retirar';

/** Un caso de la cola de moderación: qué se denunció, por qué y cuántas personas. Quien denunció no viaja. */
export interface CasoDeModeracion {
  readonly id: string;
  readonly tipo: string;
  readonly objetivoId: string;
  readonly resumen: string;
  readonly enlace?: string;
  readonly motivo: string;
  readonly denuncias: number;
  readonly denunciado: string;
}
