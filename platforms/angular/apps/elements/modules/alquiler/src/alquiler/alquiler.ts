import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
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

/** La configuración que el CMS le pasa al elemento. */
export interface AlquilerRuntimeConfig {
  readonly apiBase?: string;
  readonly category?: string;
  readonly heading?: string;
  readonly subheading?: string;
  readonly currency?: string;
}

const DEFAULT_API_BASE = '/api/alquiler';
const DEFAULT_CURRENCY = 'COP';

/** En qué pantalla está la app. */
type Vista = 'catalogo' | 'ficha' | 'mios';

/** Lo que la pantalla sabe sobre una lectura que puede no haber llegado. */
type Carga<T> =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'ok'; readonly valor: T }
  | { readonly estado: 'sin-sesion' }
  | { readonly estado: 'error'; readonly mensaje: string };

function sanitizeConfig(value: Partial<AlquilerRuntimeConfig>): Partial<AlquilerRuntimeConfig> {
  return omitUndefinedProperties<AlquilerRuntimeConfig>({
    apiBase: coerceTrimmedStringInput(value.apiBase),
    category: coerceTrimmedStringInput(value.category),
    heading: coerceTrimmedStringInput(value.heading),
    subheading: coerceTrimmedStringInput(value.subheading),
    currency: coerceTrimmedStringInput(value.currency),
  });
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
export class AlquilerElementComponent {
  readonly #api = inject(AlquilerApiClient);

  // ── Lo que el CMS pasa ─────────────────────────────────────────────────

  readonly config = input<AlquilerRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AlquilerRuntimeConfig>(sanitizeConfig),
  });
  readonly apiBaseInput = input<string | undefined>(undefined, { alias: 'apiBase' });
  readonly categoryInput = input<string | undefined>(undefined, { alias: 'category' });
  readonly headingInput = input<string | undefined>(undefined, { alias: 'heading' });
  readonly subheadingInput = input<string | undefined>(undefined, { alias: 'subheading' });
  readonly currencyInput = input<string | undefined>(undefined, { alias: 'currency' });

  readonly apiBase = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.apiBaseInput()),
      this.config()?.apiBase,
      DEFAULT_API_BASE,
    ).replace(/\/+$/, ''),
  );
  readonly category = computed(() =>
    resolveConfigValue(coerceTrimmedStringInput(this.categoryInput()), this.config()?.category, ''),
  );
  readonly heading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.headingInput()),
      this.config()?.heading,
      'Alquiler de equipos',
    ),
  );
  readonly subheading = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.subheadingInput()),
      this.config()?.subheading,
      'Elegí el equipo, las fechas y cuántas unidades. La garantía se retiene, no se cobra.',
    ),
  );
  readonly currency = computed(() =>
    resolveConfigValue(
      coerceTrimmedStringInput(this.currencyInput()),
      this.config()?.currency,
      DEFAULT_CURRENCY,
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

  /** Carga el catálogo. Es lo primero que la pantalla hace. */
  async cargarCatalogo(): Promise<void> {
    this.catalogo.set({ estado: 'cargando' });
    try {
      const equipos = await this.#api.equipment(this.apiBase(), this.category());
      this.catalogo.set({ estado: 'ok', valor: equipos });
    } catch {
      // No hay seed de este lado: sin catálogo se dice que no se pudo leer el catálogo.
      this.catalogo.set({ estado: 'error', mensaje: 'No pudimos leer el catálogo de equipos.' });
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
          : { estado: 'error', mensaje: 'Ese equipo ya no está publicado.' },
      );
      if (detalle) {
        this.unidades.set(1);
      }
    } catch {
      this.ficha.set({ estado: 'error', mensaje: 'No pudimos leer la ficha del equipo.' });
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
          : { estado: 'error', mensaje: 'No pudimos leer tus alquileres.' },
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
        this.problema.set('No pudimos calcular el valor de esas fechas.');
      }
    } catch (error) {
      this.cotizacion.set(null);
      this.problema.set(this.porQue(error, 'No pudimos calcular el valor de esas fechas.'));
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
      this.problema.set(this.porQue(error, 'No pudimos reservar el equipo. Volvé a intentarlo.'));
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
          ? 'No pudimos registrar la devolución. El alquiler sigue abierto.'
          : 'No pudimos cancelar el alquiler. Sigue reservado.'),
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
      return 'Hay que iniciar sesión para alquilar.';
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

  /** Un monto con su moneda. */
  plata(valor: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: this.currency(),
      maximumFractionDigits: 0,
    }).format(valor);
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
