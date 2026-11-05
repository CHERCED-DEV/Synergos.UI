import { Injectable, inject, signal } from '@angular/core';
import { TEXTOS_DE_SALUD } from '../comun/textos';
import { darElPermiso, retirarElPermiso } from './permiso-api.client';

const SIN_PERMISO: ReadonlySet<string> = new Set(['consent.not_granted', 'consent.revoked', 'consent.expired']);

/** Si un rechazo de la cita es que falta el permiso de datos de salud: no se dio, se retiró o venció. */
export function faltaElPermiso(code: string | null | undefined): boolean {
  return SIN_PERMISO.has(code ?? '');
}

/** Una llave nueva para una intención: la de darle o retirarle el permiso. */
const nuevaLlave = (): string => globalThis.crypto.randomUUID();

/**
 * El permiso de datos de salud del miembro de la sesión (T048-T050), con la receta de la tienda (T051): la fachada lleva el
 * estado y los casos de uso; la vista sólo lo pinta. Una por elemento: cada portal de la página tiene el suyo. Sus textos
 * los provee la app (`TEXTOS_DE_SALUD`), con la sección `Health.Consent` del diccionario.
 */
@Injectable()
export class PermisoDeSalud {
  readonly #textos = inject(TEXTOS_DE_SALUD);
  readonly textos = this.#textos.permiso;
  readonly moviendo = signal(false);
  /** Lo que quedó de la última acción sobre el permiso: darlo o retirarlo. */
  readonly aviso = signal('');
  /** La llave de la intención de darlo: la misma hasta que se da, así un doble clic o un reintento no da dos. */
  #llave = '';

  /** Da el permiso por la puerta. Devuelve si quedó dado; si no, el aviso dice por qué. */
  async dar(desde: Element): Promise<boolean> {
    if (this.moviendo()) {
      return false;
    }
    this.#llave ||= nuevaLlave();
    this.moviendo.set(true);
    this.aviso.set('');
    const r = await darElPermiso(desde, this.#llave);
    this.moviendo.set(false);
    if (!r.ok) {
      this.aviso.set(this.#textos.mensajeDeLaCita(r.rechazo.code));
      return false;
    }
    this.#llave = '';
    this.aviso.set(this.textos.dado);
    return true;
  }

  /**
   * Retira el permiso por la puerta, cuando quiera el paciente. Uno que nunca se dio es el mismo resultado para quien lo
   * pide: no queda ninguno vigente.
   */
  async retirar(desde: Element): Promise<void> {
    if (this.moviendo()) {
      return;
    }
    this.moviendo.set(true);
    this.aviso.set('');
    const r = await retirarElPermiso(desde, nuevaLlave());
    this.moviendo.set(false);
    this.aviso.set(
      r.ok || r.rechazo.code === 'consent.not_granted' ? this.textos.retirado : this.#textos.mensajeDeLaCita(r.rechazo.code),
    );
  }
}
