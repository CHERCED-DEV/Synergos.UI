import type { BffViajes } from '@synergos/contracts';
import {
  abrirViajesReserva,
  cancelarViajesReserva,
  cerrarViajesReserva,
  clasificarRechazo,
  consultarViajesReserva,
  cotizarViajesReserva,
  listarViajesReserva,
  type RechazoDelFlujo,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';
import type { TravelTrip, TripStatus } from './travel.model';

/**
 * La reserva de un viaje por la puerta (línea 006, ADR 0140), tipada con el contrato GENERADO de
 * `Synergos.Bff.Viajes`.
 *
 * <p>Habla SÓLO con el coordinador (`<synergos-flujo flujo="viajes.reserva">`) que la vista coloca alrededor del
 * elemento: ninguna ruta propia, ningún `fetch`. El transporte sale del envoltorio GENERADO del flujo
 * (`generados/viajes.reserva.ts`), así que un renombre en el orquestador rompe la compilación de este fichero.</p>
 *
 * <p>Cada ítem viaja con su producto, su etiqueta y su periodo; el precio NO viaja: lo cotiza el servidor, y la
 * pantalla enseña el total que contesta.</p>
 */

/** El dinero como lo publica el contrato: unidades MAYORES de su moneda. */
export interface Importe {
  readonly amount: number;
  readonly currency: string;
}

/** Un ítem del itinerario como lo devuelve el servidor. */
export interface ParadaLeida {
  readonly producto: string;
  readonly etiqueta: string;
  readonly inicio: string;
  readonly fin: string;
}

/** Lo que la pantalla necesita de un viaje: lo que contestó el servidor, sin adornos. */
export interface ViajeLeido {
  readonly id: string;
  readonly numero: string;
  /** Running, Completed, Compensating, Compensated, CompensationFailed o Stuck. */
  readonly estado: string;
  readonly itinerario: readonly ParadaLeida[];
  /** `null` si el servidor no lo dio: la pantalla no inventa un total. */
  readonly total: Importe | null;
  /** Cuándo vence el primer apartado, si la agenda lo dijo. */
  readonly vence: string | null;
  /** Si queda algo por deshacer: mientras tanto no se afirma que no se cobró. */
  readonly deshaciendo: boolean;
}

/** Un ítem que se reserva: el producto de la oferta, su nombre en pantalla y su periodo. */
export interface ItemDelViaje {
  readonly producto: string;
  readonly etiqueta: string;
  readonly start: string;
  readonly end: string;
}

export function leerViaje(r: BffViajes.ViajesReservaRespuesta): ViajeLeido {
  return {
    id: r.id,
    numero: r.numero,
    estado: r.estado,
    itinerario: r.datos.itinerario ?? [],
    total: r.datos.total,
    vence: r.datos.vence,
    deshaciendo: r.deshaciendo || r.compensacionesPendientes > 0,
  };
}

function leido(r: ResultadoDelFlujo<BffViajes.ViajesReservaRespuesta>): ResultadoDelFlujo<ViajeLeido> {
  return r.ok ? { ...r, valor: leerViaje(r.valor) } : r;
}

/** Lo que viaja al cotizar y al abrir: cada ítem con su producto, su etiqueta y su ventana. */
export function entradaDelViaje(items: readonly ItemDelViaje[]): BffViajes.ViajesReservaEntrada {
  return {
    items: items.map((item) => ({
      producto: item.producto,
      etiqueta: item.etiqueta || null,
      ventana: { start: item.start, end: item.end },
    })),
  };
}

/** El total SIN apartar nada: el orquestador corre la fase que abre hasta antes de la agenda. Sin llave. */
export async function cotizarViaje(desde: Element, items: readonly ItemDelViaje[]): Promise<ResultadoDelFlujo<Importe | null>> {
  const r = await cotizarViajesReserva(desde, { cuerpo: entradaDelViaje(items) });
  return r.ok ? { ...r, valor: r.valor.datos.total } : r;
}

/** Aparta cada ítem y autoriza el total, sin mover plata. La llave es la de la intención. */
export async function abrirViaje(desde: Element, items: readonly ItemDelViaje[], llave: string): Promise<ResultadoDelFlujo<ViajeLeido>> {
  return leido(await abrirViajesReserva(desde, { cuerpo: entradaDelViaje(items), llave }));
}

/** Captura el total y confirma cada ítem. Idempotente sobre un viaje ya completado. */
export async function cerrarViaje(desde: Element, id: string): Promise<ResultadoDelFlujo<ViajeLeido>> {
  return leido(await cerrarViajesReserva(desde, { consulta: { id } }));
}

/** Suelta cada apartado y anula la autorización de un viaje que no se confirmó. */
export async function cancelarViaje(desde: Element, id: string): Promise<ResultadoDelFlujo<ViajeLeido>> {
  return leido(await cancelarViajesReserva(desde, { consulta: { id } }));
}

export async function consultarViaje(desde: Element, id: string): Promise<ResultadoDelFlujo<ViajeLeido>> {
  return leido(await consultarViajesReserva(desde, { consulta: { id } }));
}

/** Cuántos viajes trae «Mis viajes» de una vez: la ventana más grande que acepta el orquestador. */
const VIAJES_POR_PAGINA = 100;

/** Los viajes CONFIRMADOS de quien tiene la sesión (`listar`): lo deshecho o sin confirmar no es un viaje suyo. */
export async function listarViajes(desde: Element): Promise<ResultadoDelFlujo<readonly ViajeLeido[]>> {
  const r = await listarViajesReserva(desde, { consulta: { estado: 'Completed', limit: VIAJES_POR_PAGINA } });
  return r.ok ? { ...r, valor: r.valor.items.map(leerViaje) } : r;
}

/**
 * Un viaje CONFIRMADO por la puerta como lo pinta «Mis viajes»; `null` si no está confirmado, que no se enseña
 * como si lo estuviera. Las fechas son las del itinerario —cada ventana va de medianoche a medianoche UTC, así que su
 * día es el de la reserva— y el estado sale de ellas. El localizador de cada ítem es el número del viaje: por la
 * puerta no sale ningún identificador de la agenda.
 */
export function viajeComoTrip(viaje: ViajeLeido, ahora: number): TravelTrip | null {
  if (viaje.estado !== 'Completed') {
    return null;
  }
  const dia = (instante: string) => instante.slice(0, 10);
  const inicios = viaje.itinerario.map((p) => p.inicio).sort();
  const fines = viaje.itinerario.map((p) => p.fin).sort();
  const desde = inicios[0] ?? '';
  const hasta = fines[fines.length - 1] ?? '';
  const status: TripStatus =
    hasta && Date.parse(hasta) <= ahora ? 'completed' : desde && Date.parse(desde) <= ahora ? 'inprogress' : 'upcoming';
  return {
    ref: viaje.numero,
    title: viaje.itinerario.map((p) => p.etiqueta || p.producto).join(' · ') || viaje.numero,
    destination: viaje.numero,
    startDate: dia(desde),
    endDate: dia(hasta),
    status,
    total: viaje.total?.amount ?? 0,
    currency: viaje.total?.currency ?? '',
    items: viaje.itinerario.map((p) => ({
      product: null,
      title: p.etiqueta || p.producto,
      subtitle: `${dia(p.inicio)} → ${dia(p.fin)}`,
      reservationId: viaje.numero,
    })),
    porLaPuerta: true,
  };
}

/**
 * ¿Un «no» de abrir garantiza que no quedó ningún viaje con esa llave? Sí cuando lo dijo el negocio —el orquestador
 * rechaza antes de apartar o deshace lo apartado—, y cuando la puerta ni lo reenvió (sin sesión, no disponible). Lo
 * transitorio y lo ilegible pueden llegar con el viaje ABIERTO: la llave se queda retenida y el reintento lo
 * recupera, en vez de abrir otro al lado.
 */
export function abrirNoDejoViaje(rechazo: RechazoDelFlujo): boolean {
  const clase = clasificarRechazo(rechazo);
  return clase === 'negado' || clase === 'sesion' || clase === 'no_disponible';
}
