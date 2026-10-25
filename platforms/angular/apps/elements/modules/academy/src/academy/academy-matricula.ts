import type { BffEducacion } from '@synergos/contracts';
import {
  abrirEducacionMatricula,
  cancelarEducacionMatricula,
  cerrarEducacionMatricula,
  consultarEducacionMatricula,
  cotizarEducacionMatricula,
  type ResultadoDelFlujo,
} from '@synergos/vitals-core';

/**
 * La matrícula por la puerta (010-educacion-matricula, ADR 0140), tipada con el contrato GENERADO de
 * `Synergos.Bff.Educacion`.
 *
 * <p>Habla SÓLO con el coordinador (`<synergos-flujo flujo="educacion.matricula">`) que la vista coloca alrededor del
 * elemento: ninguna ruta propia, ningún `fetch`. El transporte sale del envoltorio GENERADO del flujo
 * (`generados/educacion.matricula.ts`, núcleo N3), así que un renombre en el orquestador rompe la compilación.</p>
 *
 * <p>El curso viaja como REFERENCIA con la clase que declara la definición (NR-1); el plan, por su código. El total lo
 * calcula el servidor: el navegador no manda precios.</p>
 */

/** La clase del curso que declara la definición del flujo. */
export const CLASE_DEL_CURSO = 'educacion.curso';

/** El dinero como lo publica el contrato: unidades MAYORES de su moneda. */
export interface Importe {
  readonly amount: number;
  readonly currency: string;
}

/** Lo que la pantalla necesita de una matrícula: lo que contestó el servidor, sin adornos. */
export interface MatriculaLeida {
  readonly id: string;
  readonly numero: string;
  /** Running, Completed, Compensating, Compensated, CompensationFailed o Stuck. */
  readonly estado: string;
  readonly cursoId: string;
  readonly plan: string | null;
  /** `null` si el servidor no lo dio: la pantalla no inventa un total. */
  readonly total: Importe | null;
  /** Si queda algo por deshacer: mientras tanto no se afirma que no se cobró. */
  readonly deshaciendo: boolean;
}

export function leerMatricula(r: BffEducacion.EducacionMatriculaRespuesta): MatriculaLeida {
  return {
    id: r.id,
    numero: r.numero,
    estado: r.estado,
    cursoId: r.datos.curso?.id ?? '',
    plan: r.datos.plan,
    total: r.datos.total,
    deshaciendo: r.deshaciendo || r.compensacionesPendientes > 0,
  };
}

function leida(r: ResultadoDelFlujo<BffEducacion.EducacionMatriculaRespuesta>): ResultadoDelFlujo<MatriculaLeida> {
  return r.ok ? { ...r, valor: leerMatricula(r.valor) } : r;
}

/** Lo que viaja al cotizar y al abrir: el curso con su clase y el plan elegido (sin plan, el precio del curso). */
export function entradaDeLaMatricula(cursoId: string, plan: string | null | undefined): BffEducacion.EducacionMatriculaEntrada {
  return { curso: { kind: CLASE_DEL_CURSO, id: cursoId }, plan: plan?.trim() ? plan.trim() : null };
}

/**
 * La llave de abrir: la del CURSO, determinista. El orquestador la guarda por alumno, así que dos pestañas, una recarga
 * o una respuesta perdida caen en la MISMA matrícula y un solo cobro (FR-007). Una deshecha deja volver a intentar con
 * identidad propia; una completada se devuelve tal cual.
 *
 * <p>Por eso, tras una DEVOLUCIÓN del personal (010-P2 B) la llave cambia: la devuelta sigue completada en el
 * orquestador y la misma llave la devolvería a ella. `devueltas` —las de ese curso, que entrega «mi aprendizaje»— la
 * numera (`matricula-{curso}-{n}`); sin devoluciones es la de siempre.</p>
 */
export function llaveDeLaMatricula(cursoId: string, devueltas = 0): string {
  return devueltas > 0 ? `matricula-${cursoId}-${devueltas}` : `matricula-${cursoId}`;
}

/** El total SIN abrir nada: el orquestador corre la fase que abre hasta antes de autorizar y no guarda nada. */
export async function cotizarMatricula(desde: Element, cursoId: string, plan: string | null): Promise<ResultadoDelFlujo<Importe | null>> {
  const r = await cotizarEducacionMatricula(desde, { cuerpo: entradaDeLaMatricula(cursoId, plan) });
  return r.ok ? { ...r, valor: r.valor.datos.total } : r;
}

/** Abre la matrícula: autoriza el cobro (o lo omite con total cero), sin mover plata. */
export async function abrirMatricula(
  desde: Element, cursoId: string, plan: string | null, devueltas = 0,
): Promise<ResultadoDelFlujo<MatriculaLeida>> {
  return leida(await abrirEducacionMatricula(desde, {
    cuerpo: entradaDeLaMatricula(cursoId, plan),
    llave: llaveDeLaMatricula(cursoId, devueltas),
  }));
}

/** Captura el cobro y avisa. Idempotente sobre una matrícula ya cerrada. */
export async function cerrarMatricula(desde: Element, id: string): Promise<ResultadoDelFlujo<MatriculaLeida>> {
  return leida(await cerrarEducacionMatricula(desde, { consulta: { id } }));
}

/** Deshace una matrícula abierta: anula la autorización. Lo usa cambiar de plan. */
export async function cancelarMatricula(desde: Element, id: string): Promise<ResultadoDelFlujo<MatriculaLeida>> {
  return leida(await cancelarEducacionMatricula(desde, { consulta: { id } }));
}

export async function consultarMatricula(desde: Element, id: string): Promise<ResultadoDelFlujo<MatriculaLeida>> {
  return leida(await consultarEducacionMatricula(desde, { consulta: { id } }));
}
