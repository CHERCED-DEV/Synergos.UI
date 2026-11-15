/** Mensajes, bandeja y estado de cuenta (003-salud-cita, I7), con la forma que da `/api/healthcare`. */

/** Un mensaje del hilo: si lo escribió el paciente, qué dice y cuándo. */
export interface MensajeClinico {
  readonly id: string;
  readonly delPaciente: boolean;
  readonly texto: string;
  readonly fecha: string;
}

/** Un hilo del paciente con un profesional. `esperando`: el consultorio todavía no contestó su último mensaje. */
export interface HiloDelPaciente {
  readonly id: string;
  readonly profesionalId: string;
  readonly profesional: string;
  readonly esperando: boolean;
  readonly ultimo: string;
  readonly mensajes: readonly MensajeClinico[];
}

/** Un hilo como lo ve el consultorio: además, de qué paciente es. */
export interface HiloDelConsultorio extends HiloDelPaciente {
  readonly pacienteKey: string;
  readonly paciente: string;
}

/** Lo que espera al médico: un resultado por liberar, una renovación pedida o un mensaje sin responder. */
export interface ItemDeLaBandeja {
  readonly tipo: 'resultado' | 'renovacion' | 'mensaje';
  readonly id: string;
  readonly pacienteKey: string;
  readonly paciente: string;
  readonly resumen: string;
  readonly fecha: string;
  readonly profesionalId: string | null;
}

/** La bandeja del consultorio, y cuántos pacientes no se vieron por falta de su permiso. */
export interface BandejaDelConsultorio {
  readonly items: readonly ItemDeLaBandeja[];
  readonly sinPermiso: number;
}

/** Una cita cobrada: su número, cuándo es, y lo que dice Payments de lo cobrado y lo devuelto (unidades mayores). */
export interface LineaDeLaCuenta {
  readonly citaId: string;
  readonly numero: string;
  readonly inicio: string | null;
  readonly cobrado: number;
  readonly devuelto: number;
  readonly moneda: string;
}

/** Lo que suma la cuenta en una moneda. */
export interface TotalDeLaCuenta {
  readonly moneda: string;
  readonly cobrado: number;
  readonly devuelto: number;
  readonly neto: number;
}

/** El estado de cuenta del paciente. */
export interface CuentaDelPaciente {
  readonly lineas: readonly LineaDeLaCuenta[];
  readonly totales: readonly TotalDeLaCuenta[];
}
