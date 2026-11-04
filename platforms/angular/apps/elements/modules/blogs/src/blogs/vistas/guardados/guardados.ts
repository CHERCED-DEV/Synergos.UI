import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GuardadosDeBlogs, RedDeBlogs } from '@synergos/dominio/blogs';
import { AccountShellComponent, type AccountShellConfig } from '@synergos/shells';
import { BlogsAccesoComponent } from '../../piezas/acceso/acceso';
import { BlogsTarjetaComponent } from '../../piezas/tarjeta/tarjeta';

/** Guardados y listas (SH-4 `syn-account-shell`): lo que guardó quien lee. Sin sesión, el panel de acceso. */
@Component({
  selector: 'sg-blogs-guardados',
  standalone: true,
  imports: [AccountShellComponent, BlogsAccesoComponent, BlogsTarjetaComponent],
  templateUrl: './guardados.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__vista' },
})
export class BlogsGuardadosComponent {
  protected readonly red = inject(RedDeBlogs);
  protected readonly guardados = inject(GuardadosDeBlogs);

  readonly savedConfig = computed<AccountShellConfig>(() => ({
    heading: 'Guardados',
    navLabel: 'Secciones de guardados',
    inboxEmptyMessage: 'Aún no has guardado publicaciones.',
    inboxLoadingMessage: 'Cargando tus guardados…',
    detailPlaceholder: 'Selecciona una publicación guardada para verla.',
    sections: [
      { id: 'saved', label: 'Guardados', kind: 'inbox', badge: this.guardados.savedPosts().length || undefined },
      { id: 'lists', label: 'Listas' },
    ],
  }));
}
