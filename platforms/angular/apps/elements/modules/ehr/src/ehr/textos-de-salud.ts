import type { TextosDeSalud } from '@synergos/dominio/salud';
import { elegirMensaje, t, type RechazoDelFlujo } from '@synergos/vitals-core';

/**
 * Lo que se dice de un rechazo de la cita por la puerta, elegido por su `code` y nunca por su `title`
 * (sección `Health.Appointment`, 003-salud-cita T025). Lo que no tiene texto propio cae al de su clase.
 */
export function mensajeDeLaCita(code: string): string {
  const porCodigo: Readonly<Record<string, string>> = {
    'consent.not_granted': t('Health.Appointment.ConsentMissing', 'Para agendar necesitamos tu autorización de tratamiento de datos de salud.'),
    'consent.revoked': t('Health.Appointment.ConsentMissing', 'Para agendar necesitamos tu autorización de tratamiento de datos de salud.'),
    'consent.expired': t('Health.Appointment.ConsentMissing', 'Para agendar necesitamos tu autorización de tratamiento de datos de salud.'),
    'booking.resource_not_found': t('Health.Appointment.NoAgenda', 'Este profesional no tiene agenda disponible.'),
    'booking.at_capacity': t('Health.Appointment.SlotTaken', 'Esa franja ya no está disponible. Elige otra.'),
    'booking.window_in_the_past': t('Health.Appointment.BadWindow', 'Esa hora no está en la agenda del profesional. Elige otra.'),
    'booking.outside_opening_hours': t('Health.Appointment.BadWindow', 'Esa hora no está en la agenda del profesional. Elige otra.'),
    'booking.off_slot_grid': t('Health.Appointment.BadWindow', 'Esa hora no está en la agenda del profesional. Elige otra.'),
    'booking.bad_slot_length': t('Health.Appointment.BadWindow', 'Esa hora no está en la agenda del profesional. Elige otra.'),
    'booking.crosses_midnight': t('Health.Appointment.BadWindow', 'Esa hora no está en la agenda del profesional. Elige otra.'),
    'booking.hold_expired': t('Health.Appointment.SlotExpired', 'Tu franja venció antes de confirmar. Elige otra.'),
    'booking.hold_released': t('Health.Appointment.SlotExpired', 'Tu franja venció antes de confirmar. Elige otra.'),
    'payments.payment_declined': t('Health.Appointment.PaymentFailed', 'No pudimos procesar el copago. No se te cobró nada.'),
    'payments.payment_failed': t('Health.Appointment.PaymentFailed', 'No pudimos procesar el copago. No se te cobró nada.'),
    'payments.voided': t('Health.Appointment.PaymentFailed', 'No pudimos procesar el copago. No se te cobró nada.'),
    'salud.not_continuable': t('Health.Appointment.NotConfirmable', 'Esta cita ya no se puede confirmar.'),
    'salud.already_completed': t('Health.Appointment.NotCancellable', 'Esta cita ya está confirmada; no se puede cancelar en línea.'),
    'salud.saga_not_found': t('Health.Appointment.NotFound', 'No encontramos esa cita en tu cuenta.'),
    'salud.entrada_invalida': t('Health.Appointment.BadRequest', 'Revisa los datos de la cita: falta alguno o no es válido.'),
  };
  if (code.startsWith('pricing.')) {
    return t('Health.Appointment.CopayUnavailable', 'No pudimos calcular el copago. Intenta de nuevo en un momento.');
  }
  // Sólo se sabe el `code` (el asistente pasa el motivo): lo transitorio y lo negado dicen lo mismo.
  const rechazo: RechazoDelFlujo = { code, status: 0, transient: false, detail: '', origen: 'servidor', extra: {} };
  const generico = t('Health.Appointment.Generic', 'No pudimos agendar tu cita. Intenta de nuevo.');
  return elegirMensaje(rechazo, porCodigo, {
    sesion: t('Health.Appointment.SignInRequired', 'Inicia sesión para ver y agendar tus citas.'),
    no_disponible: t('Health.Appointment.Unavailable', 'La agenda en línea no está disponible en este momento.'),
    reintentable: generico,
    defecto: generico,
    negado: generico,
  });
}

/** El estado de una cita como lo lee el paciente (`Health.Appointment`). */
export function estadoDeLaCita(estado: string): string {
  switch (estado) {
    case 'Running':
      return t('Health.Appointment.StatePending', 'Pendiente de confirmar');
    case 'Completed':
      return t('Health.Appointment.StateConfirmed', 'Confirmada');
    case 'Compensated':
      return t('Health.Appointment.StateUndone', 'No quedó agendada');
    default:
      return t('Health.Appointment.StateReview', 'En revisión');
  }
}

/** El encabezado de una cita: su número, el mismo con que la nombra el aviso. */
export function encabezadoDeLaCita(numero: string): string {
  return t('Health.Appointment.Heading', 'Tu cita {numero}', { numero });
}

/**
 * Lo que dicen las fachadas de Salud en ESTE portal (T051): la app los traduce con su diccionario y la lib decide cuál se
 * dice (`TEXTOS_DE_SALUD`). El permiso es la sección `Health.Consent`, cuya versión declara el CMS (`VersionDelPermiso`):
 * el borrador lo aprueba el arquitecto antes de encender Salud (S-4).
 */
export function textosDeSaludDelPortal(): TextosDeSalud {
  return {
    permiso: {
      titulo: t('Health.Consent.Title', 'Autorización para tratar tus datos de salud'),
      proposito: t(
        'Health.Consent.Purpose',
        'Para agendar tu cita y prestarte la atención necesitamos tratar datos sobre tu salud: el motivo de la consulta, tus citas y lo que registren los profesionales que te atiendan. Son datos sensibles. Darlos es facultativo y no estás obligado a autorizarlo; sin esta autorización, eso sí, no podemos agendar tu cita en línea.',
      ),
      uso: t(
        'Health.Consent.Use',
        'Los usamos sólo para agendar y prestarte la atención que pediste. Los guardamos cifrados, y sólo los ve el personal del consultorio que te atiende. Puedes retirar esta autorización cuando quieras desde tu portal; retirarla no borra lo que la ley obliga a conservar de tu historia clínica.',
      ),
      responsable: t('Health.Consent.Responsible', 'El detalle está en la Política de tratamiento de datos.'),
      aceptar: t('Health.Consent.Accept', 'Autorizo'),
      retirar: t('Health.Consent.Revoke', 'Retirar mi autorización'),
      dado: t('Health.Consent.Granted', 'Diste tu autorización. Ya puedes agendar.'),
      retirado: t('Health.Consent.Revoked', 'Retiraste tu autorización. Para agendar tendrás que darla otra vez.'),
    },
    mensajeDeLaCita,
    sinHorasLibres: t('Health.Appointment.NoSlots', 'Este profesional no tiene horas libres en los próximos días.'),
  };
}
