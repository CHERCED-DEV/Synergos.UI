import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import {
  type ActoDelDespacho,
  ACTOS_DEL_DESPACHO,
  type DevolucionDeLaTienda,
  ETAPAS_DEL_DESPACHO,
  type MovimientoDeLaDevolucion,
  type SellerListing,
} from '@synergos/dominio/tienda';
import { LiveRegionComponent, StatusTagComponent, SynErrorStateComponent } from '@synergos/shared';
import {
  type ConsoleColumn,
  type ConsoleFilter,
  type ConsoleKpi,
  type ConsoleRowAction,
  type ConsoleRowActionEvent,
  ConsoleShellComponent,
  type ConsoleShellConfig,
} from '@synergos/shells';
import { estaAbierta, PREFIJO_DE_LA_DEVOLUCION, PREFIJO_DEL_ACTO } from '../../estado/comun-de-la-consola';
import { DespachoDeLaConsola } from '../../estado/despacho';
import { EstadoDeLaConsola } from '../../estado/estado-de-la-consola';
import { PresentacionDeLaConsola } from '../../estado/presentacion';
import { ReembolsosDeLaConsola } from '../../estado/reembolsos';
import {
  LISTING_COLUMNS,
  LISTING_FILTERS,
  listingRow,
  MOVIMIENTOS_DESDE,
  ORDER_COLUMNS,
  pedidoRow,
  RETURN_COLUMNS,
  returnRow,
  type SellerRowVm,
} from './filas-del-panel';
import { ConsolaPedidoComponent } from './pedido/pedido';
import { ConsolaReembolsoComponent } from './reembolso/reembolso';

