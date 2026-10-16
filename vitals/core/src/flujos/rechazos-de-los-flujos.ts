import type { Flujo } from './puerta';

/**
 * Lo que un vertical dice de SUS códigos de rechazo, por flujo (núcleo N3): cuáles significan «no está
 * abierto aquí» —se pinta como `no_disponible`— y no «el negocio dijo que no».
 *
 * Antes vivían en `rechazos.ts`, mezclados con los de la puerta y el cliente, y el siguiente vertical
 * tenía que tocar la clasificación genérica para declarar los suyos. Un código va con el espacio de su
 * vertical (`eventos.…` en `eventos.compra`): lo vigila `rechazos-de-los-flujos.spec.ts`.
 */
export interface RechazosDelFlujo {
  readonly noDisponible: readonly string[];
}

export const RECHAZOS_DE_LOS_FLUJOS = {
  'eventos.compra': { noDisponible: ['eventos.artefacto_no_disponible'] },
} as const satisfies Readonly<Partial<Record<Flujo, RechazosDelFlujo>>>;
