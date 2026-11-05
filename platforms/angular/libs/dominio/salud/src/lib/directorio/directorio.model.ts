/**
 * Lo que el profesional declara de su agenda: los días (0 = domingo, como `Date.getDay()`), de qué hora a qué hora y
 * cuántos minutos dura cada franja. Las franjas LIBRES no salen de aquí: son de la agenda (Booking).
 */
export interface AgendaDeclarada {
  readonly dias: readonly number[];
  readonly desde: number;
  readonly hasta: number;
  readonly minutos: number;
}

/** Un profesional del directorio de Salud, como lo da `GET {lecturasBase}/catalogo`. */
export interface Profesional {
  readonly id: string;
  readonly nombre: string;
  readonly especialidad: string;
  /** El registro médico, o vacío si no consta. */
  readonly registro: string;
  readonly telefono: string;
  readonly correo: string;
  /** Si admite pacientes nuevos. **`null` = no consta**, y no «sí» (#111). */
  readonly aceptaPacientes: boolean | null;
  readonly foto: string | null;
  /** La agenda declarada, o `null` si el listado no la trae entera. */
  readonly agenda: AgendaDeclarada | null;
}
