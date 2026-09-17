import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * `syn-promo-code` — el campo de cupón (#29).
 *
 * **No había forma de dar un descuento.** Ni cupón, ni promoción, ni tarifa de
 * lanzamiento: el único rastro en las nueve apps era `listPrice` —un precio
 * tachado que nadie podía obtener—. Y el motor lo soportaba desde el primer día:
 * `PriceLine.amount` dice «can be negative for discounts» y los seis dominios que
 * llenan `breakdown` no emiten jamás una línea negativa.
 *
 * Por eso esto es una **molécula** y no un shell: aplicar un cupón es añadir una
 * `PriceLine` negativa, y el resumen de SH-12 ya la pinta. Lo único que faltaba
 * era el control y sus estados.
 *
 * **Qué es del control y qué del dominio.** El control pone el campo, los cuatro
 * estados y la regla de no mandar dos veces lo mismo. Qué códigos existen, cuánto
 * descuentan y por qué se rechazan es del dominio: esto no sabe qué es un mínimo
 * de compra.
 */

/** Por qué no se pudo aplicar. Cada motivo pide algo distinto de quien compra. */
export type PromoRejection =
  /** No existe — puede ser un typo, vale revisar lo escrito. */
  | 'unknown'
  /** Existió y venció. No insistir. */
  | 'expired'
  /** Falta llegar al mínimo. Lo único accionable es CUÁNTO falta. */
  | 'minimum-not-met'
  /** No aplica a lo que hay en el carrito. */
  | 'not-applicable'
  /** Ya se usó. */
  | 'already-used'
  /** No se pudo consultar. Reintentar. */
  | 'failed';

/** El cupón que el servidor aceptó. */
export interface AppliedPromo {
  /** El código tal como se aplicó (normalmente en mayúsculas). */
  readonly code: string;
  /** Qué descuenta, YA formateado por el dominio: «−$24.000», «−15 %». */
  readonly discountLabel: string;
  /** Una línea de contexto: «Válido hasta el 30 de septiembre». */
  readonly detail?: string;
}

export interface PromoCodeConfig {
  readonly label?: string;
  readonly placeholder?: string;
  readonly applyLabel?: string;
  readonly applyingLabel?: string;
  readonly removeLabel?: string;
  readonly appliedLabel?: string;
  /** Mensaje por motivo. El dominio los escribe porque sólo él sabe su negocio. */
  readonly messages?: Partial<Record<PromoRejection, string>>;
}

const MENSAJES: Readonly<Record<PromoRejection, string>> = {
  unknown: 'No encontramos ese código. Revisa que esté bien escrito.',
  expired: 'Ese código ya venció.',
  'minimum-not-met': 'Tu compra todavía no llega al mínimo de este código.',
  'not-applicable': 'Ese código no aplica a lo que llevas en el carrito.',
  'already-used': 'Ese código ya se usó.',
  failed: 'No pudimos validar el código. Intenta de nuevo.',
};

@Component({
  selector: 'syn-promo-code',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-promo-code' },
  styleUrl: './promo-code.scss',
  template: `
    @if (applied(); as promo) {
      <!-- Aplicado: el campo desaparece. Dejarlo invitaría a mandar el mismo
           código otra vez, que es la forma más fácil de duplicar un descuento. -->
      <p class="syn-promo__applied" role="status">
        <span class="syn-promo__applied-code">{{ promo.code }}</span>
        <span class="syn-promo__applied-amount">{{ promo.discountLabel }}</span>
        @if (promo.detail) {
          <span class="syn-promo__applied-detail">{{ promo.detail }}</span>
        }
        <button
          type="button"
          class="syn-promo__remove"
          [disabled]="busy()"
          (click)="remove.emit(promo.code)"
        >
          {{ config().removeLabel || 'Quitar' }}
        </button>
      </p>
    } @else {
      <form class="syn-promo__form" (submit)="onSubmit($event)">
        <label class="syn-promo__label" [attr.for]="fieldId">
          {{ config().label || '¿Tienes un código de descuento?' }}
        </label>
        <div class="syn-promo__row">
          <input
            class="syn-promo__input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            [id]="fieldId"
            [value]="code()"
            [attr.placeholder]="config().placeholder || 'Ej. BIENVENIDA10'"
            [attr.aria-invalid]="rejection() ? 'true' : null"
            [attr.aria-describedby]="rejection() ? fieldId + '-error' : null"
            (input)="onInput($event)"
          />
          <button type="submit" class="syn-promo__apply" [disabled]="!canApply()">
            {{ busy() ? config().applyingLabel || 'Validando…' : config().applyLabel || 'Aplicar' }}
          </button>
        </div>

        @if (message(); as texto) {
          <p class="syn-promo__error" [id]="fieldId + '-error'" role="alert">{{ texto }}</p>
        }
      </form>
    }
  `,
})
export class PromoCodeComponent {
  static #seq = 0;
  readonly fieldId = `syn-promo-${(PromoCodeComponent.#seq += 1)}`;

  readonly config = input<PromoCodeConfig>({});
  /** El cupón vigente, si el servidor aceptó alguno. */
  readonly applied = input<AppliedPromo | null>(null);
  /** Hay una consulta en vuelo. */
  readonly busy = input(false);
  /** Por qué se rechazó el último intento. */
  readonly rejection = input<PromoRejection | null>(null);
  /**
   * Detalle que sólo el dominio puede dar — sobre todo **cuánto falta** para el
   * mínimo, que es lo único accionable de `minimum-not-met`. Se añade al mensaje.
   */
  readonly rejectionDetail = input('');

  readonly apply = output<string>();
  readonly remove = output<string>();

  readonly code = signal('');

  /**
   * Sin código no se aplica, y **con uno en vuelo tampoco**: mandar dos veces el
   * mismo cupón es la forma más simple de que el servidor aplique dos descuentos.
   */
  readonly canApply = computed(() => this.code().trim().length > 0 && !this.busy());

  readonly message = computed(() => {
    const motivo = this.rejection();
    if (!motivo) {
      return '';
    }
    const base = this.config().messages?.[motivo] || MENSAJES[motivo];
    const detalle = this.rejectionDetail().trim();
    return detalle ? `${base} ${detalle}` : base;
  });

  onInput(event: Event): void {
    // En mayúsculas: los códigos se dictan por teléfono y se pegan de un correo,
    // y un cupón que falla por la caja es un cupón que la gente cree vencido.
    this.code.set(((event.target as HTMLInputElement | null)?.value ?? '').toUpperCase());
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.canApply()) {
      return;
    }
    this.apply.emit(this.code().trim());
  }

  /** Lo llama el dominio cuando el servidor aceptó: el campo ya no hace falta. */
  clear(): void {
    this.code.set('');
  }
}
