import { BffEventos } from '@synergos/contracts';
import { rechazoLocal, type Enviar, type ResultadoDelFlujo } from './transporte';

/**
 * El cliente de la puerta del CMS (`GET|POST /api/flujos/{flujo}/{operacion}`, ADR 0140 F3/F4),
 * tipado con el contrato GENERADO: `OperacionesDeLaPuerta` da la forma de cada operación y
 * `OPERACIONES_DE_LA_PUERTA` —la tabla que el generador emite del mismo documento— lo que hace
 * falta en ejecución (método, llave, nombres de la consulta). No hay una copia a mano de ninguna
 * de las dos (regla 23): un renombre en el orquestador se regenera allá y rompe `tsc` acá
 * (`test:tipos-vitals`, regla 24).
 *
 * Hoy la puerta expone un solo orquestador (`Synergos.Bff.Eventos`). Cuando haya otro, su mapa y
 * su tabla se suman a estos dos: el cliente es genérico sobre ellos y no nombra ningún flujo.
 */
export type OperacionesDeLaPuerta = BffEventos.OperacionesDeLaPuerta;
export type TablaDeLaPuerta<TOperaciones> = BffEventos.TablaDeLaPuerta<TOperaciones>;
export const OPERACIONES_DE_LA_PUERTA: TablaDeLaPuerta<OperacionesDeLaPuerta> = BffEventos.OPERACIONES_DE_LA_PUERTA;

export const RUTA_DE_LA_PUERTA = '/api/flujos';

export type Flujo = keyof OperacionesDeLaPuerta & string;
export type OperacionDe<F extends Flujo> = keyof OperacionesDeLaPuerta[F] & string;

interface FormaDeOperacion {
  readonly metodo: 'GET' | 'POST';
  readonly consulta: unknown;
  readonly cuerpo: unknown;
  readonly respuesta: unknown;
  readonly llave: 'requerida' | 'opcional' | 'ninguna';
}

export type RespuestaDe<Op> = Op extends { readonly respuesta: infer R } ? R : never;

/**
 * Lo que una operación pide al llamarla, derivado de su forma: la consulta si la lleva, el cuerpo
 * si lo lleva, la llave si la exige (y nada de llave si no la admite).
 */
export type ArgsDe<Op> = Op extends FormaDeOperacion
  ? (Op['consulta'] extends undefined ? { readonly consulta?: undefined } : { readonly consulta: Op['consulta'] }) &
      (Op['cuerpo'] extends undefined ? { readonly cuerpo?: undefined } : { readonly cuerpo: Op['cuerpo'] }) &
      (Op['llave'] extends 'requerida'
        ? { readonly llave: string }
        : Op['llave'] extends 'opcional'
          ? { readonly llave?: string }
          : { readonly llave?: undefined }) & { readonly senal?: AbortSignal }
  : never;

/** ¿Es una clave de flujo que la puerta expone? Lo que viene del DOM se valida contra la tabla. */
export function esFlujo(valor: string | null | undefined): valor is Flujo {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(OPERACIONES_DE_LA_PUERTA, valor);
}

export interface ClienteDeLaPuerta<TOperaciones> {
  llamar<F extends keyof TOperaciones & string, O extends keyof TOperaciones[F] & string>(
    flujo: F,
    operacion: O,
    args: ArgsDe<TOperaciones[F][O]>,
    etiqueta?: string,
  ): Promise<ResultadoDelFlujo<RespuestaDe<TOperaciones[F][O]>>>;
}

interface FilaEnEjecucion {
  readonly metodo: 'GET' | 'POST';
  readonly llave: 'requerida' | 'opcional' | 'ninguna';
  readonly consulta: readonly string[];
}

/**
 * El cliente genérico. Lo que no está en la tabla no sale a la red; abrir sin llave tampoco (la
 * puerta lo rechazaría con `puerta.llave_requerida`, pero el cliente ya lo sabe); y la consulta
 * lleva SÓLO los nombres que la operación declara, codificados.
 */
export function crearClienteDeLaPuerta<TOperaciones>(
  tabla: TablaDeLaPuerta<TOperaciones>,
  enviar: Enviar,
  ruta: string = RUTA_DE_LA_PUERTA,
): ClienteDeLaPuerta<TOperaciones> {
  const filas = tabla as unknown as Readonly<Record<string, Readonly<Record<string, FilaEnEjecucion>> | undefined>>;
  return {
    async llamar(flujo, operacion, args, etiqueta) {
      const delFlujo = Object.prototype.hasOwnProperty.call(filas, flujo) ? filas[flujo] : undefined;
      const fila = delFlujo && Object.prototype.hasOwnProperty.call(delFlujo, operacion) ? delFlujo[operacion] : undefined;
      if (!fila) {
        return { ok: false, correlacion: '', rechazo: rechazoLocal('cliente.operacion_desconocida', `${flujo}/${operacion}`) };
      }
      const a = args as { consulta?: Readonly<Record<string, unknown>>; cuerpo?: unknown; llave?: string; senal?: AbortSignal };
      if (fila.llave === 'requerida' && !a.llave) {
        return { ok: false, correlacion: '', rechazo: rechazoLocal('cliente.llave_requerida', `${flujo}/${operacion}`) };
      }
      const pares = fila.consulta
        .filter((n) => a.consulta?.[n] !== undefined && a.consulta?.[n] !== null)
        .map((n): [string, string] => [n, String(a.consulta?.[n])]);
      const qs = new URLSearchParams(pares).toString();
      const url = `${ruta}/${encodeURIComponent(flujo)}/${encodeURIComponent(operacion)}${qs ? `?${qs}` : ''}`;
      const cabeceras: Record<string, string> = {};
      if (a.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
      if (a.llave && fila.llave !== 'ninguna') cabeceras['Idempotency-Key'] = a.llave;
      const r = await enviar({
        metodo: fila.metodo,
        url,
        cabeceras,
        cuerpo: a.cuerpo === undefined ? undefined : JSON.stringify(a.cuerpo),
        senal: a.senal,
        etiqueta: etiqueta ?? `${flujo}/${operacion}`,
      });
      return r as ResultadoDelFlujo<never>;
    },
  };
}
