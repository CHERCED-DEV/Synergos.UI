import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import { LiveAnnouncerService, type LivePoliteness } from '../../../services/live-announcer.service';

export type LiveRegionTone = 'neutral' | 'brand';

/**
 * `syn-live-region` — la fachada DECLARATIVA de `LiveAnnouncerService` (#82).
 *
 * Anuncia cada vez que cambia `message`, por la región del documento. **No pinta una región
 * propia**, y ésa es toda la diferencia con lo que era: un `<span role="status">{{ message }}</span>`
 * que, puesto dentro de un `@if`, nacía con su mensaje igual que el inline y callaba, y que con
 * el mismo texto dos veces no cambiaba el DOM. Ninguna plantilla la usó nunca, porque no le daba
 * nada a nadie que un `<p role="status">` escrito a mano no le diera.
 *
 * Con la ADR 0134 —no se retira por defecto; se FUSIONA si duplica un concepto— la pieza y el
 * servicio eran el mismo concepto en dos sitios, y ahora son uno: el motor es el servicio, y esta
 * pieza es la forma de pedírselo desde una plantilla. Por eso da igual dónde se ponga:
 *
 *   - FUERA de un bloque, anuncia los cambios de un valor (`[message]="hito()"`): el primer valor
 *     NO se anuncia —es el contenido de la carga—, salvo con `announceInitial`;
 *   - DENTRO de un `@if` que la crea junto con su mensaje, `announceInitial` hace que ese primer
 *     valor SÍ se anuncie, y se oye, porque la región del documento ya existía.
 *
 * Anuncia CAMBIOS: un `message` idéntico al anterior no es un cambio. Para repetir el mismo
 * texto (dos «Copiado» seguidos), se llama al servicio.
 */
@Component({
  selector: 'syn-live-region',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]': "visuallyHidden() ? 'none' : null",
  },
  template: `
    @if (!visuallyHidden()) {
      <span [class]="regionClass()">{{ message() }}</span>
    }
  `,
  styleUrl: './live-region.scss',
})
export class LiveRegionComponent {
  readonly message = input('');
  readonly politeness = input<LivePoliteness>('polite');
  /** Anunciar también el primer valor. Por defecto no: el contenido de la carga no se anuncia. */
  readonly announceInitial = input(false, { transform: booleanAttribute });
  /**
   * `false` además PINTA el mensaje como texto normal de la página —no como región viva—. Se lee
   * al recorrer la página; el anuncio sale igual por el servicio.
   */
  readonly visuallyHidden = input(true);
  readonly tone = input<LiveRegionTone>('neutral');

  readonly #announcer = inject(LiveAnnouncerService);
  #primero = true;

  constructor() {
    effect(() => {
      const mensaje = this.message().trim();
      untracked(() => {
        const primero = this.#primero;
        this.#primero = false;
        if (!mensaje || (primero && !this.announceInitial())) {
          return;
        }
        this.#announcer.announce(mensaje, this.politeness());
      });
    });
  }

  regionClass(): string {
    return classNames('syn-live-region', `syn-live-region--${this.tone()}`);
  }
}
