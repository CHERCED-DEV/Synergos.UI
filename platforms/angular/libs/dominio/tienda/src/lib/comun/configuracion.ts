import { Injectable, computed, signal, type Signal } from '@angular/core';
import type { FiltroFijoDelCatalogo } from '../catalogo/filtros-fijos';
import { caminoDeLaCompra, type CaminoDeCompra } from '../compra/compra.model';

/** Lo que el elemento lee del bloque del CMS y la fachada necesita. */
export interface FuentesDeLaTienda {
  /** Dónde vive la API, sin la barra final. */
  readonly apiBase: Signal<string>;
  /**
   * Dónde viven las lecturas genéricas, sin la barra final (014-despiece-tienda, I4): el catálogo, los pedidos, las
   * devoluciones, la lista de deseos, los mensajes y las reseñas con forma neutra de vertical. Vacía, cada lectura va a
   * su ruta interina de `apiBase`, como antes.
   */
  readonly lecturasBase: Signal<string>;
  /** La zona horaria del sitio, en la que se leen las fechas de «Mis compras». */
  readonly zonaHoraria: Signal<string>;
  /** Por dónde compra la tienda, tal como lo declara el CMS (`purchasePath`); sin declarar, la ruta directa. */
  readonly purchasePath: Signal<string | undefined>;
  /** El país al que despacha el sitio (ISO 3166-1 alfa-2): lo declara el CMS, el formulario no lo pregunta. */
  readonly shippingCountry: Signal<string>;
  /**
   * Los filtros fijos del catálogo que declara el bloque (014-despiece-tienda, I5): la página «Ofertas» es el catálogo con
   * `oferta = En oferta`. Sin ninguno, todo el catálogo.
   */
  readonly filtrosFijos: Signal<readonly FiltroFijoDelCatalogo[]>;
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
  readonly lecturasBase = computed(() => this.#fuentes()?.lecturasBase() ?? '');
  readonly zonaHoraria = computed(() => this.#fuentes()?.zonaHoraria() ?? '');
  readonly purchasePath = computed(() => this.#fuentes()?.purchasePath());
  readonly shippingCountry = computed(() => this.#fuentes()?.shippingCountry() ?? '');
  readonly filtrosFijos = computed(() => this.#fuentes()?.filtrosFijos() ?? []);

  /**
   * El camino de la compra que declara el CMS en `purchasePath` (ADR 0140): la puerta o la ruta directa, la de
   * siempre. Sin declaración, la directa.
   */
  readonly caminoDeCompra = computed<CaminoDeCompra>(() => caminoDeLaCompra(this.purchasePath()));

  conectar(fuentes: FuentesDeLaTienda): void {
    this.#fuentes.set(fuentes);
  }
}
