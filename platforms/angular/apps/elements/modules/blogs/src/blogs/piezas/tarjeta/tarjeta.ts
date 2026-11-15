import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { GuardadosDeBlogs, ModeracionDeBlogs, ReaccionesDeBlogs, type Post } from '@synergos/dominio/blogs';
import { AvatarComponent, ButtonComponent } from '@synergos/shared';
import { NavegacionDeBlogs } from '../../estado/navegacion';
import { PresentacionDeBlogs } from '../../estado/presentacion';
import { textosDeModeracion } from '../../textos-de-moderacion';
import { BlogsVerificadaComponent } from '../verificada/verificada';

/**
 * La tarjeta de una publicación (012-blogs-social, I2): quién la escribió, el cuerpo, la media, las etiquetas y sus
 * acciones —reaccionar, comentar, republicar y guardar—. La pintan el inicio, el hilo, el perfil, Explorar y Guardados.
 */
@Component({
  selector: 'sg-blogs-tarjeta',
  standalone: true,
  imports: [NgTemplateOutlet, AvatarComponent, ButtonComponent, BlogsVerificadaComponent],
  templateUrl: './tarjeta.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__pieza' },
})
export class BlogsTarjetaComponent {
  protected readonly reacciones = inject(ReaccionesDeBlogs);
  protected readonly guardados = inject(GuardadosDeBlogs);
  protected readonly navegacion = inject(NavegacionDeBlogs);
  protected readonly presentacion = inject(PresentacionDeBlogs);
  protected readonly moderacion = inject(ModeracionDeBlogs);
  protected readonly textos = textosDeModeracion();

  readonly publicacion = input.required<Post>();

  /** La tarjeta del hilo abierto o del detalle de un guardado. */
  readonly detalle = input(false);
}
