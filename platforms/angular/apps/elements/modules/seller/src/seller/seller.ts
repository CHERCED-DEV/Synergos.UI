import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, ViewEncapsulation } from '@angular/core';
import { type SellerProps } from '@synergos/contracts';
import { HostIdentityService } from '@synergos/core';
import { type SellerPublishReceipt } from '@synergos/dominio/tienda';
import {
  BadgeComponent,
  ButtonComponent,
  coerceRutasDeLasVistas,
  coerceStringEnumInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  LiveRegionComponent,
  omitUndefinedProperties,
  resolveConfigValue,
  SynEmptyStateComponent,
} from '@synergos/shared';
import { DespachoDeLaConsola } from './estado/despacho';
import { EstadoDeLaConsola } from './estado/estado-de-la-consola';
import { PresentacionDeLaConsola } from './estado/presentacion';
import { ReembolsosDeLaConsola } from './estado/reembolsos';
import { type SellerView, VISTAS_DE_LA_CONSOLA } from './vistas-de-la-consola';
import { ConsolaMensajesComponent } from './vistas/mensajes/mensajes';
import { ConsolaPanelComponent } from './vistas/panel/panel';
import { ConsolaPublicarComponent } from './vistas/publicar/publicar';

/**
 * Runtime config for the CMS element <c>elementSynSeller</c>.
 *
 * Seller console — the Tienda **cara B** (Ola 1 doc 21, entrega B) built as the
 * first consumer of the back-office rungs of `@synergos/shells`: SH-5
 * `syn-console-shell` (KPIs + colas Ventas/Publicaciones/Devoluciones +
 * Reputación), SH-6 `syn-authoring-wizard` (publicar producto con borrador
 * persistente) and SH-7 `syn-message-center` (preguntas/mensajes de
 * compradores). The component only contributes domain data, templates and API
 * wiring — the shells stay domain-free (contrato D3).
 *
 * El `config` que manda el CMS tiene la forma de `SellerProps`, GENERADO del record C# (ADR 0135):
 * lo del editor y dónde vive la API para el sitio, que sale de `Synergos:Features:Seller` y el
 * editor no ve (ADR 0137, CMS#196). La moneda no es configuración: llega con cada precio. Lo que
 * sólo entraba por el JSON libre queda como atributo del tag crudo con su valor del componente.
 */
export type SellerConfig = Partial<SellerProps>;
const DEFAULT_HEADING = 'Centro de vendedores';
/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeSellerConfig(value: SellerConfig): SellerConfig {
  return omitUndefinedProperties<SellerProps>({
    heading: coerceTrimmedStringInput(value.heading),
    subheading: coerceTrimmedStringInput(value.subheading),
    apiBase: coerceTrimmedStringInput(value.apiBase),
    lecturasBase: coerceTrimmedStringInput(value.lecturasBase),
    zonaHoraria: coerceTrimmedStringInput(value.zonaHoraria),
    vista: coerceStringEnumInput(value.vista, VISTAS_DE_LA_CONSOLA),
    rutas: coerceRutasDeLasVistas(value.rutas),
  });
}
let sellerInstanceId = 0;

@Component({
  selector: 'sg-seller',
  standalone: true,
  imports: [ConsolaPanelComponent, ConsolaPublicarComponent, ConsolaMensajesComponent, ButtonComponent, BadgeComponent, LiveRegionComponent, SynEmptyStateComponent],
  templateUrl: './seller.html',
  styleUrl: './seller.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Sin encapsulación (014-despiece-tienda, T011): la hoja de la consola pinta también sus vistas, que son sus
  // componentes hijos. Sus clases van con el prefijo `seller__` y su anfitrión con `.sg-seller`.
  encapsulation: ViewEncapsulation.None,
  host: { class: 'sg-seller' },
  // El estado de la consola, uno por elemento.
  providers: [EstadoDeLaConsola, DespachoDeLaConsola, ReembolsosDeLaConsola, PresentacionDeLaConsola],
})
export class SellerElementComponent implements OnInit {
  protected readonly estado = inject(EstadoDeLaConsola);
  protected readonly presentacion = inject(PresentacionDeLaConsola);

