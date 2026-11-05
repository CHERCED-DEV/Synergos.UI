import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { PermisoDeSalud } from '@synergos/dominio/salud';
import { ButtonComponent, LiveRegionComponent } from '@synergos/shared';

/**
 * El permiso de datos de salud (T050), como vista propia (T051): en el paso del copago se DA —el texto que declara el CMS
 * y «Autorizo»— y en «Mis citas» se RETIRA. El estado y los casos de uso son de la fachada `PermisoDeSalud`; la vista
 * avisa la intención y la app la encadena (darlo vuelve a cotizar el copago).
 */
@Component({
  selector: 'sg-salud-permiso',
  standalone: true,
  imports: [ButtonComponent, LiveRegionComponent],
  templateUrl: './permiso.html',
  styleUrl: './permiso.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludPermisoComponent {
  protected readonly permiso = inject(PermisoDeSalud);

  /** Darlo (en el asistente) o retirarlo (en «Mis citas»). */
  readonly modo = input<'dar' | 'retirar'>('dar');
  /** Al darlo, si se pinta el texto con «Autorizo»: sólo cuando la puerta dijo que falta. El aviso se ve siempre. */
  readonly pedir = input(false);

  readonly aceptar = output<void>();
  readonly retirar = output<void>();
}
