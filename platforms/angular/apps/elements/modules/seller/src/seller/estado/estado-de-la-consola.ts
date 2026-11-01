import { computed, inject, Injectable, signal } from '@angular/core';
import {
  type BandejaDeLaTienda,
  BandejaDelPersonalApi,
  type DevolucionDeLaTienda,
  DevolucionesDelPersonalApi,
  type EtapaDelDespacho,
  ETAPAS_DEL_DESPACHO,
  type LecturaDeLaConsola,
  MensajesDelVendedorApi,
  PublicacionesDelVendedorApi,
  ResumenDelVendedorApi,
  type SellerKpiMetric,
  type SellerListing,
  type SellerPublishReceipt,
  type SellerReputation,
  type SellerThread,
} from '@synergos/dominio/tienda';
import { type RutaDeUnaVistaDelSitio, t } from '@synergos/vitals-core';
import { type SellerSectionId, type SellerView } from '../vistas-de-la-consola';
import { estaAbierta, type EstadoDeLectura } from './comun-de-la-consola';

/** Las lecturas de la consola, cada una con su estado (013-seller-operaciones, T006). */
type Lectura = 'resumen' | 'ventas' | 'publicaciones' | 'devoluciones' | 'mensajes';

/** Qué lectura llena cada sección del panel: Reputación sale del resumen, como los indicadores. */
const LECTURA_DE_LA_SECCION: Readonly<Record<SellerSectionId, Lectura>> = {
  ventas: 'ventas',
  publicaciones: 'publicaciones',
  devoluciones: 'devoluciones',
  reputacion: 'resumen',
};

const SECTION_IDS: readonly SellerSectionId[] = [
  'ventas',
  'publicaciones',
  'devoluciones',
  'reputacion',
];

/**
 * Lo que el elemento le da a su consola al construirse: la base de la API, la zona del sitio, emitir
 * `productpublished`, y qué vista es esta página y dónde viven las otras (014-despiece-tienda, I3).
 */
export interface ConexionDeLaConsola {
  apiBase(): string;
  zonaHoraria(): string;
  publicado(recibo: SellerPublishReceipt): void;
  vista(): SellerView;
  rutas(): readonly RutaDeUnaVistaDelSitio[];
}

/** El estado de la consola: lo que se leyó de cada sección y cómo, la vista y la sección abiertas, y las lecturas que lo cargan. (014-despiece-tienda, T011) */
@Injectable()
export class EstadoDeLaConsola {
  readonly #resumen = inject(ResumenDelVendedorApi);
  readonly #bandeja = inject(BandejaDelPersonalApi);
  readonly #publicaciones = inject(PublicacionesDelVendedorApi);
  readonly #devolucionesApi = inject(DevolucionesDelPersonalApi);
  readonly #mensajes = inject(MensajesDelVendedorApi);

  #conexion: ConexionDeLaConsola | null = null;

  /** El elemento se conecta al construirse. */
  conectar(conexion: ConexionDeLaConsola): void {
    this.#conexion = conexion;
  }

  apiBase(): string {
    return this.#conexion?.apiBase() ?? '';
  }

  zonaHoraria(): string {
    return this.#conexion?.zonaHoraria() ?? '';
  }

  /** Una publicación que el servidor confirmó: el elemento la anuncia a su página. */
  publicado(recibo: SellerPublishReceipt): void {
    this.#conexion?.publicado(recibo);
  }

  // ─── Top-level router (3 vistas) ───────────────────────────────────────────
  readonly view = signal<SellerView>('panel');

  // ─── Top-level navigation ──────────────────────────────────────────────────
  /** Abre la vista que el editor eligió para esta página (014-despiece-tienda, I3). */
  abrirLaVistaDeLaPagina(): void {
    const vista = this.#conexion?.vista() ?? 'panel';
    if (vista !== this.view()) {
      this.goTo(vista);
    }
  }

