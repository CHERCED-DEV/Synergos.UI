import { esRegistro, leerNumero, leerTexto } from '../http/borde';
import { lista, presente } from './comun';

/** La bandeja de las lecturas genéricas (`GET api/lecturas/{vertical}/mensajes`). */

/** Un mensaje de un hilo. `mio`: lo escribió quien lee. */
export interface MensajeDelHilo {
  readonly id: string;
  readonly de: string;
  readonly mio: boolean;
  readonly texto: string;
  readonly fecha: string;
}

/** Un hilo de la bandeja del vertical. */
export interface HiloDeLaBandeja {
  readonly id: string;
  readonly contexto: string;
  readonly asunto: string;
  readonly contraparte: string;
  readonly ultimo: string;
  readonly fecha: string;
  readonly cantidad: number;
  readonly mensajes: readonly MensajeDelHilo[];
}

/** Un mensaje de un hilo de la bandeja, o `null` si no tiene `id`. */
export function leerMensajeDelHilo(value: unknown): MensajeDelHilo | null {
  if (!esRegistro(value)) {
    return null;
  }
  const id = leerTexto(value['id']).trim();
  if (!id) {
    return null;
  }
  return {
    id,
    de: leerTexto(value['de']).trim(),
    mio: value['mio'] === true,
    texto: leerTexto(value['texto']).trim(),
    fecha: leerTexto(value['fecha']).trim(),
  };
}

/** Un hilo de la bandeja, o `null` si no tiene `id`. */
export function leerHiloDeLaBandeja(value: unknown): HiloDeLaBandeja | null {
  if (!esRegistro(value)) {
    return null;
  }
  const id = leerTexto(value['id']).trim();
  if (!id) {
    return null;
  }
  return {
    id,
    contexto: leerTexto(value['contexto']).trim(),
    asunto: leerTexto(value['asunto']).trim(),
    contraparte: leerTexto(value['contraparte']).trim(),
    ultimo: leerTexto(value['ultimo']).trim(),
    fecha: leerTexto(value['fecha']).trim(),
    cantidad: Math.trunc(leerNumero(value['cantidad'])),
    mensajes: lista(value['mensajes']).map(leerMensajeDelHilo).filter(presente),
  };
}

/** Los hilos de la bandeja del vertical, o `null` si la respuesta no lo es (no trae `hilos`). */
export function leerBandejaDelVertical(value: unknown): readonly HiloDeLaBandeja[] | null {
  if (!esRegistro(value) || !Array.isArray(value['hilos'])) {
    return null;
  }
  return value['hilos'].map(leerHiloDeLaBandeja).filter(presente);
}
