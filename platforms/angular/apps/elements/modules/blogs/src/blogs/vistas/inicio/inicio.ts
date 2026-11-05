import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { InicioDeBlogs, RedDeBlogs, type FeedScope } from '@synergos/dominio/blogs';
import { ButtonComponent, SynEmptyStateComponent, SynSkeletonComponent, TabsComponent } from '@synergos/shared';
import { PresentacionDeBlogs } from '../../estado/presentacion';
import { BlogsCompositorComponent } from '../../piezas/compositor/compositor';
import { BlogsTarjetaComponent } from '../../piezas/tarjeta/tarjeta';

/** El inicio de la red: el título que compone el CMS, «Para ti» o «Siguiendo», el compositor y el feed. */
@Component({
  selector: 'sg-blogs-inicio',
  standalone: true,
  imports: [ButtonComponent, SynEmptyStateComponent, SynSkeletonComponent, TabsComponent, BlogsCompositorComponent, BlogsTarjetaComponent],
  templateUrl: './inicio.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__vista' },
})
export class BlogsInicioComponent {
  protected readonly red = inject(RedDeBlogs);
  protected readonly inicio = inject(InicioDeBlogs);
  protected readonly presentacion = inject(PresentacionDeBlogs);

  readonly heading = input('');

  readonly subheading = input('');

  /**
   * Content-tab descriptors fed to the shared `syn-tabs` primitive. We consume it as
   * the accessible tablist only (roving tabindex + Arrow/Home/End + focus come for
   * free); each view keeps its own rich content below, so `content` is intentionally
   * empty and the primitive's own text panel is hidden in the SCSS.
   */
  readonly feedTabs: readonly { readonly id: FeedScope; readonly label: string; readonly content: string }[] = [
    { id: 'foryou', label: 'Para ti', content: '' },
    { id: 'following', label: 'Siguiendo', content: '' },
  ];
}
