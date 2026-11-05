import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CompositorDeBlogs, RedDeBlogs } from '@synergos/dominio/blogs';
import { ButtonComponent, InputComponent, LiveRegionComponent, TextareaComponent } from '@synergos/shared';
import { PresentacionDeBlogs } from '../../estado/presentacion';

/** Desde cuántos caracteres restantes el compositor avisa (una vez) de que quedan pocos. */
const DRAFT_FEW_CHARS = 20;

/** El compositor de una nota (012-blogs-social, I2): el texto, la imagen con su texto alternativo y publicar. */
@Component({
  selector: 'sg-blogs-compositor',
  standalone: true,
  imports: [ButtonComponent, InputComponent, LiveRegionComponent, TextareaComponent],
  templateUrl: './compositor.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__pieza' },
})
export class BlogsCompositorComponent {
  protected readonly red = inject(RedDeBlogs);
  protected readonly compositor = inject(CompositorDeBlogs);
  protected readonly presentacion = inject(PresentacionDeBlogs);

  /**
   * Lo que el contador dice EN VOZ ALTA: sólo los hitos (#87). El contador era una región
   * viva y hablaba en cada tecla —«487», «486», «485»…—, encima de lo que la persona
   * escribe. Hoy el número se DESCRIBE (`aria-describedby` del campo, se oye al entrar) y
   * se anuncian los umbrales: quedan pocos, y el límite. Es la regla 42(c) del reloj:
   * la pregunta no es «¿tiene aria-live?» sino «¿cuántas veces habla mientras escribo?».
   * Un `computed` de TEXTO: mientras la banda no cambia, la cadena es la misma y la
   * fachada no vuelve a hablar.
   */
  readonly draftCountMilestone = computed(() => {
    const quedan = this.compositor.draftRemaining();
    if (quedan <= 0) return `Llegaste al límite de ${this.compositor.maxChars} caracteres.`;
    if (quedan <= DRAFT_FEW_CHARS) return `Quedan ${DRAFT_FEW_CHARS} caracteres o menos.`;
    return '';
  });
}
