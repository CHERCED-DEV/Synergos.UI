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

const SESION = new Set(['puerta.sesion_requerida', 'cliente.redirigido']);

const NO_DISPONIBLE = new Set([
  'puerta.flujo_no_disponible',
  'puerta.operacion_desconocida',
  'eventos.artefacto_no_disponible',
  'cliente.sin_coordinador',
  'cliente.flujo_desconocido',
  'cliente.protocolo_distinto',
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
