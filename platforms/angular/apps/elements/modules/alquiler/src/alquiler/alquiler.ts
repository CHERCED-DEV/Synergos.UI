import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import {
  SynEmptyStateComponent,
  SynErrorStateComponent,
  SynSkeletonComponent,
  SynStatusBannerComponent,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';
import type { AlquilerProps } from '@synergos/contracts';
import { formatearImporte, t } from '@synergos/vitals-core';
import {
  AlquilerApiClient,
  isRejected,
  isUnauthorized,
} from './alquiler-api.client';
import type {
  EquipmentCard,
  EquipmentDetail,
  Rental,
  RentalAgreement,
  RentalQuote,
} from './alquiler.model';

/**
 * El `config` que manda el CMS tiene la forma de `AlquilerProps`, GENERADO del record C#
 * (ADR 0135): lo del editor y dónde vive la API para el sitio, que sale de
 * `Synergos:Features:Alquiler` y el editor no ve (ADR 0137). La moneda no es configuración:
 * llega con cada importe del catálogo.
 */
export type AlquilerConfig = Partial<AlquilerProps>;

/** En qué pantalla está la app. */
type Vista = 'catalogo' | 'ficha' | 'mios';

/** Lo que la pantalla sabe sobre una lectura que puede no haber llegado. */
type Carga<T> =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'ok'; readonly valor: T }
  | { readonly estado: 'sin-sesion' }
  | { readonly estado: 'error'; readonly mensaje: string };

/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista.
 */
export function sanitizeAlquilerConfig(value: AlquilerConfig): AlquilerConfig {
  return omitUndefinedProperties<AlquilerProps>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    category: coerceTrimmedStringInput(value.category),
    heading: coerceTrimmedStringInput(value.heading),
    subheading: coerceTrimmedStringInput(value.subheading),
  });
}

/**
 * Los textos de la pantalla, del diccionario `Alquiler` que declara `AlquilerProps` (ADR 0136).
 * El respaldo es el es-CO de uSync: es lo que se ve standalone, o si la página no publicó la
 * sección. Los que llevan un dato son métodos del componente, con marcadores con nombre.
 */
function textosDeAlquiler() {
  return {
    secciones: t('Alquiler.Nav.Sections', 'Secciones'),
    equipos: t('Alquiler.Nav.Equipment', 'Equipos'),
    misAlquileres: t('Alquiler.Nav.Mine', 'Mis alquileres'),
    cargandoEquipos: t('Alquiler.Catalog.Loading', 'Cargando equipos'),
    catalogoFallo: t('Alquiler.Catalog.Failed', 'No pudimos leer el catálogo de equipos.'),
    catalogoVacio: t('Alquiler.Catalog.EmptyTitle', 'Todavía no hay equipos publicados'),
    catalogoVacioDetalle: t('Alquiler.Catalog.EmptyMessage', 'Cuando el editor publique el primero, aparece aquí.'),
    porDia: t('Alquiler.Catalog.PerDay', 'por día'),
    verYReservar: t('Alquiler.Catalog.Open', 'Ver y reservar'),
    cargandoFicha: t('Alquiler.Detail.Loading', 'Cargando la ficha'),
    volver: t('Alquiler.Detail.Back', '← Volver'),
    tarifas: t('Alquiler.Detail.Rates', 'Tarifas por duración'),
    desde: t('Alquiler.Form.From', 'Desde'),
    hasta: t('Alquiler.Form.To', 'Hasta'),
    unidades: t('Alquiler.Form.Units', 'Unidades'),
    calculando: t('Alquiler.Form.Quoting', 'Calculando…'),
    calcular: t('Alquiler.Form.Quote', 'Calcular'),
    reservando: t('Alquiler.Quote.Reserving', 'Reservando…'),
    reservar: t('Alquiler.Quote.Reserve', 'Reservar'),
    selloComprobado: t('Alquiler.Seal.Verified', 'Comprobante sellado y comprobado.'),
    selloNoCuadra: t('Alquiler.Seal.Mismatch', 'El sello de este comprobante NO cuadra.'),
    selloSinComprobar: t('Alquiler.Seal.Unverified', 'Comprobante emitido, sello sin comprobar.'),
    cargandoMios: t('Alquiler.Mine.Loading', 'Cargando tus alquileres'),
    sinSesion: t('Alquiler.Mine.SignInTitle', 'Inicia sesión para ver tus alquileres'),
    sinSesionDetalle: t('Alquiler.Mine.SignInMessage', 'Tus contratos van atados a tu cuenta, no a este navegador.'),
    miosFallo: t('Alquiler.Mine.Failed', 'No pudimos leer tus alquileres.'),
    miosVacio: t('Alquiler.Mine.EmptyTitle', 'Todavía no has alquilado nada'),
    miosVacioDetalle: t('Alquiler.Mine.EmptyMessage', 'Cuando reserves un equipo, su contrato aparece aquí.'),
    garantiaNoConsta: t('Alquiler.Mine.DepositUnknown', 'No sabemos si la garantía sigue retenida: escríbenos.'),
    contratoNoCuadra: t('Alquiler.Mine.SealMismatch', 'El sello NO cuadra con lo que dice este contrato.'),
    contratoSinComprobar: t('Alquiler.Mine.SealUnverified', 'Sello sin comprobar.'),
    devolvi: t('Alquiler.Mine.Returned', 'Devolví el equipo'),
    cancelar: t('Alquiler.Mine.Cancel', 'Cancelar'),
  } as const;
}

