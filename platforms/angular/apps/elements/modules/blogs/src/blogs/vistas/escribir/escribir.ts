import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, untracked, viewChild } from '@angular/core';
import { ArticuloDeBlogs, MINIMO_DEL_CUERPO, RedDeBlogs } from '@synergos/dominio/blogs';
import { ButtonComponent, InputComponent, LiveRegionComponent, TextareaComponent } from '@synergos/shared';
import { AuthoringWizardComponent, type AuthoringWizardConfig } from '@synergos/shells';
import { NavegacionDeBlogs } from '../../estado/navegacion';
import { PresentacionDeBlogs } from '../../estado/presentacion';

/**
 * Escribir un artículo (SH-6 `syn-authoring-wizard`, #26): contenido, portada y revisar. Lo que aporta y el editor no
 * tenía es el BORRADOR PERSISTENTE, con scope y TTL de 24 h, así que un artículo a medias sobrevive a recargar la página.
 */
@Component({
  selector: 'sg-blogs-escribir',
  standalone: true,
  imports: [AuthoringWizardComponent, ButtonComponent, InputComponent, LiveRegionComponent, TextareaComponent],
  templateUrl: './escribir.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__vista' },
})
export class BlogsEscribirComponent {
  protected readonly red = inject(RedDeBlogs);
  protected readonly articulo = inject(ArticuloDeBlogs);
  protected readonly navegacion = inject(NavegacionDeBlogs);
  protected readonly presentacion = inject(PresentacionDeBlogs);

  readonly articleWizard = viewChild(AuthoringWizardComponent);

  readonly articleWizardConfig = computed<AuthoringWizardConfig>(() => ({
    heading: 'Escribe un artículo',
    steps: [
      { id: 'contenido', label: 'Contenido' },
      { id: 'portada', label: 'Portada' },
      { id: 'revisar', label: 'Revisar' },
    ],
    stepsLabel: 'Pasos del artículo',
    backLabel: 'Atrás',
    nextLabel: 'Continuar',
    publishLabel: 'Publicar artículo',
    publishingLabel: 'Publicando…',
    // Disjunto del carrito de suscripción a propósito: SH-6 usa el scope VERBATIM
    // como llave de `localStorage`, y `startSubscribe` hace `reset()` — con el
    // mismo scope, abrir la suscripción borraría el artículo a medias.
    draftScope: `blogs-write.${this.presentacion.instancia}`,
  }));

  /** El hito del cuerpo del artículo: llegar al mínimo, una vez por cruce (#87). */
  readonly articleBodyMilestone = computed(() =>
    this.articulo.articleBody().trim().length >= MINIMO_DEL_CUERPO
      ? 'El cuerpo ya tiene la extensión mínima: puedes continuar.'
      : '',
  );

  constructor() {
    // Publicar tira el borrador ya guardado del asistente, mientras el asistente está pintado.
    this.articulo.asistente = () => this.articleWizard();
    inject(DestroyRef).onDestroy(() => {
      this.articulo.asistente = () => undefined;
    });

    // Siembra el espejo del artículo en cuanto el wizard existe. Corre en un
    // effect porque `viewChild` se resuelve después del primer render y el
    // borrador rehidratado no avisa por sí solo (SH-6 no emite `draftchange` al
    // rehidratar): sin esto, tras recargar el autor vería su texto y el botón de
    // continuar muerto.
    effect(() => {
      // Depende del BORRADOR, no sólo de que el wizard exista: la rehidratación
      // de SH-6 corre en su propio effect y el orden entre los dos no está
      // garantizado, así que mirar sólo `articleWizard()` podía leer el borrador
      // antes de que se llenara. Comprobado: sin esta dependencia el caso de la
      // siembra pasa en verde con la siembra quitada.
      const draft = this.articleWizard()?.draft();
      if (draft && Object.keys(draft).length > 0) {
        untracked(() => this.articulo.seedArticleMirror(draft));
      }
    });
  }

  /** El autor volvió atrás desde el primer paso. */
  onArticleExit(): void {
    this.navegacion.go('feed');
  }
}
