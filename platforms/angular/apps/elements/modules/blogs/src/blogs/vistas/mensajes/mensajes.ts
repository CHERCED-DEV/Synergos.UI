import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MensajesDeBlogs, ModeracionDeBlogs, RedDeBlogs } from '@synergos/dominio/blogs';
import { BadgeComponent, ButtonComponent } from '@synergos/shared';
import { MessageCenterComponent, type MessageCenterConfig } from '@synergos/shells';
import { NavegacionDeBlogs } from '../../estado/navegacion';
import { PresentacionDeBlogs } from '../../estado/presentacion';
import { BlogsAccesoComponent } from '../../piezas/acceso/acceso';
import { BlogsVerificadaComponent } from '../../piezas/verificada/verificada';
import { textosDeModeracion } from '../../textos-de-moderacion';

/**
 * Los mensajes directos (SH-7 `syn-message-center`): la bandeja, el hilo abierto y enviar. Sin sesión, el panel. Lo que
 * te mandó otra persona se puede denunciar (012-blogs-social, I5), si el despliegue dice dónde se modera.
 */
@Component({
  selector: 'sg-blogs-mensajes',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, MessageCenterComponent, BlogsAccesoComponent, BlogsVerificadaComponent],
  templateUrl: './mensajes.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__vista' },
})
export class BlogsMensajesComponent {
  protected readonly red = inject(RedDeBlogs);
  protected readonly mensajes = inject(MensajesDeBlogs);
  protected readonly navegacion = inject(NavegacionDeBlogs);
  protected readonly presentacion = inject(PresentacionDeBlogs);
  protected readonly moderacion = inject(ModeracionDeBlogs);
  protected readonly textos = textosDeModeracion();

  readonly messageConfig: MessageCenterConfig = {
    heading: 'Mensajes',
    listLabel: 'Conversaciones',
    emptyMessage: 'No tienes conversaciones todavía.',
    loadingMessage: 'Cargando conversaciones…',
    detailPlaceholder: 'Selecciona una conversación para ver el hilo.',
    composerPlaceholder: 'Escribe un mensaje…',
    sendLabel: 'Enviar',
    sendingLabel: 'Enviando…',
  };
}
