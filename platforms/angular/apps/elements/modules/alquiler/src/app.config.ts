import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { AlquilerApiClient } from './alquiler/alquiler-api.client';

/**
 * El arranque de isla de `<synergos-alquiler>` — el vertical de alquiler de equipos (#147):
 * catálogo de equipos → ficha con tarifas por duración → cotizar → reservar (aparta la ventana,
 * retiene la garantía y emite el contrato) → mis alquileres con su comprobante sellado.
 *
 * Zoneless (sólo señales), como todos los elementos de Synergos. El objeto transaccional de este
 * dominio es un **alquiler con dos cobros de vidas distintas**: el alquiler se captura al
 * reservar y la GARANTÍA se retiene sin capturar hasta que el equipo vuelve. La pantalla lo dice
 * con todas las letras, porque una que pinte los dos montos igual hace creer que se cobró el
 * doble.
 *
 * Un solo `AlquilerApiClient` compartido: el catálogo, la reserva y la bandeja leen el mismo
 * borde y hablan del mismo alquiler.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), AlquilerApiClient],
};
