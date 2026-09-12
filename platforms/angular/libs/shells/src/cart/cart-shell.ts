import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type TemplateRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * SH-12 — `syn-cart-shell`.
 *
 * La vitrina del carrito: qué llevo, cuánto es, **cuánto me queda para pagarlo**
 * y qué puedo hacer ahora.
 *
 * **El motor ya estaba unificado; la vitrina no** (#22). `SessionStore` se
 * documenta a sí mismo como *«the unified, multi-item cart»* y lo inyectan
 * Tienda, Eventos y Viajes — encima de él cada uno reescribió su lista, su pie
 * de totales, su estado vacío y su cajón lateral. Tres consumidores es más que
 * SH-6 y SH-7, que sí son piezas del catálogo.
 *
 * Y se notaba en las dos direcciones. Lo que sobraba: sólo Tienda agrupa por
 * vendedor, sólo Eventos separa cargos del total, sólo Viajes pinta un icono por
 * tipo — y ninguna de las tres es específica de su dominio. Lo que faltaba:
 * **el reloj del apartado**. `SessionItem.expiresAt` existe en el motor desde el
 * primer día, la capacidad vence los cupos sola a los 15 minutos, y
 * `eventos.model.ts` declaraba su vista como «carrito + fees + hold countdown»
 * con el countdown sin escribir. Alguien apartaba un aforo, se iba a buscar la
 * tarjeta, volvía, y el cupo se había muerto **sin que la pantalla se lo dijera
 * nunca**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **LA PIEZA NO HACE ARITMÉTICA. Ni un `+`.**
 *
 * Todos los importes llegan ya formateados por el dominio. Cargos por servicio,
 * impuestos, descuentos, totales por vendedor y moneda son reglas de negocio que
 * cambian por vertical: una pieza que sumara estaría mal el primer día que un
 * dominio tenga un descuento, y estaría mal **en silencio** — un total plausible
 * y equivocado es peor que ninguno.
 *
 * La pieza pone la estructura, la accesibilidad y el reloj. El dominio pone los
 * números y los rótulos.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Las dos densidades son la misma pieza** (`page` y `drawer`). Tenerlas como
 * dos componentes es lo que ya hizo que en Viajes el cajón dijera «Total» y la
 * página «Total del viaje» sobre el mismo número.
 */

/** Una línea del carrito. Todos los importes vienen **ya formateados**. */
export interface CartLine {
  readonly id: string;
  readonly label: string;
  /** Segunda línea: variante, fechas, aeropuertos. Ya formateada. */
  readonly detail?: string;
  /** Precio unitario, ya formateado («$32.000»). */
  readonly unit?: string;
  /** Total de la línea, ya formateado. */
  readonly total?: string;
  /** Cantidad. `undefined` = esta línea no se cambia de cantidad (un vuelo, una noche). */
  readonly quantity?: number;
  /** Tope: existencias, aforo. Con él, el «+» se deshabilita al llegar. */
  readonly maxQuantity?: number;
  /** Agrupador. Las líneas con la misma clave salen juntas bajo su cabecera. */
  readonly groupId?: string;
  /** Por defecto sí. En `false` no hay botón de quitar (una línea obligatoria del paquete). */
  readonly removable?: boolean;
  /** Discriminador del dominio — llega al template de icono, la pieza no lo mira. */
  readonly kind?: string;
}

/** Cabecera de un grupo de líneas: «Vendido por X». */
export interface CartGroup {
  readonly id: string;
  readonly label: string;
  /** Total del grupo, ya formateado. */
  readonly total?: string;
}

/** Una fila del resumen: subtotal, cargos, impuestos, total. Ya formateada. */
export interface CartSummaryRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** La fila del total: se destaca y cierra el resumen. */
  readonly emphasis?: boolean;
}

/** Una acción del pie. */
export interface CartAction {
  readonly id: string;
  readonly label: string;
  readonly kind?: 'default' | 'primary';
  readonly disabled?: boolean;
  /**
   * Cuándo se pinta. **Por defecto `'filled'`**, que es el default seguro: «Ir a
   * pagar» sobre cero líneas manda a un checkout que no puede completarse.
   * `'empty'` es para la salida que sólo tiene sentido ahí («Explorar eventos»),
   * y `'always'` para la que sirve en los dos («Seguir comprando»).
   */
  readonly visibility?: 'always' | 'empty' | 'filled';
}

/** Un aviso con acción al lado — el cross-sell de Viajes es esto. */
export interface CartNote {
  readonly text: string;
  readonly actionId?: string;
  readonly actionLabel?: string;
}

