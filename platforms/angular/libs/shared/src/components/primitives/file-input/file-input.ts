import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

let fileInputId = 0;

/**
 * Elegir un fichero (003-salud-cita, I4: el PDF del informe del laboratorio). El átomo que faltaba: las apps que suben
 * ficheros escribían su `<input type="file">` a mano. Avisa el fichero elegido, o `null` si se quitó; leerlo y subirlo
 * es de quien lo usa.
 */
@Component({
  selector: 'syn-file-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-file-input">
      @if (label()) {
        <label class="syn-file-input__label" [attr.for]="fieldId()">{{ label() }}</label>
      }
      <input
        class="syn-file-input__field"
        type="file"
        [id]="fieldId()"
        [disabled]="disabled()"
        [attr.accept]="accept() || null"
        [attr.aria-label]="ariaLabel() || label() || null"
        [attr.aria-describedby]="hint() ? hintId() : null"
        (change)="elegir($event)"
      />
      @if (hint()) {
        <p class="syn-file-input__hint" [id]="hintId()">{{ hint() }}</p>
      }
    </div>
  `,
  styleUrl: './file-input.scss',
})
export class FileInputComponent {
  readonly id = input('');
  readonly label = input('');
  readonly hint = input('');
  readonly ariaLabel = input('');
  /** Los tipos que se ofrecen al elegir, como el atributo `accept` (`application/pdf`). */
  readonly accept = input('');
  readonly disabled = input(false);

  readonly fileChange = output<File | null>();

  readonly #numero = ++fileInputId;
  readonly fieldId = computed(() => this.id() || `syn-file-input-${this.#numero}`);
  readonly hintId = computed(() => `${this.fieldId()}-hint`);

  protected elegir(event: Event): void {
    const campo = event.target as HTMLInputElement | null;
    this.fileChange.emit(campo?.files?.[0] ?? null);
  }
}
