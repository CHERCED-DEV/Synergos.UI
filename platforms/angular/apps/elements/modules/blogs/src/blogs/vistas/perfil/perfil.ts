import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MensajesDeBlogs, PerfilDeBlogs, RedDeBlogs, SeguidoresDeBlogs } from '@synergos/dominio/blogs';
import { ButtonComponent, SynEmptyStateComponent, SynSkeletonComponent, TabsComponent } from '@synergos/shared';
import { PresentacionDeBlogs } from '../../estado/presentacion';
import { BlogsTarjetaComponent } from '../../piezas/tarjeta/tarjeta';
import { BlogsVerificadaComponent } from '../../piezas/verificada/verificada';

/** El perfil de una persona: su cabecera con las cifras, seguirla o escribirle, y lo que publicó. */
@Component({
  selector: 'sg-blogs-perfil',
  standalone: true,
  imports: [ButtonComponent, SynEmptyStateComponent, SynSkeletonComponent, TabsComponent, BlogsTarjetaComponent, BlogsVerificadaComponent],
  templateUrl: './perfil.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__vista' },
})
export class BlogsPerfilComponent {
  protected readonly red = inject(RedDeBlogs);
  protected readonly perfil = inject(PerfilDeBlogs);
  protected readonly seguidores = inject(SeguidoresDeBlogs);
  protected readonly mensajes = inject(MensajesDeBlogs);
  protected readonly presentacion = inject(PresentacionDeBlogs);

  readonly profileTabs: readonly { readonly id: 'posts' | 'replies' | 'media'; readonly label: string; readonly content: string }[] = [
    { id: 'posts', label: 'Publicaciones', content: '' },
    { id: 'replies', label: 'Respuestas', content: '' },
    { id: 'media', label: 'Media', content: '' },
  ];
}
