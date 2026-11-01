import { esRegistro } from '@synergos/core';
import { ETAPAS_DEL_DESPACHO, type EtapaDelDespacho } from './consola.model';

export function readList(value: unknown, key: string): readonly unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  if (esRegistro(value) && Array.isArray(value[key])) {
    return value[key];
  }
  return null;
}

/**
 * Lo legible de una lista, o `null` si el servidor mandó entradas y no se entendió ninguna: eso es una forma ilegible
 * —una caída—, no una lista vacía. Vacía es sólo la que el servidor mandó sin nada. Sin esto, un contrato que se movió
 * (hoy `GET messages` contesta `threadId` y no `id`) se pintaba como «no tienes mensajes».
 */
export function legibles<T>(recibidas: readonly unknown[], leidas: readonly T[]): readonly T[] | null {
  return recibidas.length > 0 && leidas.length === 0 ? null : leidas;
}

// ─── La bandeja del personal: la forma de `VendedorDeLaTiendaController` (T011) ───

export function textoONulo(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function esEtapa(value: unknown): value is EtapaDelDespacho {
  return typeof value === 'string' && (ETAPAS_DEL_DESPACHO as readonly string[]).includes(value);
}
