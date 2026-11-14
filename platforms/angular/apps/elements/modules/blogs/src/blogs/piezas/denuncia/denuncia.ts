import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { ModeracionDeBlogs } from '@synergos/dominio/blogs';
import { ButtonComponent, TextareaComponent } from '@synergos/shared';
import { textosDeModeracion } from '../../textos-de-moderacion';

/** Lo más largo de un motivo, el que acepta la moderación del CMS. */
const LARGO_DEL_MOTIVO = 500;

/**
 * El panel para denunciar lo que se ve (012-blogs-social, I5): por qué, y enviar. Dice lo que pasó: que llegó, que hace
 * falta sesión, que ya no está o que no se pudo; lo que no llegó deja el motivo en la caja para reintentarlo.
 */
@Component({
  selector: 'sg-blogs-denuncia',
  standalone: true,
  imports: [ButtonComponent, TextareaComponent],
  templateUrl: './denuncia.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlogsDenunciaComponent {
  protected readonly moderacion = inject(ModeracionDeBlogs);
  protected readonly textos = textosDeModeracion();
  protected readonly largo = LARGO_DEL_MOTIVO;

  readonly #injector = inject(Injector);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    // WCAG 2.4.3: al abrirse, el foco va al panel, que se anuncia por su título.
    effect(() => {
      if (this.moderacion.objetivo()) {
        afterNextRender(() => this.panel()?.nativeElement.focus(), { injector: this.#injector });
      }
    });
  }

  protected enviar(evento: Event): void {
    evento.preventDefault();
    void this.moderacion.enviar();
  }
}
