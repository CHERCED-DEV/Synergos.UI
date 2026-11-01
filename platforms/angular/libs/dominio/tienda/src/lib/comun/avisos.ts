import { Injectable, signal } from '@angular/core';

/**
 * Lo que la tienda entera le dice a quien la mira, sea cual sea la vista (014-despiece-tienda, T008): si algo está
 * cargando y el último error. Lo encienden los casos de uso de la fachada; lo pinta la app.
 */
@Injectable()
export class AvisosDeLaTienda {
  readonly loading = signal(false);
  readonly errorMessage = signal('');
}
