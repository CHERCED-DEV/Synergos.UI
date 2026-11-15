import type { CitaLeida } from '../cita/cita.model';
import type { HiloDelPaciente } from '../mensajes/mensajes.model';
import type { OrdenDelPaciente } from '../ordenes/ordenes.model';

/**
 * El inicio del paciente (003-salud-cita, I8 P19), compuesto con lo que ya leen las demás vistas: ninguna lectura nueva. Lo
 * que aquí se decide es qué se cuenta en cada tarjeta.
 */

/** La próxima cita: la confirmada más cercana que no ha empezado y que el paciente no canceló. `null` si no hay. */
export function proximaCita(citas: readonly CitaLeida[], canceladas: ReadonlySet<string>, ahora: number): CitaLeida | null {
  return (
    citas
      .filter((c) => c.estado === 'Completed' && c.ventana && !canceladas.has(c.id) && Date.parse(c.ventana.start) > ahora)
      .sort((a, b) => Date.parse(a.ventana!.start) - Date.parse(b.ventana!.start))[0] ?? null
  );
}

/** Cuántos resultados ve el paciente: los que el médico ya liberó. */
export function resultadosLiberados(ordenes: readonly OrdenDelPaciente[]): number {
  return ordenes.flatMap((o) => o.examenes).filter((e) => e.resultado?.liberado).length;
}

/** Cuántas conversaciones contestó el consultorio y cuántas esperan su respuesta. */
export function estadoDeLosMensajes(hilos: readonly HiloDelPaciente[]): { readonly respondidos: number; readonly esperando: number } {
  const esperando = hilos.filter((h) => h.esperando).length;
  return { respondidos: hilos.length - esperando, esperando };
}
