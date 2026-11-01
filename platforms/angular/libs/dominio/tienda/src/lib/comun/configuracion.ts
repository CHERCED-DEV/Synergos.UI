import { Injectable, computed, signal, type Signal } from '@angular/core';

/** Lo que el elemento lee del bloque del CMS y la fachada necesita. */
export interface FuentesDeLaTienda {
  /** Dónde vive la API, sin la barra final. */
  readonly apiBase: Signal<string>;
  /** La zona horaria del sitio, en la que se leen las fechas de «Mis compras». */
  readonly zonaHoraria: Signal<string>;
}

/**
 * La configuración de UNA tienda en la página (014-despiece-tienda, T008). No la decide la fachada: la declara el CMS
 * en el bloque, la lee el elemento de sus entradas y la conecta aquí. Sin conectar, la base está vacía y nada llama al
 * borde (ADR 0137): cada lectura degrada a su muestra, visible.
 */
@Injectable()
export class ConfiguracionDeLaTienda {
  readonly #fuentes = signal<FuentesDeLaTienda | null>(null);

  readonly apiBase = computed(() => this.#fuentes()?.apiBase() ?? '');
  readonly zonaHoraria = computed(() => this.#fuentes()?.zonaHoraria() ?? '');

  conectar(fuentes: FuentesDeLaTienda): void {
    this.#fuentes.set(fuentes);
  }
}