export interface CartShellConfig {
  readonly heading: string;
  /** Qué decir cuando no hay nada. Un carrito vacío no es un error. */
  readonly emptyMessage: string;
  /** `page` (default) o `drawer` — la misma pieza, más compacta. */
  readonly density?: 'page' | 'drawer';
  /** Rótulo del total del pie cuando no hay `summary`. Default «Total». */
  readonly totalLabel?: string;
  /** Con él, el cajón pinta su botón de cerrar. Sin él, no hay botón. */
  readonly closeLabel?: string;
  /** Qué llamarle al apartado. Default «Tu selección está apartada». */
  readonly holdLabel?: string;
  /** Qué decir al vencerse. Default «El apartado venció». */
  readonly holdExpiredLabel?: string;
  /** Segundos bajo los cuales el aviso pasa a `role="alert"`. Default 300 (5 min). */
  readonly holdWarnSeconds?: number;
}

/** Lo que emite el paso de cantidad. Nunca vale 0 — ver `onDecrement`. */
export interface CartQuantityChange {
  readonly id: string;
  readonly quantity: number;
}

/** Una línea con su grupo ya resuelto, lista para pintar. */
interface BloqueDeLineas {
  readonly group: CartGroup | null;
  readonly lines: readonly CartLine[];
}

const ICONO_CERRAR =
  'M18 6 6 18M6 6l12 12';

@Component({
  selector: 'syn-cart-shell',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'syn-cart-shell',
    '[class.is-drawer]': 'isDrawer()',
    '[class.is-empty]': '!hasLines()',
  },
  styleUrl: './cart-shell.scss',
  template: `
    <section class="syn-cart" [attr.aria-labelledby]="headingId">
      <header class="syn-cart__head">
        <h2 class="syn-cart__heading" [id]="headingId">
          {{ config().heading }}
          @if (lineCount() > 0) {
            <span class="syn-cart__count">({{ lineCount() }})</span>
          }
        </h2>
        @if (isDrawer() && config().closeLabel) {
          <button
            type="button"
            class="syn-cart__close"
            (click)="close.emit()"
            [attr.aria-label]="config().closeLabel"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" aria-hidden="true" focusable="false">
              <path [attr.d]="iconoCerrar" />
            </svg>
          </button>
        }
      </header>

      <!-- El reloj del apartado. Vive arriba porque es lo que decide si la
           persona sigue navegando o paga ahora. -->
      @if (holdText(); as aviso) {
        <p
          class="syn-cart__hold"
          [class.is-urgent]="holdUrgent()"
          [class.is-expired]="holdExpired()"
          [attr.role]="holdUrgent() || holdExpired() ? 'alert' : 'status'"
        >
          {{ aviso }}
        </p>
      }

      @if (!hasLines()) {
        <p class="syn-cart__empty">{{ config().emptyMessage }}</p>
      } @else {
        @for (bloque of blocks(); track bloque.group?.id ?? '—') {
          <section
            class="syn-cart__group"
            [attr.aria-label]="bloque.group?.label || null"
          >
            @if (bloque.group; as grupo) {
              <p class="syn-cart__group-head">
                <span class="syn-cart__group-label">{{ grupo.label }}</span>
                @if (grupo.total) {
                  <span class="syn-cart__group-total">{{ grupo.total }}</span>
                }
              </p>
            }
            <ul class="syn-cart__lines">
              @for (line of bloque.lines; track line.id) {
                <li class="syn-cart__line">
                  @if (leadingTemplate()) {
                    <span class="syn-cart__line-leading" aria-hidden="true">
                      <ng-container
                        [ngTemplateOutlet]="leadingTemplate()!"
                        [ngTemplateOutletContext]="{ $implicit: line }"
                      />
                    </span>
                  }

                  <div class="syn-cart__line-main">
                    <p class="syn-cart__line-label">{{ line.label }}</p>
                    @if (line.detail) {
                      <p class="syn-cart__line-detail">{{ line.detail }}</p>
                    }
                    @if (line.unit) {
                      <p class="syn-cart__line-unit">{{ line.unit }}</p>
                    }
                  </div>

                  @if (line.quantity !== undefined) {
                    <div class="syn-cart__qty" role="group" [attr.aria-label]="'Cantidad de ' + line.label">
                      <button
                        type="button"
                        class="syn-cart__qty-btn"
                        [disabled]="!canDecrement(line)"
                        (click)="onDecrement(line)"
                        [attr.aria-label]="decrementLabel(line)"
                      >&minus;</button>
                      <span class="syn-cart__qty-value">{{ line.quantity }}</span>
                      <button
                        type="button"
                        class="syn-cart__qty-btn"
                        [disabled]="atMax(line)"
                        (click)="onIncrement(line)"
                        [attr.aria-label]="'Aumentar ' + line.label"
                      >+</button>
                    </div>
                  }

                  @if (line.total) {
                    <p class="syn-cart__line-total">{{ line.total }}</p>
                  }

                  @if (line.removable !== false) {
                    <button
                      type="button"
                      class="syn-cart__remove"
                      (click)="remove.emit(line.id)"
                      [attr.aria-label]="'Quitar ' + line.label"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" aria-hidden="true" focusable="false">
                        <path [attr.d]="iconoCerrar" />
                      </svg>
                    </button>
                  }
                </li>
              }
            </ul>
          </section>
        }

        @if (note(); as aviso) {
          <div class="syn-cart__note" role="note">
            <span class="syn-cart__note-text">{{ aviso.text }}</span>
            @if (aviso.actionId && aviso.actionLabel) {
              <button type="button" class="syn-cart__note-btn" (click)="action.emit(aviso.actionId!)">
                {{ aviso.actionLabel }}
              </button>
            }
          </div>
        }

        @if (summary().length > 0) {
          <dl class="syn-cart__summary">
            @for (row of summary(); track row.id) {
              <div class="syn-cart__summary-row" [class.is-total]="row.emphasis">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            }
          </dl>
        } @else if (total()) {
          <p class="syn-cart__total">
            <span>{{ config().totalLabel || 'Total' }}</span>
            <span>{{ total() }}</span>
          </p>
        }
      }

      @if (visibleActions().length > 0) {
        <div class="syn-cart__actions">
          @for (item of visibleActions(); track item.id) {
            <button
              type="button"
              class="syn-cart__action"
              [class.is-primary]="item.kind === 'primary'"
              [disabled]="item.disabled === true"
              (click)="action.emit(item.id)"
            >
              {{ item.label }}
            </button>
          }
        </div>
      }
    </section>
  `,
})
export class CartShellComponent {
  static #seq = 0;
  /** Id propio: la página y el cajón coexisten y no pueden compartir el del título. */
  readonly headingId = `syn-cart-${(CartShellComponent.#seq += 1)}`;
  readonly iconoCerrar = ICONO_CERRAR;

