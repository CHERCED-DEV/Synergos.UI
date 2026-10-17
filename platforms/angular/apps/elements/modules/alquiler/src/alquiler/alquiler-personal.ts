import type { RentalAgreement } from './alquiler.model';

/**
 * La cara del personal del alquiler (T035; decisión 5 del lote 1): quien recibe el equipo confirma la devolución que
 * declaró quien alquiló, con el daño que haya, o cancela un alquiler con la penalidad que fije.
 *
 * <p>Aquí sólo está lo que se puede decir sin pantalla: cuánto lleva esperando una devolución y cómo se leen los
 * montos que teclea el personal. Lo que se puede hacer lo decide el servidor —el rol, el tope de la garantía, la
 * retención que venció— y su rechazo se dice por su código.</p>
 */

/** Cuántos días enteros lleva declarada una devolución; `null` si no consta cuándo se declaró. */
export function diasEsperando(a: RentalAgreement, ahora: Date): number | null {
  const declarada = Date.parse(a.declaredUtc);
  if (Number.isNaN(declarada)) return null;
  return Math.max(0, Math.floor((ahora.getTime() - declarada) / 86_400_000));
}

/**
 * Un monto que tecleó el personal, en pesos enteros (la garantía y el daño del alquiler son COP sin centavos, #204):
 * vacío es cero; «50000» y «50.000» son cincuenta mil —en es-CO el punto es de MILES—. Cualquier otra forma
 * («50,5», «1.234,5», «5.00», un negativo) es `null` y no se manda: adivinar ahí cobraría otra cifra.
 */
export function montoTecleado(valor: string): number | null {
  const limpio = valor.trim();
  if (limpio === '') return 0;
  if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(limpio)) return null;
  return Number(limpio.replace(/\./g, ''));
}
