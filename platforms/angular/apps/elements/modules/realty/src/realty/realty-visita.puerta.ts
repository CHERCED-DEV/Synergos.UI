import type { BffPropiedades } from '@synergos/contracts';
import {
  abrirPropiedadesVisita,
  abrirPropiedadesVisitaCancelacion,
  cancelarPropiedadesVisita,
  cerrarPropiedadesVisita,
  cerrarPropiedadesVisitaCancelacion,
  consultarPropiedadesVisita,
  disponibilidadPropiedadesVisita,
  listarPropiedadesVisita,
  listarPropiedadesVisitaCancelacion,
  type Flujo,
  type RechazoDelFlujo,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';
import type { VisitMode } from './realty.model';

/**
 * La visita a un inmueble por la puerta, tipada con el contrato GENERADO de
 * `Synergos.Bff.Propiedades` (008-propiedades-visita, ADR 0140): la clave del flujo, sus
 * operaciones y la lectura de su respuesta.
 *
 * <p>Habla SÓLO con el coordinador (`<synergos-flujo>`) que la vista coloca alrededor del elemento,
 * y el transporte sale del envoltorio GENERADO del flujo (`generados/propiedades.visita.ts`, núcleo
 * N3: gana el generado). Un renombre en el orquestador se regenera allí y rompe la compilación de
 * este fichero (regla 24).</p>
 *
 * <p><b>El inmueble viaja como referencia con la clase que declara la definición</b> (NR-1): el
 * contrato generado la tipa como literal, así que otra clase no compila, y el orquestador la rechaza
 * igual si alguien la cambia en el DOM. El navegador sólo aporta el id de la ficha.</p>
 */
export const FLUJO_VISITA = 'propiedades.visita' as const satisfies Flujo;

/**
 * Cancelar una visita YA confirmada (008-P5): otro flujo, posterior a la visita. Su coordinador también lo coloca la
 * vista; sin él no hay a quién pedirla, y la pantalla no la ofrece.
 */
export const FLUJO_CANCELACION = 'propiedades.visita-cancelacion' as const satisfies Flujo;

/** Lo que la pantalla necesita de una visita por la puerta: lo que contestó el servidor. */
export interface VisitaLeida {
  readonly id: string;
  /** Lo que ve la persona y lo que dice su correo. */
  readonly numero: string;
  /** Running, Completed, Compensating, Compensated o CompensationFailed. */
  readonly estado: string;
  readonly inmueble: string;
  readonly ventana: { readonly start: string; readonly end: string } | null;
  readonly modo: VisitMode;
}

export function leerVisita(r: BffPropiedades.PropiedadesVisitaRespuesta): VisitaLeida {
  return {
    id: r.id,
    numero: r.numero,
    estado: r.estado,
    inmueble: r.datos.inmueble?.id ?? '',
    ventana: r.datos.ventana ?? null,
    modo: r.datos.modo === 'video' ? 'video' : 'in-person',
  };
}

function leida(r: ResultadoDelFlujo<BffPropiedades.PropiedadesVisitaRespuesta>): ResultadoDelFlujo<VisitaLeida> {
  return r.ok ? { ...r, valor: leerVisita(r.valor) } : r;
}

/** El cuerpo de abrir: el inmueble con su clase fija, la ventana de la franja y la modalidad. */
export function entradaDeLaVisita(
  inmueble: string,
  ventana: { readonly start: string; readonly end: string },
  modalidad: VisitMode,
): BffPropiedades.PropiedadesVisitaEntrada {
  return { inmueble: { kind: 'realty.listado', id: inmueble }, ventana: { start: ventana.start, end: ventana.end }, modalidad };
}

/** Aparta la franja. La llave es la de la INTENCIÓN: un reintento con ella no aparta dos veces. */
export async function abrirVisita(
  desde: Element,
  inmueble: string,
  ventana: { readonly start: string; readonly end: string },
  modalidad: VisitMode,
  llave: string,
): Promise<ResultadoDelFlujo<VisitaLeida>> {
  return leida(await abrirPropiedadesVisita(desde, { cuerpo: entradaDeLaVisita(inmueble, ventana, modalidad), llave }));
}

export async function cerrarVisita(desde: Element, id: string): Promise<ResultadoDelFlujo<VisitaLeida>> {
  return leida(await cerrarPropiedadesVisita(desde, { consulta: { id } }));
}

export async function consultarVisita(desde: Element, id: string): Promise<ResultadoDelFlujo<VisitaLeida>> {
  return leida(await consultarPropiedadesVisita(desde, { consulta: { id } }));
}

export async function cancelarVisita(desde: Element, id: string): Promise<ResultadoDelFlujo<VisitaLeida>> {
  return leida(await cancelarPropiedadesVisita(desde, { consulta: { id } }));
}

/** Si el rechazo es de la sesión: la puerta pide iniciarla y no dice nada de la visita. */
export const esDeSesion = (r: RechazoDelFlujo): boolean =>
  r.code === 'puerta.sesion_requerida' || r.code === 'cliente.redirigido';

/**
 * Cerrar y, si no contestó con la visita, CONSULTARLA: después de un rechazo lo que dice qué quedó es su
 * estado, no el rechazo. Así la pantalla nunca dice «agendada» ni «no quedó» sin saberlo.
 */
export async function cerrarYAsentar(
  desde: Element,
  id: string,
): Promise<{ readonly visita: VisitaLeida | null; readonly rechazo: RechazoDelFlujo | null }> {
  const r = await cerrarVisita(desde, id);
  if (r.ok) return { visita: r.valor, rechazo: null };
  if (esDeSesion(r.rechazo)) return { visita: null, rechazo: r.rechazo };
  const consulta = await consultarVisita(desde, id);
  return consulta.ok ? { visita: consulta.valor, rechazo: r.rechazo } : { visita: null, rechazo: r.rechazo };
}

/** Una franja de la agenda del inmueble, con lo que le queda libre (008-P3: la dice la agenda, no una regla del CMS). */
export interface FranjaDeLaAgenda {
  readonly start: string;
  readonly end: string;
  readonly libres: number;
}

/**
 * Las franjas del inmueble entre dos instantes: la lectura sin saga «disponibilidad» (núcleo NB-3), que la puerta abre
 * también a quien no inició sesión. Leer no aparta nada: que siga libre al elegirla lo dice abrir.
 */
export async function franjasDeLaVisita(
  desde: Element,
  inmueble: string,
  entre: { readonly desde: string; readonly hasta: string },
): Promise<ResultadoDelFlujo<readonly FranjaDeLaAgenda[]>> {
  const r = await disponibilidadPropiedadesVisita(desde, {
    cuerpo: { inmueble: { kind: 'realty.listado', id: inmueble }, desde: entre.desde, hasta: entre.hasta },
  });
  return r.ok ? { ...r, valor: (r.valor.datos.franjas ?? []).map((f) => ({ start: f.inicio, end: f.fin, libres: f.libres })) } : r;
}

/** Cuántas visitas de la puerta lee «Mis visitas»: la página más larga que la puerta sirve sin pedir otra. */
const PAGINA_DE_MIS_VISITAS = 50;

/**
 * «Mis visitas» por la puerta (núcleo NB-6): de las sagas de quien tiene la sesión, las visitas completadas —las
 * confirmadas— y, de las cancelaciones completadas, la visita que cancela cada una. El dueño lo pone la puerta, no la
 * consulta; una en curso no está confirmada, y una deshecha no es una visita.
 */
export async function misVisitasDeLaPuerta(
  desde: Element,
): Promise<ResultadoDelFlujo<{ readonly visitas: readonly VisitaLeida[]; readonly canceladas: ReadonlySet<string> }>> {
  const [visitas, cancelaciones] = await Promise.all([
    listarPropiedadesVisita(desde, { consulta: { limit: PAGINA_DE_MIS_VISITAS } }),
    listarPropiedadesVisitaCancelacion(desde, { consulta: { limit: PAGINA_DE_MIS_VISITAS } }),
  ]);
  if (!visitas.ok) return visitas;
  // Sin el coordinador de la cancelación la vista no la ofrece, así que desde este sitio no se canceló ninguna: las
  // visitas se ven igual. Cualquier otro no es no saber cuáles siguen en pie, y se dice.
  if (!cancelaciones.ok && cancelaciones.rechazo.code !== 'cliente.sin_coordinador') return cancelaciones;
  const canceladas = new Set(
    cancelaciones.ok
      ? cancelaciones.valor.items.filter((c) => c.estado === 'Completed').map((c) => c.datos.visita ?? '').filter((id) => id !== '')
      : [],
  );
  return { ...visitas, valor: { visitas: visitas.valor.items.filter((v) => v.estado === 'Completed').map(leerVisita), canceladas } };
}

/**
 * Cancelar una visita YA confirmada (008-P5): la operación posterior al cierre, en dos pasos. Abrir PIDE —comprueba que es
 * tuya y está confirmada, sin tocar la agenda— y cerrar CONFIRMA: la agenda la cancela con su plazo de aviso, y su
 * rechazo vuelve con su código (`booking.cancellation_too_late`, `booking.already_cancelled`). La llave es la de la
 * intención: repetir con ella no cancela dos veces.
 */
export async function cancelarVisitaConfirmada(
  desde: Element,
  visita: string,
  llave: string,
): Promise<ResultadoDelFlujo<true>> {
  const pedida = await abrirPropiedadesVisitaCancelacion(desde, { cuerpo: { visita }, llave });
  if (!pedida.ok) return pedida;
  if (pedida.valor.estado === 'Completed') return { ...pedida, valor: true };
  const cancelada = await cerrarPropiedadesVisitaCancelacion(desde, { consulta: { id: pedida.valor.id } });
  return cancelada.ok ? { ...cancelada, valor: true } : cancelada;
}