  readonly #destroyRef = inject(DestroyRef);

  readonly config = input.required<CartShellConfig>();
  readonly lines = input<readonly CartLine[]>([]);
  /** Cabeceras de grupo. Una línea sin grupo declarado sale suelta, arriba. */
  readonly groups = input<readonly CartGroup[]>([]);
  /** Subtotal, cargos, total. Si viene, manda sobre `total`. */
  readonly summary = input<readonly CartSummaryRow[]>([]);
  /** El total, ya formateado, para el caso simple sin resumen. */
  readonly total = input('');
  readonly actions = input<readonly CartAction[]>([]);
  readonly note = input<CartNote | null>(null);
  /** Slot de cabeza de línea: el icono por tipo de producto. */
  readonly leadingTemplate = input<TemplateRef<unknown> | null>(null);
  /**
   * Cuándo vence el apartado (ISO-8601). Es el `expiresAt` del motor. Sin él no
   * hay reloj — un carrito sin apartado no tiene nada que contar.
   */
  readonly holdExpiresAt = input<string | null>(null);

  readonly remove = output<string>();
  readonly quantitychange = output<CartQuantityChange>();
  readonly action = output<string>();
  readonly close = output<void>();
  /** Se emite UNA vez al cruzar el vencimiento. El dominio decide qué hacer. */
  readonly holdexpired = output<void>();

  /** El reloj de la pieza. Se mueve solo; el dominio no lo tiene que empujar. */
  readonly #now = signal(Date.now());

  constructor() {
    // Sólo tictaquea si hay algo que contar: un carrito sin apartado no despierta
    // el navegador cada segundo.
    if (typeof setInterval === 'function') {
      const handle = setInterval(() => {
        if (this.holdExpiresAt()) {
          this.#now.set(Date.now());
        }
      }, 1000);
      this.#destroyRef.onDestroy(() => clearInterval(handle));
    }

    // Avisa UNA vez al cruzar el vencimiento, y lo que lo garantiza es que el
    // efecto depende del BOOLEANO y no de los segundos: `holdExpired` se
    // recalcula cada segundo pero sigue valiendo `true`, así que el efecto no
    // vuelve a correr. Leer `holdSeconds()` aquí mandaría un aviso por segundo —
    // comprobado mutándolo, el spec lo caza. Un apartado nuevo lo devuelve a
    // `false` y vuelve a poder avisar, sin ninguna bandera que mantener.
    effect(() => {
      const vencido = this.holdExpired();
      untracked(() => {
        if (vencido) {
          this.holdexpired.emit();
        }
      });
    });
  }

  readonly isDrawer = computed(() => this.config().density === 'drawer');
  readonly hasLines = computed(() => this.lines().length > 0);
  readonly lineCount = computed(() => this.lines().length);

