import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CatalogoDeLaTienda } from '@synergos/dominio/tienda';

/** Las preguntas al vendedor y sus respuestas, en la segunda pestaña de la ficha (014-despiece-tienda, T010). */
@Component({
  selector: 'sg-tienda-ficha-preguntas',
  standalone: true,
  templateUrl: './preguntas.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'storefront__vista' },
})
export class TiendaFichaPreguntasComponent {
  protected readonly catalogo = inject(CatalogoDeLaTienda);
}
