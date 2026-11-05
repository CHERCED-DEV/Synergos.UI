import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { RedDeBlogs } from '@synergos/dominio/blogs';
import { ButtonComponent } from '@synergos/shared';
import { NavegacionDeBlogs } from '../../estado/navegacion';

/**
 * El panel «Inicia sesión» de las cuatro superficies del usuario —notificaciones, mensajes, guardados y estudio—
 * (012-blogs-social, I2). El servidor pidió sesión: no se pinta nada de ejemplo, se ofrece entrar. El título y el texto
 * de cada superficie los proyecta su vista.
 *
 * WCAG 2.4.3 (Focus Order): el panel sustituye la vista sin mover el foco, así que el usuario de teclado no se entera de
 * que hay un «Iniciar sesión» nuevo. Cuando el 401 vino de una acción suya, la red enciende `panelFocusPending` y el
 * panel se enfoca al aparecer: el CONTENEDOR y no el botón, para que el lector lea el título y el texto (el porqué)
 * antes que las acciones. De ahí el `tabindex="-1"`, que lo hace enfocable por código sin meterlo en el orden de
 * tabulación.
 */
@Component({
  selector: 'sg-blogs-acceso',
  standalone: true,
  imports: [ButtonComponent],
  templateUrl: './acceso.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__pieza' },
})
export class BlogsAccesoComponent {
  protected readonly red = inject(RedDeBlogs);
  protected readonly navegacion = inject(NavegacionDeBlogs);

  readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    // El punto de reunión de las dos señales: corre al encenderse el latch y otra vez cuando la query resuelve al
    // panel recién pintado. El latch se apaga al enfocar, así que los re-renders posteriores entran y salen por el
    // early-return sin tocar el foco —un `effect()` sobre `sessionAccess` le robaría el foco al usuario mientras tabula
    // dentro del propio panel—.
    effect(() => {
      const panel = this.panel();
      if (!this.red.panelFocusPending() || !panel) {
        return;
      }
      this.red.panelFocusPending.set(false);
      panel.nativeElement.focus();
    });
  }
}
