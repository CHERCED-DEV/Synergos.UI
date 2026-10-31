import type { BffGobierno } from '@synergos/contracts';
import {
  abrirGobiernoRadicacion,
  avisoDelFlujo,
  cancelarGobiernoRadicacion,
  cerrarGobiernoRadicacion,
  FLUJO_GOBIERNO_RADICACION,
  idAleatorio,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';

/**
 * La radicación por la puerta (009-gobierno-tramite T031, ADR 0140), tipada con el contrato GENERADO de
 * `Synergos.Bff.Gobierno`.
 *
 * <p>Habla SÓLO con el coordinador (`<synergos-flujo flujo="gobierno.radicacion">`) que la vista coloca alrededor del
 * elemento: ninguna ruta propia hacia el orquestador. El transporte sale del envoltorio GENERADO del flujo
 * (`generados/gobierno.radicacion.ts`), así que un renombre en el orquestador rompe la compilación.</p>
 *
 * <p>El trámite viaja como REFERENCIA con la clase que declara la definición (NR-1), por su clave del nodo —la misma
 * con que el CMS publicó su tasa—. La tasa la calcula el servidor: el navegador no manda precios. La aceptación de la
 * notificación electrónica, con la versión del texto, viaja al abrir.</p>
 */

/** La clase del trámite que declara la definición del flujo. */
export const CLASE_DEL_TRAMITE = 'gobierno.tramite';

/** Por dónde radica la página, como lo DECLARA el CMS (`camino`). */
export type CaminoDeLaRadicacion = 'puerta' | 'directa' | 'no-disponible';

/** El camino que declara el CMS; sin declaración (standalone, un CMS anterior), la ruta directa de siempre. */
export function caminoDeLaRadicacion(valor: string | undefined | null): CaminoDeLaRadicacion {
  const camino = (valor ?? '').trim().toLowerCase();
  return camino === 'puerta' || camino === 'no-disponible' ? camino : 'directa';
}

/** El dinero como lo publica el contrato: unidades MAYORES de su moneda. */
export interface Importe {
  readonly amount: number;
  readonly currency: string;
}

/** Lo que la pantalla necesita de una radicación: lo que contestó el servidor, sin adornos. */
export interface RadicacionLeida {
  readonly id: string;
  readonly numero: string;
  /** Running, Completed, Compensating, Compensated, CompensationFailed o Stuck. */
  readonly estado: string;
  /** `null` si el servidor no lo dio: la pantalla no inventa una tasa. */
  readonly total: Importe | null;
  /** Si queda algo por deshacer: mientras tanto no se afirma que no se cobró. */
  readonly deshaciendo: boolean;
}

export function leerRadicacion(r: BffGobierno.GobiernoRadicacionRespuesta): RadicacionLeida {
  return {
    id: r.id,
    numero: r.numero,
    estado: r.estado,
    total: r.datos.total,
    deshaciendo: r.deshaciendo || r.compensacionesPendientes > 0,
  };
}

function leida(r: ResultadoDelFlujo<BffGobierno.GobiernoRadicacionRespuesta>): ResultadoDelFlujo<RadicacionLeida> {
  return r.ok ? { ...r, valor: leerRadicacion(r.valor) } : r;
}

/** Lo que viaja al abrir: el trámite con su clase, y la aceptación con la versión del texto que se leyó. */
export function entradaDeLaRadicacion(
  tramite: string,
  aceptaNotificacion: boolean,
  versionDelTexto: string,
): BffGobierno.GobiernoRadicacionEntrada {
  return { tramite: { kind: CLASE_DEL_TRAMITE, id: tramite }, notificacionElectronica: aceptaNotificacion, versionDelTexto };
}

/**
 * La llave de abrir: UNA por intención de radicar, nueva cada vez que el ciudadano empieza el formulario. El orquestador
 * la guarda por ciudadano, así que el doble clic, un reintento tras un corte o una respuesta perdida caen en la MISMA
 * radicación y un solo cobro (SC-006); y radicar el mismo trámite otra vez —otro certificado— es otra intención. El azar
 * es el del transporte (`idAleatorio`): `crypto.randomUUID` no existe fuera de un contexto seguro.
 */
export function nuevaLlaveDeLaRadicacion(tramite: string): string {
  return `radicacion-${tramite}-${idAleatorio()}`;
}

/**
 * La llave de un acto sobre el expediente (tomar, decidir, subsanar; 009 T039): UNA por intención, como la de la
 * radicación. El CMS la lleva al flujo posterior de un expediente de la puerta atada a la persona, así que el doble clic
 * o el reintento tras un corte caen en el mismo acto; otro acto, después, es otra intención.
 */
export function nuevaLlaveDelActo(acto: string): string {
  return `${acto}-${idAleatorio()}`;
}

/** Abre la radicación: autoriza la tasa (o la omite si el trámite es gratuito), sin mover plata. */
export async function abrirRadicacion(
  desde: Element,
  tramite: string,
  aceptaNotificacion: boolean,
  versionDelTexto: string,
  llave: string,
): Promise<ResultadoDelFlujo<RadicacionLeida>> {
  return leida(await abrirGobiernoRadicacion(desde, {
    cuerpo: entradaDeLaRadicacion(tramite, aceptaNotificacion, versionDelTexto),
    llave,
  }));
}

/** Captura la tasa, hace nacer el expediente en el proceso y avisa. Idempotente sobre una radicación ya cerrada. */
export async function cerrarRadicacion(desde: Element, id: string): Promise<ResultadoDelFlujo<RadicacionLeida>> {
  return leida(await cerrarGobiernoRadicacion(desde, { consulta: { id } }));
}

/** Deshace una radicación abierta: anula la autorización. */
export async function cancelarRadicacion(desde: Element, id: string): Promise<ResultadoDelFlujo<RadicacionLeida>> {
  return leida(await cancelarGobiernoRadicacion(desde, { consulta: { id } }));
}

/**
 * Con qué parámetro llega a la página el enlace del correo de la radicación: el de la tabla GENERADA de las rutas del
 * CMS (`Synergos:Puerta:Flujos:gobierno.radicacion:Aviso:Ruta`, núcleo N3), no un literal de aquí. Vacío si nadie avisa.
 */
function parametroDelAviso(): string {
  return avisoDelFlujo(FLUJO_GOBIERNO_RADICACION)?.parametro ?? '';
}

/** La radicación del enlace del aviso (`?radicacion={id}`), o vacío. */
export function radicacionDelEnlace(): string {
  const parametro = parametroDelAviso();
  if (typeof window === 'undefined' || !parametro) return '';
  return new URLSearchParams(window.location.search).get(parametro)?.trim() ?? '';
}

/** Quita el parámetro del aviso de la URL: se usa una vez, y lo que quede lo reabriría en cada recarga. */
export function consumirRadicacionDelEnlace(): void {
  const parametro = parametroDelAviso();
  if (typeof window === 'undefined' || !parametro) return;
  const consulta = new URLSearchParams(window.location.search);
  if (!consulta.has(parametro)) return;
  consulta.delete(parametro);
  const texto = consulta.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${texto ? `?${texto}` : ''}${window.location.hash}`);
}