/**
 * `<synergos-alquiler>` — la app del vertical de alquiler de equipos (#147).
 *
 * <p>Los tres ejes del molde, cada uno en su sitio: el <b>catálogo</b> sale del contenido del
 * CMS (`GET /equipment`), la <b>transacción</b> cruza al orquestador cuando el despliegue lo
 * enciende (`POST /rentals`), y el <b>comprobante</b> se lee de este lado con su sello ya
 * comprobado por el servidor — que es lo que permite que «mis alquileres» siga sirviendo con el
 * orquestador caído.</p>
 *
 * <p><b>Lo que esta app NO hace, dicho en vez de disimulado.</b> No usa `DiscoveryShell`,
 * `DetailShell` ni `CheckoutWizard`, que es como están escritos los siete verticales anteriores:
 * monta markup propio con los cuatro componentes de estado del design system. Es un atajo tomado
 * a conciencia y anotado, que es lo que la HU #147 pide de un atajo — el vertical tiene ocho
 * rutas y tres pantallas, y aprender cinco APIs de shell para eso habría costado más que el
 * vertical entero. Migrarlo es trabajo real y no urgente; lo que NO se podía posponer era que
 * cada ruta del borde tuviera un lector, porque una escritura sin camino de lectura está
 * enterrada, no guardada.</p>
 *
 * <p><b>Y nada se fabrica.</b> Reservar no inventa un identificador cuando el borde no contesta,
 * devolver no inventa un acuse, y el sello de un comprobante se pinta como comprobado sólo si el
 * servidor lo dijo: `verified` en nulo es «no consta» y se ve distinto de «no cuadra».</p>
 */
@Component({
  selector: 'synergos-alquiler',
  standalone: true,
  imports: [
    SynEmptyStateComponent,
    SynErrorStateComponent,
    SynSkeletonComponent,
    SynStatusBannerComponent,
  ],
  templateUrl: './alquiler.html',
  styleUrl: './alquiler.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-alquiler' },
})
export class AlquilerElementComponent implements OnInit {
  readonly #api = inject(AlquilerApiClient);

  // ── Lo que el CMS pasa ─────────────────────────────────────────────────