/** El panel de la consola sobre SH-5: los indicadores, las secciones de ventas, publicaciones, devoluciones y reputación, y sus acciones. (014-despiece-tienda, T011) */
@Component({
  selector: 'sg-consola-panel',
  standalone: true,
  imports: [ConsoleShellComponent, LiveRegionComponent, SynErrorStateComponent, StatusTagComponent, ConsolaPedidoComponent, ConsolaReembolsoComponent],
  templateUrl: './panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ConsolaPanelComponent {
  protected readonly despacho = inject(DespachoDeLaConsola);
  protected readonly estado = inject(EstadoDeLaConsola);
  protected readonly presentacion = inject(PresentacionDeLaConsola);
  protected readonly reembolsos = inject(ReembolsosDeLaConsola);

  /**
   * Placeholder metric cards for the reputation skeleton. Three, because the
   * real grid is always hero + exactly three metrics (on-time / claims /
   * answered) — the mould is a fixed shape, not a guess.
   */
  readonly repSkeletonCards = [0, 1, 2];

  readonly consoleConfig = computed<ConsoleShellConfig>(() => ({
    heading: 'Panel',
    navLabel: 'Secciones del panel de vendedor',
    kpisLabel: 'Indicadores del negocio',
    actionsLabel: 'Acciones',
    emptyMessage: this.estado.activeSection() === 'ventas' ? this.presentacion.textoBandejaVacia : 'No hay registros en esta cola.',
    loadingMessage: 'Cargando…',
    // La cola que no se pudo leer lo dice, con su «Reintentar» (`retry`): una cola vacía sería
    // otra respuesta, la que el servidor no dio.
    errorMessage: this.estado.lecturas()[this.estado.lecturaActiva()] === 'caida' ? this.presentacion.textoCaida : undefined,
    sections: [
      { id: 'ventas', label: 'Ventas', badge: this.estado.bandeja()?.cuentas.paid || undefined },
      {
        id: 'publicaciones',
        label: 'Publicaciones',
        badge: this.estado.listings().length || undefined,
      },
      {
        id: 'devoluciones',
        label: 'Devoluciones',
        badge: this.estado.openReturnsCount() || undefined,
      },
      { id: 'reputacion', label: 'Reputación', kind: 'custom' },
    ],
  }));

  /**
   * En Ventas, las cuentas de la bandeja: cuántos pedidos hay en cada etapa en la tienda ENTERA, que no dependen del
   * filtro ni de la página. En las demás secciones, los indicadores del resumen.
   */
  readonly consoleKpis = computed<readonly ConsoleKpi[]>(() => {
    const cuentas = this.estado.bandeja()?.cuentas;
    if (this.estado.activeSection() === 'ventas' && cuentas) {
      return ETAPAS_DEL_DESPACHO.map((etapa) => ({
        id: etapa,
        label: this.presentacion.textoEtapas[etapa],
        value: this.presentacion.formatNumber(cuentas[etapa]),
        trend: 'flat' as const,
      }));
    }
    return this.indicadoresDelResumen();
  });

  private readonly indicadoresDelResumen = computed<readonly ConsoleKpi[]>(() =>
    this.estado.kpiMetrics().map((metric) => ({
      id: metric.id,
      label: metric.label,
      value: this.presentacion.formatKpiValue(metric),
      delta:
        metric.delta === undefined || metric.delta === 0
          ? undefined
          : `${metric.delta > 0 ? '+' : ''}${this.presentacion.formatNumber(metric.delta)} %`,
      trend: metric.delta === undefined || metric.delta === 0 ? 'flat' : metric.delta > 0 ? 'up' : 'down',
      hint: metric.hint,
    })),
  );

  readonly consoleColumns = computed<readonly ConsoleColumn[]>(() => {
    switch (this.estado.activeSection()) {
      case 'publicaciones':
        return LISTING_COLUMNS;
      case 'devoluciones':
        return RETURN_COLUMNS;
      default:
        return ORDER_COLUMNS;
    }
  });

  readonly consoleFilters = computed<readonly ConsoleFilter[]>(() => {
    switch (this.estado.activeSection()) {
      case 'publicaciones':
        return LISTING_FILTERS;
      case 'devoluciones':
        return this.presentacion.filtrosDeDevoluciones;
      case 'reputacion':
        return [];
      default:
        return this.presentacion.filtrosDeVentas;
    }
  });

  /** Reputación pinta su propio esqueleto; las colas, el del shell. */
  readonly sectionLoading = computed(
    () => this.estado.activeSection() !== 'reputacion' && this.estado.enVuelo(this.estado.lecturaActiva()),
  );

  readonly consoleRows = computed<readonly SellerRowVm[]>(() => {
    switch (this.estado.activeSection()) {
      case 'publicaciones':
        return this.filteredListings().map((listing) => listingRow(listing, this.presentacion, this.estado.currency()));
      case 'devoluciones':
        return this.filteredReturns().map((rma) => returnRow(rma, this.presentacion));
      case 'reputacion':
        return [];
      default:
        // La bandeja viene filtrada y paginada del servidor: se pinta tal cual.
        return this.estado.pedidos().map((pedido) => pedidoRow(pedido, this.presentacion));
    }
  });

  /**
   * Per-row actions: only status-appropriate verbs surface. Un pedido ofrece los actos que el servidor pone en `actos`, y
   * ninguno más (T021); mientras uno vuela, en su lugar dice que se está guardando. Su detalle se ve siempre.
   */
  readonly rowActionsFor = (row: SellerRowVm): readonly ConsoleRowAction[] => {
    if (row.kind === 'order' && row.pedido) {
      if (this.despacho.actoEnVuelo() === row.pedido.orderRef) {
        return [this.despacho.accionEnVuelo, this.presentacion.accionDetalle];
      }
      const actos = row.pedido.actos.filter((a): a is ActoDelDespacho => ACTOS_DEL_DESPACHO.includes(a as ActoDelDespacho));
      return [...actos.map((acto) => this.presentacion.accionDelActo[acto]), this.presentacion.accionDetalle];
    }
    if (row.kind === 'return' && row.devolucion) {
      if (this.reembolsos.devolucionEnVuelo() === row.devolucion.rmaId) {
        return [this.despacho.accionEnVuelo];
      }
      return MOVIMIENTOS_DESDE[row.devolucion.estado].map((movimiento) => this.presentacion.accionDeLaDevolucion[movimiento]);
    }
    return [];
  };

  onRowAction(event: ConsoleRowActionEvent<SellerRowVm>): void {
    const row = event.row;
    if (event.actionId.startsWith(PREFIJO_DEL_ACTO) && row.pedido) {
      const acto = event.actionId.slice(PREFIJO_DEL_ACTO.length) as ActoDelDespacho;
      if (acto === 'enviar') {
        this.despacho.abrirEnvio(row.pedido);
      } else {
        void this.despacho.actuar(row.pedido, acto);
      }
      return;
    }
    if (event.actionId === 'detalle' && row.pedido) {
      void this.despacho.abrirDetalle(row.pedido);
      return;
    }
    if (event.actionId.startsWith(PREFIJO_DE_LA_DEVOLUCION) && row.devolucion) {
      const movimiento = event.actionId.slice(PREFIJO_DE_LA_DEVOLUCION.length) as MovimientoDeLaDevolucion;
      if (movimiento === 'refunded') {
        this.reembolsos.abrirReembolso(row.devolucion);
      } else {
        void this.reembolsos.moverDevolucion(row.devolucion, movimiento);
      }
    }
  }

  // ─── Filters (client-side over the API data; la bandeja filtra en el servidor) ─
  private filteredListings(): readonly SellerListing[] {
    const filter = this.estado.sectionFilter();
    const listings = this.estado.listings();
    switch (filter) {
      case 'activas':
        return listings.filter((listing) => listing.status === 'activa');
      case 'pausadas':
        return listings.filter((listing) => listing.status === 'pausada');
      case 'agotadas':
        return listings.filter((listing) => listing.status === 'agotada');
      default:
        return listings;
    }
  }

  private filteredReturns(): readonly DevolucionDeLaTienda[] {
    const devoluciones = this.estado.devoluciones();
    switch (this.estado.sectionFilter()) {
      case 'abiertas':
        return devoluciones.filter((d) => estaAbierta(d.estado));
      case 'resueltas':
        return devoluciones.filter((d) => !estaAbierta(d.estado));
      default:
        return devoluciones;
    }
  }
}
