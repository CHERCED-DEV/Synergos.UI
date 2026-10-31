import type { ReturnReason } from './devoluciones.model';

/** Los motivos, con el nombre que entiende quien compra. */
const ETIQUETAS_DE_LOS_MOTIVOS: Readonly<Record<ReturnReason, string>> = {
  damaged: 'Llegó dañado',
  defective: 'No funciona',
  'not-as-described': 'No es lo que decía la publicación',
  'changed-mind': 'Cambié de opinión',
};

/** Los cuatro, en el orden en que se ofrecen. */
export const MOTIVOS_DE_DEVOLUCION: readonly ReturnReason[] = [
  'damaged',
  'defective',
  'not-as-described',
  'changed-mind',
];

/**
 * El texto de un motivo de devolución, el mismo para quien la pide y para el personal que la atiende
 * (014-despiece-tienda): la cola de la consola pintaba el código («damaged»). Un motivo que no es de los cuatro —un
 * texto libre de antes— se dice tal cual.
 */
export function etiquetaDelMotivo(motivo: string): string {
  return Object.prototype.hasOwnProperty.call(ETIQUETAS_DE_LOS_MOTIVOS, motivo)
    ? ETIQUETAS_DE_LOS_MOTIVOS[motivo as ReturnReason]
    : motivo;
}
