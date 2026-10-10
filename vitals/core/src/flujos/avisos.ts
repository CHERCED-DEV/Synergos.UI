import type { Flujo } from './puerta';

/**
 * El enlace del aviso de cada flujo: con qué parámetro de la CONSULTA llega a la página, y qué
 * marcador de la ruta del CMS lo llena (ADR 0140 F4).
 *
 * El CMS escribe la ruta en `Synergos:Puerta:Flujos:{flujo}:Aviso:Ruta` (hoy `/eventos/?compra={id}`)
 * y el participante lee el parámetro. Son dos literales en dos repos, y el validador de la puerta
 * sólo exige que la ruta sea del sitio y que sus marcadores existan: un `/?id={id}` arrancaba y el
 * enlace del correo abría la cartelera sin decir nada. `gate:avisos` (G-15) cruza esta tabla con el
 * `appsettings.json` del CMS, en los dos sentidos.
 */
export interface AvisoDelFlujo {
  readonly parametro: string;
  readonly marcador: string;
}

export const AVISOS_DE_LOS_FLUJOS = {
  'eventos.compra': { parametro: 'compra', marcador: 'id' },
} as const satisfies Readonly<Partial<Record<Flujo, AvisoDelFlujo>>>;
