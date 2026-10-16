import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';

/**
 * El arranque de isla de `<synergos-reserva>` — la reserva de un servicio por franja
 * (011-booking-reserva): elegir día y hora dentro del horario publicado → el total que cotiza el
 * servidor → apartar → confirmar y pagar → el comprobante.
 *
 * Zoneless (sólo señales), como todos los elementos de Synergos. No hay cliente propio: la reserva
 * va entera por la puerta del CMS, a través del `<synergos-flujo>` que la vista coloca alrededor
 * (ADR 0140), así que no hay nada que proveer aparte de la detección de cambios.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection()],
};
