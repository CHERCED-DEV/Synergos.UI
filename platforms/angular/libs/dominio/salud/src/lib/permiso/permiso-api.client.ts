import { abrirSaludConsentimiento, abrirSaludConsentimientoRetiro, type ResultadoDelFlujo } from '@synergos/vitals-core';

/**
 * Da el permiso de datos de salud del miembro de la sesión (T048-T050): `salud.consentimiento` por la puerta. El cuerpo va
 * vacío a propósito: el titular lo pone la puerta y la versión del texto la declara el CMS como negocio, así que el
 * navegador no elige ni de quién es ni qué texto se aceptó. La llave es la de la intención: un doble clic da un permiso.
 */
export async function darElPermiso(desde: Element, llave: string): Promise<ResultadoDelFlujo<true>> {
  const r = await abrirSaludConsentimiento(desde, { cuerpo: {}, llave });
  return r.ok ? { ...r, valor: true } : r;
}

/** Retira el permiso de datos de salud del miembro de la sesión (`salud.consentimiento-retiro`): un acto propio. */
export async function retirarElPermiso(desde: Element, llave: string): Promise<ResultadoDelFlujo<true>> {
  const r = await abrirSaludConsentimientoRetiro(desde, { cuerpo: {}, llave });
  return r.ok ? { ...r, valor: true } : r;
}
