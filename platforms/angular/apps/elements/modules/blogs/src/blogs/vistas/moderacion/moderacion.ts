import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ModeracionDeBlogs, RedDeBlogs, type CasoDeModeracion } from '@synergos/dominio/blogs';
import { ButtonComponent, TextareaComponent } from '@synergos/shared';
import {
  ConsoleShellComponent,
  type ConsoleColumn,
  type ConsoleRowAction,
  type ConsoleRowActionEvent,
  type ConsoleShellConfig,
} from '@synergos/shells';
import { PresentacionDeBlogs } from '../../estado/presentacion';
import { BlogsAccesoComponent } from '../../piezas/acceso/acceso';
import { textosDeModeracion } from '../../textos-de-moderacion';

/**
 * La cola de moderación (012-blogs-social, I5), sobre SH-5 `syn-console-shell`: lo denunciado, por qué y cuántas
 * personas, y mantener o retirar con su motivo. Es de `admin`, `moderator` y `editor`: lo decide el CMS, y aquí se dice
 * sin sesión o sin permiso. La cola es genérica; lo de cada vertical es cómo se nombra cada tipo.
 */
@Component({
  selector: 'sg-blogs-moderacion',
  standalone: true,
  imports: [ButtonComponent, TextareaComponent, ConsoleShellComponent, BlogsAccesoComponent],
  templateUrl: './moderacion.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__vista' },
})
export class BlogsModeracionComponent {
  protected readonly red = inject(RedDeBlogs);
  protected readonly moderacion = inject(ModeracionDeBlogs);
  protected readonly presentacion = inject(PresentacionDeBlogs);
  protected readonly textos = textosDeModeracion();

  readonly config = computed<ConsoleShellConfig>(() => ({
    heading: this.textos.cola,
    sections: [{ id: 'denuncias', label: this.textos.denuncias, kind: 'table', badge: this.moderacion.casos().length || undefined }],
    emptyMessage: this.textos.colaVacia,
    emptyTitle: this.textos.colaVacia,
    ...(this.moderacion.accesoALaCola() === 'fallo' ? { errorMessage: this.textos.colaNoCargo } : {}),
  }));

  readonly columnas = computed<readonly ConsoleColumn[]>(() => [
    { key: 'tipo', label: this.textos.que },
    { key: 'resumen', label: this.textos.contenido },
    { key: 'motivo', label: this.textos.motivo },
    { key: 'denuncias', label: this.textos.denuncias, align: 'end', sortable: 'number' },
    { key: 'denunciado', label: this.textos.fecha, sortable: 'date' },
  ]);

  readonly acciones = computed<readonly ConsoleRowAction[]>(() => [
    { id: 'mantener', label: this.textos.mantener },
    { id: 'retirar', label: this.textos.retirar, kind: 'danger' },
  ]);

  /** Cómo se nombra el tipo de lo denunciado; uno que no es de la red sale tal como llega. */
  protected tipo(caso: CasoDeModeracion): string {
    switch (caso.tipo) {
      case 'blogs.publicacion':
        return this.textos.publicacion;
      case 'blogs.comentario':
        return this.textos.comentario;
      case 'blogs.mensaje':
        return this.textos.mensaje;
      default:
        return caso.tipo;
    }
  }

  protected alDecidir(evento: ConsoleRowActionEvent<CasoDeModeracion>): void {
    if (evento.actionId === 'mantener' || evento.actionId === 'retirar') {
      this.moderacion.prepararDecision(evento.row, evento.actionId);
    }
  }

  protected confirmar(evento: Event): void {
    evento.preventDefault();
    void this.moderacion.confirmarDecision();
  }
}
