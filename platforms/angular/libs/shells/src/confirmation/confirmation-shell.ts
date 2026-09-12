import {
  ChangeDetectionStrategy,
  Component,
  type TemplateRef,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * SH-11 — `syn-confirmation-shell`.
 *
 * La pantalla de «ya quedó»: qué pasó, **con qué número**, y qué va a pasar ahora.
 *
 * La escribían seis dominios, cada uno la suya — `receipt` en Gobierno,
 * `confirmation` en Tienda, Propiedades y Viajes, `confirmed` en Eventos,
 * `enrolled` en Educación. Seis es más consumidores que SH-6 y SH-7, que sí son
 * piezas del catálogo: con el mismo criterio que produjo las otras diez, ésta
 * tenía que existir y no existía (#19).
 *
 * No es invención de la casa: GOV.UK la tiene como patrón con nombre
 * —*Confirmation pages*— porque es donde alguien se lleva su referencia y se
 * entera de qué sigue. Si esa pantalla falla, la persona vuelve a empezar el
 * trámite o llama por teléfono.
 *
 * **Qué es de la pieza y qué del dominio.** La pieza pone la estructura: el
 * acuse, la referencia destacada y copiable, los pasos siguientes y las
 * acciones. El **artefacto** es del dominio y entra por template —el QR de una
 * entrada, el voucher de un viaje, el diploma de un curso ya tienen su propio
 * shell (SH-10) y esta pantalla sólo le hace sitio.
 *
 * **La referencia no es opcional y por eso se comprueba.** Una confirmación sin
 * número no sirve para nada y es el error que la vuelve inútil *sin romperse*:
 * se ve bien, y la persona no tiene con qué reclamar. Cuando falta, la pieza lo
 * dice a la vista en vez de renderizar un hueco elegante.
 */

/** Un paso de «qué sigue». El orden es el orden en que ocurren. */
export interface ConfirmationStep {
  readonly id: string;
  readonly label: string;
  /** Detalle opcional: un plazo, un canal, una condición. */
  readonly detail?: string;
  /** Marca el paso que ya ocurrió (normalmente el primero). */
  readonly done?: boolean;
}

/** Una acción ofrecida al cerrar. `href` navega; sin `href`, emite `action`. */
export interface ConfirmationAction {
  readonly id: string;
  readonly label: string;
  readonly href?: string;
  readonly kind?: 'default' | 'primary';
}

/** Un dato del acuse — fecha, monto, canal. Ya formateado por el dominio. */
export interface ConfirmationFact {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

export interface ConfirmationShellConfig {
  /** «Tu solicitud quedó radicada», «Compra confirmada». */
  readonly heading: string;
  /** Una línea de contexto bajo el título. */
  readonly summary?: string;
  /** Cómo se llama el número en este dominio: «Radicado», «Pedido», «PNR». */
  readonly referenceLabel?: string;
  /** Título de la lista de pasos. */
  readonly stepsLabel?: string;
  /** Texto del botón de copiar. */
  readonly copyLabel?: string;
  /** Confirmación efímera tras copiar. */
  readonly copiedLabel?: string;
  /** Aviso cuando algo del flujo quedó a medias pero el acto principal se hizo. */
  readonly warning?: string;
}

@Component({
  selector: 'syn-confirmation-shell',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-confirmation-shell' },
  styleUrl: './confirmation-shell.scss',
  template: `
    <section class="syn-confirm" [attr.aria-labelledby]="headingId">
      <!-- role="status" y no "alert": esto es el desenlace esperado de algo que la
           persona acaba de hacer, no una interrupción. Un alert se lee encima de
           lo que el lector de pantalla esté diciendo. -->
      <div class="syn-confirm__ack" role="status">
        <span class="syn-confirm__tick" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <h2 class="syn-confirm__heading" [id]="headingId">{{ config().heading }}</h2>
        @if (config().summary) {
          <p class="syn-confirm__summary">{{ config().summary }}</p>
        }
      </div>

      @if (hasReference()) {
        <div class="syn-confirm__ref">
          <span class="syn-confirm__ref-label">{{ config().referenceLabel || 'Referencia' }}</span>
          <!-- El número es lo que la persona se lleva: se muestra grande, se
               puede seleccionar entero y se puede copiar de un toque. -->
          <output class="syn-confirm__ref-value">{{ reference() }}</output>
          <button
            type="button"
            class="syn-confirm__copy"
            (click)="onCopy()"
            [attr.aria-label]="(config().copyLabel || 'Copiar') + ' ' + reference()"
          >
            {{ copied() ? config().copiedLabel || 'Copiado' : config().copyLabel || 'Copiar' }}
          </button>
        </div>
      } @else {
        <!-- Una confirmación sin número no sirve para reclamar nada. Se dice a la
             vista: callarlo deja una pantalla que parece correcta y no lo es. -->
        <p class="syn-confirm__missing" role="alert">
          Esta confirmación no trae número de referencia. Guarda una captura y escríbenos.
        </p>
      }

      @if (config().warning) {
        <p class="syn-confirm__warning" role="status">{{ config().warning }}</p>
      }

      @if (facts().length > 0) {
        <dl class="syn-confirm__facts">
          @for (fact of facts(); track fact.id) {
            <div class="syn-confirm__fact">
              <dt class="syn-confirm__fact-label">{{ fact.label }}</dt>
              <dd class="syn-confirm__fact-value">{{ fact.value }}</dd>
            </div>
          }
        </dl>
      }

      <!-- El artefacto del dominio: QR, voucher, diploma. La pieza no sabe qué es. -->
      @if (artifactTemplate()) {
        <div class="syn-confirm__artifact">
          <ng-container [ngTemplateOutlet]="artifactTemplate()!" />
        </div>
      }

      @if (steps().length > 0) {
        <div class="syn-confirm__steps">
          <h3 class="syn-confirm__steps-title">{{ config().stepsLabel || 'Qué sigue' }}</h3>
          <ol class="syn-confirm__steps-list">
            @for (step of steps(); track step.id) {
              <li class="syn-confirm__step" [class.is-done]="step.done">
                <span class="syn-confirm__step-label">{{ step.label }}</span>
                @if (step.detail) {
                  <span class="syn-confirm__step-detail">{{ step.detail }}</span>
                }
              </li>
            }
          </ol>
        </div>
      }

      @if (actions().length > 0) {
        <div class="syn-confirm__actions">
          @for (item of actions(); track item.id) {
            @if (item.href) {
              <a
                class="syn-confirm__action"
                [class.is-primary]="item.kind === 'primary'"
                [href]="item.href"
                >{{ item.label }}</a
              >
            } @else {
              <button
                type="button"
                class="syn-confirm__action"
                [class.is-primary]="item.kind === 'primary'"
                (click)="action.emit(item.id)"
              >
                {{ item.label }}
              </button>
            }
          }
        </div>
      }
    </section>
  `,
})
export class ConfirmationShellComponent {
  static #seq = 0;
  /** Id propio: dos confirmaciones en la misma página no pueden compartir el del título. */
  readonly headingId = `syn-confirm-${(ConfirmationShellComponent.#seq += 1)}`;

  readonly config = input.required<ConfirmationShellConfig>();
  /** El número que la persona se lleva. Sin él, la pieza lo dice. */
  readonly reference = input('');
  readonly facts = input<readonly ConfirmationFact[]>([]);
  readonly steps = input<readonly ConfirmationStep[]>([]);
  readonly actions = input<readonly ConfirmationAction[]>([]);
  /** El artefacto del dominio (QR, voucher, diploma), si lo hay. */
  readonly artifactTemplate = input<TemplateRef<unknown> | null>(null);

  /** Se emite al copiar la referencia — el dominio puede querer anotarlo. */
  readonly referencecopied = output<string>();
  /** Acción sin `href` pulsada. */
  readonly action = output<string>();

  /** Se encendió al copiar. Efímero y de la pieza: no lo maneja el dominio. */
  readonly copied = signal(false);

  readonly hasReference = computed(() => this.reference().trim().length > 0);

  onCopy(): void {
    const value = this.reference().trim();
    if (!value) {
      return;
    }
    // Copiar es una conveniencia: si el navegador no deja (permiso, contexto no
    // seguro), la referencia sigue en pantalla y seleccionable. No se avisa de un
    // fallo que no le quita nada a la persona.
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard?.writeText) {
      void clipboard.writeText(value).catch(() => undefined);
    }
    this.copied.set(true);
    this.referencecopied.emit(value);
  }
}