  /**
   * Qué acciones sobreviven al estado actual. El default —`'filled'`— es el que
   * importa: pintar «Ir a pagar» sobre cero líneas manda a un checkout que no
   * puede completarse, y los tres dominios lo resolvían con un `@if` a mano, que
   * es exactamente lo que se pierde al tocar la plantilla.
   */
  readonly visibleActions = computed(() => {
    const lleno = this.hasLines();
    return this.actions().filter((a) => {
      const cuando = a.visibility ?? 'filled';
      return cuando === 'always' || (lleno ? cuando === 'filled' : cuando === 'empty');
    });
  });

  /** Las líneas repartidas en bloques según su `groupId`. Sin grupos, un bloque. */
  readonly blocks = computed<readonly BloqueDeLineas[]>(() => {
    const grupos = this.groups();
    const lineas = this.lines();
    if (grupos.length === 0) {
      return lineas.length > 0 ? [{ group: null, lines: lineas }] : [];
    }

    const bloques: BloqueDeLineas[] = [];
    // Las que no declaran grupo —o declaran uno que no existe— salen primero y
    // sueltas: esconderlas perdería líneas que la persona sí agregó.
    const conocidos = new Set(grupos.map((g) => g.id));
    const sueltas = lineas.filter((l) => l.groupId === undefined || !conocidos.has(l.groupId));
    if (sueltas.length > 0) {
      bloques.push({ group: null, lines: sueltas });
    }
    for (const grupo of grupos) {
      const suyas = lineas.filter((l) => l.groupId === grupo.id);
      if (suyas.length > 0) {
        bloques.push({ group: grupo, lines: suyas });
      }
    }
    return bloques;
  });

  // ─── El reloj ───────────────────────────────────────────────────────────────

  /** Segundos que quedan, o `null` si no hay apartado o la fecha no se entiende. */
  readonly holdSeconds = computed<number | null>(() => {
    const raw = this.holdExpiresAt();
    if (!raw) {
      return null;
    }
    const vence = Date.parse(raw);
    if (Number.isNaN(vence)) {
      // Una fecha que no se entiende no es «vencido»: decir que el cupo se murió
      // por un fallo de formato es peor que no decir nada.
      return null;
    }
    return Math.floor((vence - this.#now()) / 1000);
  });

  readonly holdExpired = computed(() => {
    const s = this.holdSeconds();
    return s !== null && s <= 0;
  });

  readonly holdUrgent = computed(() => {
    const s = this.holdSeconds();
    if (s === null || s <= 0) {
      return false;
    }
    return s <= (this.config().holdWarnSeconds ?? 300);
  });

  readonly holdText = computed<string | null>(() => {
    const s = this.holdSeconds();
    if (s === null || !this.hasLines()) {
      return null;
    }
    if (s <= 0) {
      return this.config().holdExpiredLabel || 'El apartado venció. Vuelve a elegir para continuar.';
    }
    const etiqueta = this.config().holdLabel || 'Tu selección está apartada';
    return `${etiqueta} · quedan ${formatoReloj(s)}`;
  });

  // ─── Cantidad ───────────────────────────────────────────────────────────────

  atMax(line: CartLine): boolean {
    return line.maxQuantity !== undefined && (line.quantity ?? 0) >= line.maxQuantity;
  }

  canDecrement(line: CartLine): boolean {
    // En 1, el «−» sólo sirve si la línea se puede quitar.
    return (line.quantity ?? 0) > 1 || line.removable !== false;
  }

  decrementLabel(line: CartLine): string {
    return (line.quantity ?? 0) > 1 ? `Disminuir ${line.label}` : `Quitar ${line.label}`;
  }

  onIncrement(line: CartLine): void {
    if (this.atMax(line)) {
      return;
    }
    this.quantitychange.emit({ id: line.id, quantity: (line.quantity ?? 0) + 1 });
  }

  /**
   * Menos-uno sobre una línea de 1 **no es «cero unidades»: es quitarla.** Emitir
   * `quantity: 0` obligaría a cada dominio a traducirlo, y el que se olvidara
   * dejaría una línea fantasma de cero en el carrito.
   */
  onDecrement(line: CartLine): void {
    const actual = line.quantity ?? 0;
    if (actual > 1) {
      this.quantitychange.emit({ id: line.id, quantity: actual - 1 });
      return;
    }
    if (line.removable !== false) {
      this.remove.emit(line.id);
    }
  }
}

/** `mm:ss`, y `h:mm:ss` cuando pasa de la hora. */
function formatoReloj(segundos: number): string {
  const s = Math.max(0, segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const dosDigitos = (n: number): string => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dosDigitos(m)}:${dosDigitos(rest)}` : `${m}:${dosDigitos(rest)}`;
}