  /** La URL de la página donde vive `view`; vacía si se abre en ESTA página: es la suya, o el sitio no le dio otra. */
  urlDe(view: SellerView): string {
    if (view === (this.#conexion?.vista() ?? 'panel')) {
      return '';
    }
    return this.#conexion?.rutas().find((ruta) => ruta.vista === view)?.url ?? '';
  }

  /** Pulsar una pestaña: con `href`, el navegador ya va a su página; sin él, la vista se abre aquí. */
  alPulsar(view: SellerView): void {
    if (!this.urlDe(view)) {
      this.goTo(view);
    }
  }

  goTo(view: SellerView): void {
    const pagina = typeof window === 'undefined' ? '' : this.urlDe(view);
    if (pagina) {
      window.location.assign(pagina);
      return;
    }
    this.view.set(view);
    if (view === 'mensajes') {
      void this.loadThreads();
    }
  }

  // ─── Data (from the API; the samples only behind MUESTRAS_DE_LA_CONSOLA) ───
  readonly kpiMetrics = signal<readonly SellerKpiMetric[]>([]);

  readonly reputation = signal<SellerReputation | null>(null);

  /**
   * La bandeja del personal (013-seller-operaciones, T012): una página de los pedidos pagados de la tienda entera,
   * filtrada y paginada en el servidor, con las cuentas de la tienda. Antes «Ventas» leía `GET orders`, que es «Mis
   * compras» del comprador: el personal veía sus propias compras como ventas.
   */
  readonly bandeja = signal<BandejaDeLaTienda | null>(null);

  readonly pedidos = computed(() => this.bandeja()?.pedidos ?? []);

  /** Cuántos pedidos hay con el filtro, en todas las páginas; sin bandeja, el shell cuenta sus filas. */
  readonly totalDeLaBandeja = computed(() => this.bandeja()?.total ?? null);

  readonly paginaDeVentas = signal(1);

  /** Cuántas veces se pidió la bandeja: una respuesta que llega tarde (otro filtro u otra página) no se pinta. */
  bandejaPedida = 0;

  readonly listings = signal<readonly SellerListing[]>([]);

  /** La cola de devoluciones de la tienda entera, en el orden del servidor (013-seller-operaciones, T025). */
  readonly devoluciones = signal<readonly DevolucionDeLaTienda[]>([]);

  readonly threads = signal<readonly SellerThread[]>([]);

  /**
   * Cómo quedó cada lectura (013-seller-operaciones, T006). Reemplaza los `*Loaded`/`*Loading` y el
   * `degraded` del cliente: «cargó o no» no alcanzaba para no mentir. Una lista vacía, una sesión
   * vencida, un miembro que no es del personal y un servidor caído se pintaban igual: con los
   * ejemplos y su cartel.
   */
  readonly lecturas = signal<Readonly<Record<Lectura, EstadoDeLectura>>>({
    resumen: 'sin-cargar',
    ventas: 'sin-cargar',
    publicaciones: 'sin-cargar',
    devoluciones: 'sin-cargar',
    mensajes: 'sin-cargar',
  });

  // ─── SH-5 console: sections + KPIs + rows ──────────────────────────────────
  readonly activeSection = signal<SellerSectionId>('ventas');

  readonly sectionFilter = signal('todas');

  readonly lecturaActiva = computed(() => LECTURA_DE_LA_SECCION[this.activeSection()]);

  /** El aviso de las compras que el servidor no alcanzó a confirmar en esta lectura. */
  readonly avisoSinConciliar = computed(() => {
    const n = this.bandeja()?.sinConciliar ?? 0;
    return n > 0
      ? t('Seller.Operaciones.Unreconciled', '{n} compras recientes todavía no se confirman aquí: vuelve a cargar en un momento.', { n })
      : '';
  });

  readonly openReturnsCount = computed(
    () =>
      this.devoluciones().filter((d) => estaAbierta(d.estado)).length,
  );

  readonly unreadCount = computed(() => this.threads().filter((thread) => thread.unread).length);

  /**
   * La moneda de lo que se muestra: la que trae cada precio de la API. No es configuración: sería
   * una segunda fuente para un dato del precio. Sin datos todavía, vacía (`formatPrice` pinta el
   * número solo).
   */
  readonly currency = computed(() => this.pedidos()[0]?.moneda || this.listings()[0]?.currency || '');

  /** Alguna lectura enseña ejemplos: sólo pasa con la marca de la demo, y entonces se dice. */
  readonly muestras = computed(() => Object.values(this.lecturas()).includes('muestras'));

  /**
   * Lo que cierra la consola entera. Sin sesión o sin permiso no es de una sección —es de quien
   * la abre—, así que se dice una vez, en lugar de las vistas: con su salida (iniciar sesión), o
   * sin ninguna (no es del personal).
   */
  readonly acceso = computed<'sin-sesion' | 'sin-permiso' | null>(() => {
    const estados = Object.values(this.lecturas());
    if (estados.includes('sin-sesion')) {
      return 'sin-sesion';
    }
    return estados.includes('sin-permiso') ? 'sin-permiso' : null;
  });

  /** La lectura todavía no contestó (o no se pidió): la superficie pinta su esqueleto. */
  enVuelo(lectura: Lectura): boolean {
    const estado = this.lecturas()[lectura];
    return estado === 'sin-cargar' || estado === 'cargando';
  }

  /**
   * Lo que una ESCRITURA no consiguió, dicho donde el vendedor lo ve (#77).
   *
   * Es distinto del cartel de `muestras()`, y por eso no se reusa: aquél dice «estás viendo
   * datos de ejemplo» sobre LECTURAS, sólo con la marca de la demo; esto dice «lo que acabás de
   * pedir no ocurrió». Meter las dos cosas en el mismo cartel haría que la segunda se leyera
   * como la primera, que es de lo que quien publica un producto no se entera.
   */
  readonly actionError = signal<string | null>(null);

  // ─── Data loading ──────────────────────────────────────────────────────────
  loadSummary(): Promise<void> {
    return this.leer('resumen', () => this.#resumen.summary(this.apiBase()), (summary) => {
      this.kpiMetrics.set(summary.kpis);
      this.reputation.set(summary.reputation);
    });
  }

