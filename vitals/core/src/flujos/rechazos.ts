import { RECHAZOS_DE_LOS_FLUJOS, type RechazosDelFlujo } from './rechazos-de-los-flujos';
import type { RechazoDelFlujo } from './transporte';

/**
 * La CLASE de un rechazo, que es lo que decide qué hace la pantalla cuando no hay un texto para su
 * `code`:
 *  - `sesion` — falta (o venció) la sesión: el panel de iniciar sesión, no un error;
 *  - `reintentable` — transitorio: se reintenta con la misma llave o el mismo id;
 *  - `no_disponible` — la compra no está abierta aquí (sin coordinador, sin puerta, sin artefacto);
 *  - `defecto` — algo que la persona no provocó ni puede arreglar (un rechazo propio de la puerta
 *    o del cliente, una respuesta sin forma);
 *  - `negado` — el negocio dijo que no (agotado, fuera de venta, pago rechazado).
 *
 * Se clasifica por `code` y `transient`, NUNCA por `title` (la puerta pone la frase HTTP) ni por el
 * estado (503 `puerta.flujo_no_disponible` llega con `transient: false`: no se reintenta).
 * Traducir no es de aquí: la funcionalidad hace los `t()` literales (ADR 0136, las hojas reciben
 * strings) y se los pasa ya traducidos a `elegirMensaje`.
 */
export type ClaseDeRechazo = 'sesion' | 'reintentable' | 'no_disponible' | 'defecto' | 'negado';

/**
 * Los códigos genéricos —de la puerta y del cliente, ninguno de un vertical— que tienen clase propia.
 * Los de cada vertical van declarados por flujo en `RECHAZOS_DE_LOS_FLUJOS` (núcleo N3).
 */
export const RECHAZOS_GENERICOS = {
  sesion: ['puerta.sesion_requerida', 'cliente.redirigido'],
  noDisponible: [
    'puerta.flujo_no_disponible',
    'puerta.operacion_desconocida',
    'cliente.sin_coordinador',
    'cliente.flujo_desconocido',
    'cliente.protocolo_distinto',
  ],
} as const;

const SESION = new Set<string>(RECHAZOS_GENERICOS.sesion);

const NO_DISPONIBLE = new Set<string>([
  ...RECHAZOS_GENERICOS.noDisponible,
  ...Object.values<RechazosDelFlujo>(RECHAZOS_DE_LOS_FLUJOS).flatMap((r) => r.noDisponible),
]);

export function clasificarRechazo(r: RechazoDelFlujo): ClaseDeRechazo {
  if (SESION.has(r.code)) return 'sesion';
  if (r.transient) return 'reintentable';
  if (NO_DISPONIBLE.has(r.code)) return 'no_disponible';
  if (r.code.startsWith('puerta.') || r.code.startsWith('cliente.') || r.origen === 'forma') return 'defecto';
  return 'negado';
}

/** El texto por `code` si la funcionalidad lo tiene; si no, el de su clase (los códigos no se enumeran todos). */
export function elegirMensaje(
  r: RechazoDelFlujo,
  porCodigo: Readonly<Record<string, string>>,
  porClase: Readonly<Record<ClaseDeRechazo, string>>,
): string {
  return Object.prototype.hasOwnProperty.call(porCodigo, r.code) ? (porCodigo[r.code] as string) : porClase[clasificarRechazo(r)];
}
