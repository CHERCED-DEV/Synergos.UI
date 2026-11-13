/**
 * La historia clínica de producción como la leen el portal y el consultorio (003-salud-cita, I2 T062–T063), con la forma
 * de `/api/healthcare` (`ResumenParaLeer` del CMS).
 */

/** Si el paciente dio el permiso para que el consultorio vea su historia, leído en `Api.Consent`. */
export type PermisoDeLaHistoria = 'vigente' | 'falta' | 'desconocido';

/** Un dato del resumen: una condición, una alergia o una vacuna, declarada por el paciente o validada por el médico. */
export interface DatoDelResumen {
  readonly id: string;
  readonly tipo: string;
  readonly descripcion: string;
  readonly fecha: string | null;
  readonly estado: string;
  readonly origen: string;
}

/** Lo último que declaró el paciente en su check-in. */
export interface PreRegistroLeido {
  readonly documento: string;
  readonly telefono: string;
  readonly direccion: string;
  readonly contactoDeEmergencia: string;
  readonly aseguradora: string;
  readonly numeroDeAfiliacion: string;
  readonly medicamentos: readonly string[];
  readonly motivoDeLaVisita: string;
  readonly declaradoUtc: string;
}

export interface ResumenDeLaHistoria {
  readonly datos: readonly DatoDelResumen[];
  readonly preRegistro: PreRegistroLeido | null;
  /** `false` es «nadie lo ha llenado», no «sin alergias». */
  readonly hayResumen: boolean;
  /** Sólo en el del paciente; `null` donde el CMS no lo lee. */
  readonly permisoDeLaHistoria: PermisoDeLaHistoria | null;
}

/** Lo que el paciente manda en su check-in. Todo es opcional. */
export interface CheckInDelPaciente {
  readonly documento?: string;
  readonly telefono?: string;
  readonly direccion?: string;
  readonly contactoDeEmergencia?: string;
  readonly aseguradora?: string;
  readonly numeroDeAfiliacion?: string;
  readonly motivoDeLaVisita?: string;
  readonly medicamentos?: readonly string[];
  readonly condiciones?: readonly string[];
  readonly alergias?: readonly string[];
}

/** Lo que recepción encuentra por el correo de un miembro: `patientKey` nulo es «el miembro aún no tiene historia». */
export interface HistoriaEncontrada {
  readonly patientKey: string | null;
  readonly nombre: string;
  readonly preRegistrado: boolean;
}

/** Lo que recepción pone al abrirla: quién es, y nada clínico. La fecha va como `aaaa-mm-dd`. */
export interface AperturaDeLaHistoria {
  readonly correo: string;
  readonly nombre: string;
  readonly fechaDeNacimiento: string;
}

/** Los tipos de dato del resumen, en el orden en que se pintan. Cómo se llama cada uno lo dice la app. */
export const TIPOS_DEL_RESUMEN: readonly string[] = ['condicion', 'alergia', 'vacuna'];