  /**
   * La bandeja, con el filtro y la página de ahora. Siempre se vuelve a pedir —un filtro, una página, «Reintentar» o
   * un acto son otra lectura—, y la que llega tarde no se pinta: con dos filtros seguidos, la respuesta del primero
   * dejaría filas de una etapa bajo el chip de otra.
   */
  async loadOrders(): Promise<void> {
    const pedida = ++this.bandejaPedida;
    const etapa = (ETAPAS_DEL_DESPACHO as readonly string[]).includes(this.sectionFilter())
      ? (this.sectionFilter() as EtapaDelDespacho)
      : null;
    this.marcar('ventas', 'cargando');
    let resultado: LecturaDeLaConsola<BandejaDeLaTienda>;
    try {
      resultado = await this.#bandeja.pedidos(this.apiBase(), etapa, this.paginaDeVentas());
    } catch {
      resultado = { tipo: 'caida' };
    }
    if (pedida !== this.bandejaPedida) {
      return;
    }
    if (resultado.tipo === 'leidas' || resultado.tipo === 'vacia' || resultado.tipo === 'muestras') {
      this.bandeja.set(resultado.datos);
    }
    this.marcar('ventas', resultado.tipo);
  }

  loadListings(): Promise<void> {
    return this.leer('publicaciones', () => this.#publicaciones.listings(this.apiBase(), this.currency()), (listings) =>
      this.listings.set(listings),
    );
  }

  loadReturns(): Promise<void> {
    return this.leer('devoluciones', () => this.#devolucionesApi.devoluciones(this.apiBase()), (devoluciones) =>
      this.devoluciones.set(devoluciones),
    );
  }

  loadThreads(): Promise<void> {
    return this.leer('mensajes', () => this.#mensajes.threads(this.apiBase()), (threads) => this.threads.set(threads));
  }

  /**
   * Pide una lectura y deja dicho cómo quedó. No vuelve a pedir lo que ya contestó con datos ni lo
   * que está en vuelo; lo demás —sin pedir, caída, sin sesión, sin permiso— sí, que es lo que hace
   * «Reintentar». Un fallo que el cliente no esperaba es una caída, no un esqueleto eterno.
   */
  async leer<T>(
    lectura: Lectura,
    pedir: () => Promise<LecturaDeLaConsola<T>>,
    guardar: (datos: T) => void,
  ): Promise<void> {
    if (this.lecturas()[lectura] === 'cargando' || this.cargada(lectura)) {
      return;
    }
    this.marcar(lectura, 'cargando');
    let resultado: LecturaDeLaConsola<T>;
    try {
      resultado = await pedir();
    } catch {
      resultado = { tipo: 'caida' };
    }
    if (resultado.tipo === 'leidas' || resultado.tipo === 'vacia' || resultado.tipo === 'muestras') {
      guardar(resultado.datos);
    }
    this.marcar(lectura, resultado.tipo);
  }

  /** La lectura ya contestó con datos: leídos, vacíos o, con la marca, de ejemplo. */
  cargada(lectura: Lectura): boolean {
    const estado = this.lecturas()[lectura];
    return estado === 'leidas' || estado === 'vacia' || estado === 'muestras';
  }

  marcar(lectura: Lectura, estado: EstadoDeLectura): void {
    this.lecturas.update((estados) => ({ ...estados, [lectura]: estado }));
  }

  /** «Reintentar»: vuelve a pedir una lectura que no se pudo leer. */
  recargar(lectura: Lectura): void {
    switch (lectura) {
      case 'resumen':
        void this.loadSummary();
        return;
      case 'ventas':
        void this.loadOrders();
        return;
      case 'publicaciones':
        void this.loadListings();
        return;
      case 'devoluciones':
        void this.loadReturns();
        return;
      case 'mensajes':
        void this.loadThreads();
        return;
    }
  }

  // ─── SH-5 wiring ───────────────────────────────────────────────────────────
  onSectionChange(sectionId: string): void {
    const section = (SECTION_IDS as readonly string[]).includes(sectionId)
      ? (sectionId as SellerSectionId)
      : 'ventas';
    this.activeSection.set(section);
    this.sectionFilter.set('todas');
    if (section === 'ventas') {
      // El shell vuelve a «Todos» al cambiar de sección: la bandeja se vuelve a pedir así, para no pintar la del filtro
      // de antes bajo el chip de «Todos».
      this.paginaDeVentas.set(1);
      void this.loadOrders();
    } else if (section === 'publicaciones') {
      void this.loadListings();
    } else if (section === 'devoluciones') {
      void this.loadReturns();
    }
  }

  onFilterChange(filterKey: string): void {
    this.sectionFilter.set(filterKey);
    if (this.activeSection() === 'ventas') {
      this.paginaDeVentas.set(1);
      void this.loadOrders();
    }
  }

  /** La bandeja pagina en el servidor: otra página es otra lectura. */
  onPageChange(pagina: number): void {
    this.paginaDeVentas.set(pagina);
    void this.loadOrders();
  }
}