  readonly config = input<AlquilerConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AlquilerProps>(sanitizeAlquilerConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly categoryInput = input<string | undefined>(undefined, { alias: 'category' });
  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });
  readonly subheadingInput = input<string | undefined>(undefined, { alias: 'subheading' });

  readonly txt = textosDeAlquiler();

  /**
   * Dónde vive la API. Sin ella no se llama a nada y el catálogo dice que no se pudo leer: no
   * hay una base de respaldo compilada (ADR 0137) — la fija cada sitio, no el bloque.
   */
  readonly apiBase = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.apiBaseInput()), this.config()?.apiBase, '').replace(
      /\/+$/,
      '',
    ),
  );
  readonly category = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.categoryInput()), this.config()?.category, ''),
  );
  readonly heading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.headingInput()),
      this.config()?.heading,
      t('Alquiler.Defaults.Heading', 'Alquiler de equipos'),
    ),
  );
  readonly subheading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.subheadingInput()),
      this.config()?.subheading,
      t(
        'Alquiler.Defaults.Subheading',
        'Elige el equipo, las fechas y cuántas unidades. La garantía se retiene, no se cobra.',
      ),
    ),
  );

  // ── Estado de pantalla ─────────────────────────────────────────────────

  readonly vista = signal<Vista>('catalogo');
  readonly catalogo = signal<Carga<readonly EquipmentCard[]>>({ estado: 'cargando' });
  readonly ficha = signal<Carga<EquipmentDetail> | null>(null);
  readonly mios = signal<Carga<readonly RentalAgreement[]> | null>(null);

  readonly desde = signal('');
  readonly hasta = signal('');
  readonly unidades = signal(1);

  readonly cotizacion = signal<RentalQuote | null>(null);
  readonly cotizando = signal(false);
  readonly reservando = signal(false);
  readonly reserva = signal<Rental | null>(null);

  /**
   * Lo que NO se pudo hacer, dicho tal cual.
   *
   * Una escritura que falla no degrada: se conserva lo tecleado y se nombra lo que quedó. Decir
   * «listo» a quien acaba de intentar reservar y no reservó es la invitación a intentarlo otra
   * vez sobre un equipo que nadie apartó.
   */
  readonly problema = signal('');

  readonly puedeCotizar = computed(() => {
    const f = this.ficha();
    if (!f || f.estado !== 'ok') return false;
    const dias = this.dias();
    return dias !== null && dias >= f.valor.minDays && dias <= f.valor.maxDays && this.unidades() >= 1;
  });

  /** Cuántos días pide la ventana, o `null` si todavía no es una ventana. */
  readonly dias = computed<number | null>(() => {
    const d = Date.parse(this.desde());
    const h = Date.parse(this.hasta());
    if (Number.isNaN(d) || Number.isNaN(h) || h <= d) return null;
    return Math.round((h - d) / 86400000);
  });

  // ── Lecturas ───────────────────────────────────────────────────────────

  /**
   * La primera lectura, aquí y no en el constructor: en un custom element las entradas del CMS
   * —la `apiBase` del sitio— llegan después de construirlo y antes de `ngOnInit`. Sin esta
   * llamada nadie pedía el catálogo y la pantalla se quedaba en el esqueleto (UI#96).
   */
  ngOnInit(): void {
    void this.cargarCatalogo();
  }

  /** Carga el catálogo. Es lo primero que la pantalla hace. */
  async cargarCatalogo(): Promise<void> {
    this.catalogo.set({ estado: 'cargando' });
    if (!this.apiBase()) {
      this.catalogo.set({ estado: 'error', mensaje: this.txt.catalogoFallo });
      return;
    }
    try {
      const equipos = await this.#api.equipment(this.apiBase(), this.category());
      this.catalogo.set({ estado: 'ok', valor: equipos });
    } catch {
      // No hay seed de este lado: sin catálogo se dice que no se pudo leer el catálogo.
      this.catalogo.set({ estado: 'error', mensaje: this.txt.catalogoFallo });
    }
  }

  /** Abre la ficha de un equipo. */
  async abrir(equipmentId: string): Promise<void> {
    this.vista.set('ficha');
    this.ficha.set({ estado: 'cargando' });
    this.cotizacion.set(null);
    this.reserva.set(null);
    this.problema.set('');
    try {
      const detalle = await this.#api.detail(this.apiBase(), equipmentId);
      this.ficha.set(
        detalle
          ? { estado: 'ok', valor: detalle }
          : { estado: 'error', mensaje: t('Alquiler.Errors.DetailGone', 'Ese equipo ya no está publicado.') },
      );
      if (detalle) {
        this.unidades.set(1);
      }
    } catch {
      this.ficha.set({
        estado: 'error',
        mensaje: t('Alquiler.Errors.DetailFailed', 'No pudimos leer la ficha del equipo.'),
      });
    }
  }

  /** Mis contratos. Sin sesión NO se enseña una bandeja vacía. */
  async cargarMios(): Promise<void> {
    this.vista.set('mios');
    this.mios.set({ estado: 'cargando' });
    try {
      const contratos = await this.#api.mine(this.apiBase());
      this.mios.set({ estado: 'ok', valor: contratos });
    } catch (error) {
      this.mios.set(
        isUnauthorized(error)
          ? { estado: 'sin-sesion' }
          : { estado: 'error', mensaje: this.txt.miosFallo },
      );
    }
  }

  /** Vuelve al catálogo. */
  volver(): void {
    this.vista.set('catalogo');
    this.ficha.set(null);
    this.problema.set('');
  }

  // ── Escrituras ─────────────────────────────────────────────────────────

  /** Cotiza sin comprometer nada. Su fallo deja la ficha sin precio, no con uno inventado. */
  async cotizar(): Promise<void> {
    const f = this.ficha();
    if (!f || f.estado !== 'ok' || !this.puedeCotizar()) return;

    this.cotizando.set(true);
    this.problema.set('');
    try {
      const quote = await this.#api.quote(
        this.apiBase(), f.valor.equipmentId, this.unidades(), this.desde(), this.hasta(),
      );
      this.cotizacion.set(quote);
      if (!quote) {
        this.problema.set(this.#cotizacionFallo());
      }
    } catch (error) {
      this.cotizacion.set(null);
      this.problema.set(this.porQue(error, this.#cotizacionFallo()));
    } finally {
      this.cotizando.set(false);
    }
  }

  /**
   * Reserva.
   *
   * <b>Nada se da por hecho si el borde no contesta:</b> el formulario se queda como está y el
   * mensaje dice qué NO ocurrió. Repetir es seguro — la llave que manda el cliente es la misma,
   * así que el servidor devuelve la reserva que ya existe en vez de apartar una segunda vez.
   */
  async reservar(): Promise<void> {
    const f = this.ficha();
    if (!f || f.estado !== 'ok' || !this.puedeCotizar()) return;

    this.reservando.set(true);
    this.problema.set('');
    try {
      const rental = await this.#api.reserve(
        this.apiBase(), f.valor.equipmentId, this.unidades(), this.desde(), this.hasta(),
      );
      this.reserva.set(rental);
    } catch (error) {
      this.reserva.set(null);
      this.problema.set(
        this.porQue(
          error,
          t('Alquiler.Errors.ReserveFailed', 'No pudimos reservar el equipo. Vuelve a intentarlo.'),
        ),
      );
    } finally {
      this.reservando.set(false);
    }
  }

  /** Cancela un alquiler antes de que el equipo salga. */
  async cancelar(rentalId: string, penalidad: number): Promise<void> {
    await this.cerrar(rentalId, penalidad, 'cancel');
  }

  /** Registra que el equipo volvió, con el daño que haya. */
  async devolver(rentalId: string, dano: number): Promise<void> {
    await this.cerrar(rentalId, dano, 'return');
  }

  private async cerrar(rentalId: string, monto: number, accion: 'return' | 'cancel'): Promise<void> {
    this.problema.set('');
    try {
      const rental = accion === 'return'
        ? await this.#api.return(this.apiBase(), rentalId, monto)
        : await this.#api.cancel(this.apiBase(), rentalId, monto);
      this.reserva.set(rental);
      await this.cargarMios();
    } catch (error) {
      this.problema.set(
        this.porQue(error, accion === 'return'
          ? t('Alquiler.Errors.ReturnFailed', 'No pudimos registrar la devolución. El alquiler sigue abierto.')
          : t('Alquiler.Errors.CancelFailed', 'No pudimos cancelar el alquiler. Sigue reservado.')),
      );
    }
  }

  /**
   * Qué decirle a quien está delante.
   *
   * Un rechazo de negocio trae su motivo y ése es el que sirve; cualquier otra cosa no se
   * traduce a un mensaje que suene concreto, porque un mensaje concreto sobre una causa que no
   * se conoce manda a alguien a arreglar lo que no está roto.
   */
  private porQue(error: unknown, generico: string): string {
    if (isUnauthorized(error)) {
      return t('Alquiler.Errors.SignInToRent', 'Hay que iniciar sesión para alquilar.');
    }
    if (isRejected(error) && error.detail) {
      return error.detail;
    }
    return generico;
  }

  /** El sello de un comprobante, en las TRES respuestas posibles. */
  sello(a: RentalAgreement): 'comprobado' | 'no-cuadra' | 'sin-comprobar' {
    if (a.verified === true) return 'comprobado';
    if (a.verified === false) return 'no-cuadra';
    return 'sin-comprobar';
  }

  #cotizacionFallo(): string {
    return t('Alquiler.Errors.QuoteFailed', 'No pudimos calcular el valor de esas fechas.');
  }

  // ── Textos con un dato dentro ──────────────────────────────────────────

  /** Un importe con la moneda que trajo ESE dato; sin moneda, el número solo (CMS#196). */
  plata(valor: number, moneda: string): string {
    return formatearImporte(valor, moneda);
  }

  /** «Altura · 8 unidad(es)». */
  meta(e: EquipmentCard): string {
    return t('Alquiler.Catalog.Units', '{categoria} · {unidades} unidad(es)', {
      categoria: e.category,
      unidades: e.units,
    });
  }

  /** Lo que queda retenido, que no se cobra. */
  garantiaRetenida(valor: number, moneda: string): string {
    return t('Alquiler.Catalog.DepositHeld', 'Garantía retenida: {monto}', { monto: this.plata(valor, moneda) });
  }

  /** «desde 7 día(s)», en la tabla de tramos. */
  tramoDesde(dias: number): string {
    return t('Alquiler.Detail.RateFrom', 'desde {dias} día(s)', { dias });
  }

  /** «$ 38.000 / día», en la tabla de tramos. */
  tramoPorDia(valor: number, moneda: string): string {
    return t('Alquiler.Detail.RatePerDay', '{monto} / día', { monto: this.plata(valor, moneda) });
  }

  /** Lo que trae el equipo. */
  incluye(lista: readonly string[]): string {
    return t('Alquiler.Detail.Includes', 'Incluye: {lista}', { lista: lista.join(' · ') });
  }

  /** Lo que hace falta para alquilarlo. */
  requiere(lista: readonly string[]): string {
    return t('Alquiler.Detail.Requires', 'Hace falta: {lista}', { lista: lista.join(' · ') });
  }

  /** La ventana que el equipo admite. */
  limites(eq: EquipmentDetail): string {
    return t('Alquiler.Form.Bounds', 'Entre {min} y {max} día(s).', { min: eq.minDays, max: eq.maxDays });
  }

  /** Cuántos días pide la ventana elegida. */
  pedidos(dias: number): string {
    return t('Alquiler.Form.Asked', 'Pediste {dias}.', { dias });
  }

  /** «7 día(s) × 2 unidad(es) a $ 38.000». */
  lineaDeCotizacion(q: RentalQuote): string {
    return t('Alquiler.Quote.Line', '{dias} día(s) × {unidades} unidad(es) a {monto}', {
      dias: q.days,
      unidades: q.quantity,
      monto: this.plata(q.perDay, q.currency),
    });
  }

  /** La garantía de la cotización, dicha como lo que es: una retención. */
  garantiaDeCotizacion(q: RentalQuote): string {
    return t(
      'Alquiler.Quote.Deposit',
      'Además se RETIENEN {monto} de garantía. No es un cobro: se libera al devolver el equipo.',
      { monto: this.plata(q.deposit, q.currency) },
    );
  }

  /** «Alquiler alq-1». */
  tituloDeReserva(r: Rental): string {
    return t('Alquiler.Done.Title', 'Alquiler {id}', { id: r.rentalId });
  }

  /** «2 unidad(es), del 2026-10-05 al 2026-10-12.» */
  lineaDeReserva(r: Rental): string {
    return t('Alquiler.Done.Line', '{unidades} unidad(es), del {desde} al {hasta}.', {
      unidades: r.quantity,
      desde: r.start,
      hasta: r.end,
    });
  }

  /** «2 unidad(es) · del 2026-10-05 al 2026-10-12», en la bandeja. */
  lineaDeContrato(a: RentalAgreement): string {
    return t('Alquiler.Mine.Line', '{unidades} unidad(es) · del {desde} al {hasta}', {
      unidades: a.quantity,
      desde: a.start,
      hasta: a.end,
    });
  }

  /** El sello comprobado, con el sello a la vista. */
  contratoComprobado(a: RentalAgreement): string {
    return t('Alquiler.Mine.SealVerified', 'Sello comprobado · {sello}', { sello: a.seal });
  }

  /** El identificador estable de una tarjeta, para `@for`. */
  porId(_: number, item: { readonly equipmentId: string }): string {
    return item.equipmentId;
  }

  /** El identificador estable de un contrato, para `@for`. */
  porContrato(_: number, item: RentalAgreement): string {
    return item.rentalId;
  }
}
