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
 * SH-14 — `syn-compare-table`.
 *
 * Poner dos o más candidatos LADO A LADO, alineados por atributo.
 *
 * **Cuatro dominios hacen elegir entre varias opciones y ninguno deja
 * compararlas** (#30). Propiedades lo intenta y es el único: tiene un
 * `compareMode` escrito a mano sobre los favoritos. Revisarlo dio las tres
 * reglas de esta pieza, y ninguna es cosmética:
 *
 * 1. **El eje estaba al revés.** Aquello pinta un `<dl>` por tarjeta, así que
 *    comparar obliga a releer las etiquetas una vez por candidato. Comparar es
 *    recorrer UNA FILA con el ojo: el atributo manda, y los candidatos son
 *    columnas.
 * 2. **No se podía elegir qué comparar** — comparaba todos los favoritos, y
 *    comparar doce cosas es no comparar nada. De ahí `CompareSelection` y su
 *    techo.
 * 3. **No señalaba dónde difieren.** El valor entero de una comparación está en
 *    las filas que NO coinciden; las idénticas son ruido que empuja fuera de
 *    pantalla a las que deciden. De ahí `differs` y el filtro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **LA PIEZA NO FORMATEA NI CALCULA NADA.** Los valores llegan como cadena ya
 * formateada, igual que los importes de SH-12 y las notas de SH-13. Acá pesa más
 * que en ningún otro sitio: el día que haya unidades por región —pies² contra
 * m², millas contra kilómetros— la tabla no se entera, porque nunca supo qué
 * era un área.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Un candidato: una columna de la tabla. */
export interface CompareCandidate {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  /** El dato que encabeza la columna —el precio, normalmente—, YA formateado. */
  readonly headline?: string;
  readonly imageUrl?: string;
  /**
   * `atributoId → valor ya formateado`.
   *
   * Una clave **ausente** significa «este candidato no trae ese dato», y no es
   * lo mismo que traerlo vacío: un apartamento sin dato de estrato y otro con
   * estrato 3 SÍ difieren, y la fila tiene que decirlo.
   */
  readonly values: Readonly<Record<string, string>>;
}

/** Una fila: el eje de la comparación. */
export interface CompareAttribute {
  readonly id: string;
  readonly label: string;
  /** Agrupa filas bajo un encabezado: «Espacio», «Costos», «Lo que incluye». */
  readonly group?: string;
  /** Nota corta bajo la etiqueta, si el atributo necesita explicarse. */
  readonly hint?: string;
}

/** Por qué no se pudo añadir a la comparación. */
export type CompareRejection = 'limit-reached' | 'already-added';

/** Una fila ya resuelta, tal como se pinta. */
export interface CompareRow {
  readonly attribute: CompareAttribute;
  /** Alineadas con `candidates`, en el mismo orden. Cadena vacía = sin dato. */
  readonly cells: readonly string[];
  /** Los candidatos NO coinciden en este atributo. */
  readonly differs: boolean;
}

export interface CompareTableConfig {
  readonly heading?: string;
  /** Qué se está comparando: «propiedades», «cursos», «estadías». */
  readonly nounPlural?: string;
  readonly removeLabel?: string;
  readonly clearLabel?: string;
  readonly openLabel?: string;
  /** Rótulo del filtro de diferencias. */
  readonly onlyDiffLabel?: string;
  /** Qué poner en una celda sin dato. Default «—». */
  readonly missingLabel?: string;
  /** Qué decir cuando hay un solo candidato. */
  readonly needMoreMessage?: string;
  /** Qué decir cuando el filtro de diferencias no deja ninguna fila. */
  readonly allEqualMessage?: string;
}

/** Lo que se pinta cuando falta un dato, si el dominio no dice otra cosa. */
const SIN_DATO = '—';

/**
 * El conjunto en comparación, con su techo.
 *
 * **Vive acá y no en cada dominio a propósito.** El botón «comparar» está en la
 * lista de resultados —o sea en la plantilla del dominio, no en esta pieza—, así
 * que sin esto los cuatro dominios reescriben el mismo `if (ya hay cuatro)`, y
 * el primero que lo escriba mal expulsará al más viejo en silencio.
 *
 * `add` **devuelve el rechazo** en vez de lanzar o de arreglárselas sola: quién
 * puede decirle a una persona «ya tienes cuatro, quita uno» con las palabras de
 * su dominio es el dominio.
 */
export class CompareSelection<T extends CompareCandidate = CompareCandidate> {
  readonly #items = signal<readonly T[]>([]);
  readonly items = this.#items.asReadonly();

  readonly count = computed(() => this.#items().length);
  /** Con uno solo la tabla es una ficha peor que la ficha (#30). */
  readonly comparable = computed(() => this.#items().length >= 2);
  readonly full = computed(() => this.#items().length >= this.limit);

  constructor(readonly limit = 4) {}

  has(id: string): boolean {
    return this.#items().some((item) => item.id === id);
  }

  add(candidate: T): CompareRejection | null {
    if (this.has(candidate.id)) {
      return 'already-added';
    }
    // El techo se comprueba ANTES de tocar el conjunto: añadir y recortar
    // dejaría fuera a uno que la persona sí había elegido, y sin decírselo.
    if (this.full()) {
      return 'limit-reached';
    }
    this.#items.update((current) => [...current, candidate]);
    return null;
  }

  remove(id: string): void {
    this.#items.update((current) => current.filter((item) => item.id !== id));
  }

  /** Añade o quita. Devuelve el rechazo sólo cuando intentaba añadir. */
  toggle(candidate: T): CompareRejection | null {
    if (this.has(candidate.id)) {
      this.remove(candidate.id);
      return null;
    }
    return this.add(candidate);
  }

  clear(): void {
    this.#items.set([]);
  }
}

@Component({
  selector: 'syn-compare-table',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-compare-table' },
  styleUrl: './compare-table.scss',
  template: `
    <section class="syn-compare" [attr.aria-labelledby]="headingId">
      <header class="syn-compare__head">
        <h2 class="syn-compare__heading" [id]="headingId">
          {{ config().heading || 'Comparar' }}
          <span class="syn-compare__count">
            {{ candidates().length }}/{{ limit() }}
          </span>
        </h2>

        <div class="syn-compare__head-actions">
          @if (diffCount() > 0 && sameCount() > 0) {
            <!-- Sólo se ofrece cuando hay algo que esconder Y algo que dejar: un
                 filtro que vacía la tabla, o que no quita nada, es un control que
                 enseña a desconfiar de los controles. -->
            <label class="syn-compare__filter">
              <input
                type="checkbox"
                class="syn-compare__filter-input"
                [checked]="onlyDifferences()"
                (change)="onFilterChange($event)"
              />
              {{ config().onlyDiffLabel || 'Solo las diferencias' }}
              <span class="syn-compare__filter-count">({{ diffCount() }})</span>
            </label>
          }
          @if (candidates().length > 0) {
            <button type="button" class="syn-compare__clear" (click)="clearall.emit()">
              {{ config().clearLabel || 'Vaciar' }}
            </button>
          }
        </div>
      </header>

      @if (!comparable()) {
        <p class="syn-compare__notice" role="status">
          {{
            config().needMoreMessage ||
              'Elige al menos dos ' + (config().nounPlural || 'opciones') + ' para compararlas.'
          }}
        </p>
      } @else {
        <div class="syn-compare__scroll">
          <table class="syn-compare__table">
            <caption class="syn-compare__caption">
              {{ config().heading || 'Comparar' }}
            </caption>
            <thead>
              <tr>
                <!-- La esquina va vacía: es el cruce del eje de atributos con el de
                     candidatos, no un encabezado, así que no lleva scope. -->
                <td class="syn-compare__corner"></td>
                @for (candidate of candidates(); track candidate.id) {
                  <th scope="col" class="syn-compare__col">
                    @if (candidate.imageUrl) {
                      <img
                        class="syn-compare__thumb"
                        [src]="candidate.imageUrl"
                        [alt]="candidate.title"
                        loading="lazy"
                      />
                    }
                    @if (candidate.headline) {
                      <p class="syn-compare__headline">{{ candidate.headline }}</p>
                    }
                    <p class="syn-compare__title">
                      <button
                        type="button"
                        class="syn-compare__open"
                        (click)="opencandidate.emit(candidate)"
                      >
                        {{ candidate.title }}
                      </button>
                    </p>
                    @if (candidate.subtitle) {
                      <p class="syn-compare__subtitle">{{ candidate.subtitle }}</p>
                    }
                    <button
                      type="button"
                      class="syn-compare__remove"
                      [attr.aria-label]="(config().removeLabel || 'Quitar') + ': ' + candidate.title"
                      (click)="removecandidate.emit(candidate.id)"
                    >
                      {{ config().removeLabel || 'Quitar' }}
                    </button>
                  </th>
                }
              </tr>
            </thead>

            @for (section of sections(); track section.group) {
              <tbody class="syn-compare__body">
                @if (section.group) {
                  <tr class="syn-compare__group-row">
                    <th
                      scope="colgroup"
                      class="syn-compare__group"
                      [attr.colspan]="candidates().length + 1"
                    >
                      {{ section.group }}
                    </th>
                  </tr>
                }
                @for (row of section.rows; track row.attribute.id) {
                  <tr class="syn-compare__row" [class.is-diff]="row.differs">
                    <th scope="row" class="syn-compare__attr">
                      <span class="syn-compare__attr-label">{{ row.attribute.label }}</span>
                      @if (row.attribute.hint) {
                        <span class="syn-compare__hint">{{ row.attribute.hint }}</span>
                      }
                    </th>
                    @for (cell of row.cells; track $index) {
                      <td class="syn-compare__cell" [class.is-missing]="!cell">
                        {{ cell || config().missingLabel || missing }}
                      </td>
                    }
                  </tr>
                }
              </tbody>
            }
          </table>
        </div>

        @if (visibleRowCount() === 0) {
          <p class="syn-compare__notice" role="status">
            {{
              config().allEqualMessage ||
                'Coinciden en todo lo que se compara. La decisión está en otra parte.'
            }}
          </p>
        }

        @if (footerTemplate()) {
          <div class="syn-compare__footer">
            <ng-container [ngTemplateOutlet]="footerTemplate()!" />
          </div>
        }
      }
    </section>
  `,
})
export class CompareTableComponent {
  static #seq = 0;
  readonly headingId = `syn-compare-${(CompareTableComponent.#seq += 1)}`;
  readonly missing = SIN_DATO;

  readonly config = input<CompareTableConfig>({});
  readonly candidates = input<readonly CompareCandidate[]>([]);
  /** El eje: qué atributos se comparan, en este orden. */
  readonly attributes = input<readonly CompareAttribute[]>([]);
  /** Sólo para el contador del encabezado — el techo lo aplica `CompareSelection`. */
  readonly limit = input(4);
  /** Slot del dominio bajo la tabla: «añadir otra», un aviso, lo que haga falta. */
  readonly footerTemplate = input<TemplateRef<unknown> | null>(null);

  readonly removecandidate = output<string>();
  readonly opencandidate = output<CompareCandidate>();
  readonly clearall = output<void>();

  readonly onlyDifferences = signal(false);

  readonly comparable = computed(() => this.candidates().length >= 2);

  /**
   * Las filas con dato en al menos un candidato.
   *
   * Un atributo que NADIE trae no se pinta: una fila de cuatro guiones ocupa el
   * sitio de una que sí decide, y el dominio declara su eje completo sin saber
   * qué trae cada resultado.
   */
  readonly allRows = computed<readonly CompareRow[]>(() => {
    const candidates = this.candidates();
    return this.attributes()
      .map((attribute) => {
        const cells = candidates.map((candidate) => candidate.values[attribute.id] ?? '');
        return { attribute, cells, differs: CompareTableComponent.difieren(cells) };
      })
      .filter((row) => row.cells.some((cell) => cell !== ''));
  });

  readonly diffCount = computed(() => this.allRows().filter((row) => row.differs).length);
  readonly sameCount = computed(() => this.allRows().length - this.diffCount());

  readonly rows = computed<readonly CompareRow[]>(() =>
    this.onlyDifferences() ? this.allRows().filter((row) => row.differs) : this.allRows(),
  );

  readonly visibleRowCount = computed(() => this.rows().length);

  /**
   * Las filas agrupadas, respetando el orden en que el dominio las declaró.
   *
   * Se agrupa por tramos CONSECUTIVOS y no por clave: un dominio que intercale
   * «Costos» entre dos de «Espacio» quiere eso, y reordenarlo por detrás le
   * cambiaría el eje sin decírselo.
   */
  readonly sections = computed(() => {
    const out: { group: string; rows: CompareRow[] }[] = [];
    for (const row of this.rows()) {
      const group = row.attribute.group ?? '';
      const last = out.at(-1);
      if (last && last.group === group) {
        last.rows.push(row);
      } else {
        out.push({ group, rows: [row] });
      }
    }
    return out;
  });

  onFilterChange(event: Event): void {
    this.onlyDifferences.set((event.target as HTMLInputElement | null)?.checked ?? false);
  }

  /**
   * Difieren si hay más de un valor distinto, **contando la ausencia como un
   * valor**: un candidato sin dato de estrato y otro con estrato 3 no coinciden,
   * y tratar la ausencia como comodín esconde justo la fila que decide.
   */
  static difieren(cells: readonly string[]): boolean {
    return new Set(cells.map((cell) => cell.trim())).size > 1;
  }
}