  readonly #identity = inject(HostIdentityService);

  // ─── Config inputs (object + flat aliases) ─────────────────────────────────
  readonly config = input<SellerConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SellerProps>(sanitizeSellerConfig),
  });

  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });

  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });

  readonly subheadingInput = input<string | undefined>(undefined, { alias: 'subheading' });

  /**
   * Dónde vive la API. Sin ella no se llama a nada y cada lectura dice que no se pudo (con la marca
   * de la demo, enseña su muestra y lo dice): no hay una base de respaldo compilada (ADR 0137).
   */
  readonly apiBase = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.apiBaseInput()), this.config()?.apiBase, '').replace(
      /\/+$/,
      '',
    ),
  );

  /**
   * Dónde viven las lecturas genéricas (014-despiece-tienda, I4). La declara el CMS; sin ella, la bandeja va a su ruta
   * interina de `apiBase`.
   */
  readonly lecturasBase = computed(() => (this.config()?.lecturasBase ?? '').replace(/\/+$/, ''));

  /**
   * Quién atiende la consola: el miembro de la SESIÓN (CMS#197). Era `sellerName`, que sólo
   * entraba por el JSON libre del editor —un nombre escrito a mano en la página, el mismo para
   * todo vendedor que la abriera—. Sin host o sin sesión, vacío: el chip no se pinta, como
   * hasta ahora sin el atributo.
   */
  readonly sellerName = this.#identity.displayName;

  readonly heading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.headingInput()),
      this.config()?.heading,
      DEFAULT_HEADING,
    ),
  );

  /**
   * El subtítulo que escribe el editor (CMS#196: viajaba y nadie lo pintaba). Sin texto por defecto:
   * si el editor no escribió nada, no se pinta un párrafo vacío.
   */
  readonly subheading = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.subheadingInput()), this.config()?.subheading, ''),
  );

  /** La zona en que se dicen las fechas: la del sitio (la de los listados), que manda el CMS. */
  readonly zonaHoraria = computed(() => this.config()?.zonaHoraria ?? '');

  /** Qué parte de la consola es esta página (014-despiece-tienda, I3): la que eligió el editor; sin elegir, el panel. */
  readonly vista = computed<SellerView>(() => (this.config()?.vista as SellerView | undefined) ?? 'panel');

  /** En qué página del sitio vive cada vista: la declara el CMS. Sin rutas, todo se abre en esta página. */
  readonly rutas = computed(() => this.config()?.rutas ?? []);

  readonly instanceId = (sellerInstanceId += 1);

  readonly fieldId = `syn-seller-${this.instanceId}`;

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly productpublished = output<SellerPublishReceipt>();

  constructor() {
    this.estado.conectar({
      apiBase: () => this.apiBase(),
      lecturasBase: () => this.lecturasBase(),
      zonaHoraria: () => this.zonaHoraria(),
      vista: () => this.vista(),
      rutas: () => this.rutas(),
      publicado: (recibo) => this.productpublished.emit(recibo),
    });
  }

  /**
   * Abre en el panel (KPIs y cola de ventas) contra la API del sitio.
   *
   * No va en el constructor: en un custom element los inputs —el `config` del CMS— se aplican
   * DESPUÉS de crear el componente y ANTES del primer ciclo, así que el constructor los ve vacíos
   * (el defecto que el piloto de la ADR 0137 encontró en `eventos`, CMS#194).
   */
  ngOnInit(): void {
    this.estado.abrirLaVistaDeLaPagina();
    void this.estado.loadSummary();
    void this.estado.loadOrders();
  }

  /**
   * Login del CMS de vuelta a ESTA página (la forma de la tienda y de reserva). Método y no
   * `computed`: la URL cambia con la navegación.
   */
  loginUrl(): string {
    if (typeof window === 'undefined') {
      return '/account/login';
    }
    const aqui = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return `/account/login?returnUrl=${encodeURIComponent(aqui)}`;
  }
}
