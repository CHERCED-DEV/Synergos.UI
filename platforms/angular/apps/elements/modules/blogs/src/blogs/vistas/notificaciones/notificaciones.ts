import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core';
import { NotificacionesDeBlogs, RedDeBlogs } from '@synergos/dominio/blogs';
import { ButtonComponent, TabsComponent } from '@synergos/shared';
import { PresentacionDeBlogs } from '../../estado/presentacion';
import { BlogsAccesoComponent } from '../../piezas/acceso/acceso';

/** Las notificaciones de quien lee: todas o sólo las menciones, y abrir cada una. Sin sesión, el panel de acceso. */
@Component({
  selector: 'sg-blogs-notificaciones',
  standalone: true,
  imports: [ButtonComponent, TabsComponent, BlogsAccesoComponent],
  templateUrl: './notificaciones.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__vista' },
  // Embedded published custom element (<synergos-notification-center>).
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class BlogsNotificacionesComponent {
  protected readonly red = inject(RedDeBlogs);
  protected readonly notificaciones = inject(NotificacionesDeBlogs);
  protected readonly presentacion = inject(PresentacionDeBlogs);

  readonly notificationTabs: readonly { readonly id: 'all' | 'mentions'; readonly label: string; readonly content: string }[] = [
    { id: 'all', label: 'Todas', content: '' },
    { id: 'mentions', label: 'Menciones', content: '' },
  ];
}
