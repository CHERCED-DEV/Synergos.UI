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
      // La historia se conserva por ley aunque se borre la cuenta (ADR 0142 del CMS). BORRADOR: lo aprueba el
      // arquitecto antes del release, con el resto de la sección.
      conservacion: t(
        'Health.Consent.Retention',
        'Tu historia clínica se conserva el tiempo que la ley obliga (hoy, al menos quince años desde tu última atención), aunque borres tu cuenta o pidas suprimir tus datos. En ese caso la cuenta se borra y la historia deja de estar ligada a ella; sigue cifrada y sólo se usa para lo que la ley pide.',
      ),
      aceptar: t('Health.Consent.Accept', 'Autorizo'),
      retirar: t('Health.Consent.Revoke', 'Retirar mi autorización'),
      dado: t('Health.Consent.Granted', 'Diste tu autorización. Ya puedes agendar.'),
      retirado: t('Health.Consent.Revoked', 'Retiraste tu autorización. Para agendar tendrás que darla otra vez.'),
    },
    mensajeDeLaCita,
    sinHorasLibres: t('Health.Appointment.NoSlots', 'Este profesional no tiene horas libres en los próximos días.'),
    // Lo que dicen las fachadas de la historia (I2 T062–T063): la sección `Health.Record`.
    historia: {
      checkInGuardado: t('Health.Record.CheckInSaved', 'Listo: tu pre-registro quedó en tu historia. El médico revisará lo que declaraste.'),
      checkInRevisa: t('Health.Record.CheckInInvalid', 'Revisa lo que escribiste: algún dato es demasiado largo o tiene una fecha que no sirve.'),
      checkInSinHistoria: t('Health.Record.NoRecordTitle', 'Todavía no tienes historia clínica'),
      checkInSinSesion: t('Health.Record.SignInTitle', 'Inicia sesión para ver tu salud'),
      checkInFallo: t('Health.Record.CheckInFailed', 'No pudimos guardar tu pre-registro. Intenta de nuevo.'),
      aperturaLista: t('Health.Record.OpenDone', 'Historia abierta. El paciente ya puede hacer su pre-registro.'),
      aperturaSinRol: t('Health.Record.OpenNoRole', 'Tu rol no abre historias: lo hacen recepción y el médico.'),
      aperturaRevisa: t('Health.Record.OpenInvalid', 'Revisa el nombre y la fecha de nacimiento (aaaa-mm-dd).'),
      aperturaFallo: t('Health.Record.OpenFailed', 'No pudimos abrir la historia. Intenta de nuevo.'),
      validarSinPermiso: t('Health.Record.ValidateNoConsent', 'Sin el permiso del paciente para el consultorio no se ve ni se valida su historia. Lo da él, con el «Autorizo» de su cita o de su pre-registro.'),
      validarFallo: t('Health.Record.ValidateFailed', 'No pudimos validar el dato.'),
      llegadaNoSigue: t('Health.Record.ArrivalNotNext', 'Ese paso no sigue al estado de la cita.'),
      llegadaFallo: t('Health.Record.ArrivalFailed', 'No pudimos marcar la llegada. Intenta de nuevo.'),
      notaGuardada: t('Health.Record.NoteSaved', 'Nota guardada como borrador.'),
      notaFirmada: t('Health.Record.NoteSigned', 'Nota firmada con la llave del consultorio.'),
      notaYaFirmada: t('Health.Record.NoteAlreadySigned', 'La nota está firmada: una corrección es otra nota.'),
      notaRevisa: t('Health.Record.NoteInvalid', 'Revisa la nota: está vacía o alguna parte es demasiado larga.'),
      notaSinLlave: t('Health.Record.NoteNoKey', 'No se pudo firmar: el consultorio todavía no tiene su llave de firma.'),
      notaFallo: t('Health.Record.NoteFailed', 'No pudimos guardar la nota. Intenta de nuevo.'),
      ordenGuardada: t('Health.Record.OrderSaved', 'Orden guardada.'),
      ordenRevisa: t('Health.Record.OrderInvalid', 'Revisa la orden: el tipo y de 1 a 20 exámenes.'),
      resultadoCargado: t('Health.Record.ResultLoaded', 'Resultado cargado. El paciente lo verá cuando el médico lo libere.'),
      resultadoRevisa: t('Health.Record.ResultInvalid', 'Revisa el resultado: el valor, la marca y que el informe sea un PDF de hasta 5 MB.'),
      resultadoLiberado: t('Health.Record.ResultReleased', 'Resultado liberado: el paciente ya lo ve.'),
      guardarFallo: t('Health.Record.SaveFailed', 'No pudimos guardar. Intenta de nuevo.'),
      recetaEmitida: t('Health.Record.RecipeIssued', 'Receta emitida y firmada.'),
      recetaRevisa: t('Health.Record.RecipeInvalid', 'Revisa la receta: medicamento, dosis y frecuencia, y de 1 a 365 días.'),
      recetaAnulada: t('Health.Record.RecipeRevokedNotice', 'Receta anulada.'),
      renovacionPedida: t('Health.Record.RenewalRequested', 'Pediste la renovación: el médico la revisará.'),
      renovacionAprobada: t('Health.Record.RenewalApproved', 'Renovación aprobada: salió una receta nueva.'),
      renovacionRechazada: t('Health.Record.RenewalRejected', 'Renovación rechazada.'),
      renovacionImposible: t('Health.Record.RenewalNotPossible', 'Esa receta no se puede renovar.'),
    },
  };
}

/**
 * Los textos de las vistas de la historia (I2 T062–T063): «Mi salud», el pre-registro y el consultorio, de la sección
 * `Health.Record` del diccionario. BORRADOR, como `Health.Consent`: los aprueba el arquitecto antes del release.
 */
export function textosDeLaHistoria() {
  return {
    title: t('Health.Record.Title', 'Mi salud'),
    noRecordTitle: t('Health.Record.NoRecordTitle', 'Todavía no tienes historia clínica'),
    noRecordText: t('Health.Record.NoRecordText', 'La abre el consultorio en tu primera visita. Cuando la tengas, aquí verás tus condiciones, alergias y vacunas, y podrás hacer tu pre-registro.'),
    signInTitle: t('Health.Record.SignInTitle', 'Inicia sesión para ver tu salud'),
    signInText: t('Health.Record.SignInText', 'Tu historia es sólo tuya: se ve con tu cuenta.'),
    deniedTitle: t('Health.Record.DeniedTitle', 'No tienes acceso a esta historia'),
    deniedText: t('Health.Record.DeniedText', 'Si crees que es un error, escríbele al consultorio.'),
    unreadableTitle: t('Health.Record.UnreadableTitle', 'No pudimos leer tu resumen de salud'),
    unreadableText: t('Health.Record.UnreadableText', 'No sabemos qué condiciones ni qué alergias tienes registradas. Esto no quiere decir que no tengas ninguna.'),
    retry: t('Health.Record.Retry', 'Reintentar'),
    consentMissing: t('Health.Record.ConsentMissing', 'El consultorio todavía no puede ver tu historia: falta tu permiso. Lo das en tu pre-registro.'),
    emptyTitle: t('Health.Record.EmptyTitle', 'Nadie ha llenado tu resumen todavía'),
    emptyText: t('Health.Record.EmptyText', 'Esto no quiere decir que no tengas alergias ni condiciones. Decláralas en tu pre-registro y el médico las validará.'),
    startCheckIn: t('Health.Record.StartCheckIn', 'Hacer mi pre-registro'),
    updateCheckIn: t('Health.Record.UpdateCheckIn', 'Actualizar mi pre-registro'),
    conditions: t('Health.Record.Conditions', 'Condiciones'),
    allergies: t('Health.Record.Allergies', 'Alergias'),
    vaccines: t('Health.Record.Vaccines', 'Vacunas'),
    noneRecorded: t('Health.Record.NoneRecorded', 'Ninguna registrada en la historia.'),
    validated: t('Health.Record.Validated', 'Validado'),
    pending: t('Health.Record.Pending', 'Por validar'),
    checkIn: t('Health.Record.CheckIn', 'Pre-registro'),
    insurer: t('Health.Record.Insurer', 'Aseguradora (EPS o prepagada)'),
    reason: t('Health.Record.Reason', 'Motivo de la visita'),
    medications: t('Health.Record.Medications', 'Medicamentos'),
    loading: t('Health.Record.Loading', 'Cargando tu historia…'),
    yourDetails: t('Health.Record.YourDetails', 'Tus datos'),
    document: t('Health.Record.Document', 'Documento'),
    phone: t('Health.Record.Phone', 'Teléfono'),
    address: t('Health.Record.Address', 'Dirección'),
    emergencyContact: t('Health.Record.EmergencyContact', 'Contacto de emergencia'),
    memberNumber: t('Health.Record.MemberNumber', 'Número de afiliación'),
    yourHealth: t('Health.Record.YourHealth', 'Tu salud'),
    onePerLine: t('Health.Record.OnePerLine', 'Uno por línea.'),
    declaredNote: t('Health.Record.DeclaredNote', 'Lo que declares queda en tu historia como «por validar» hasta que el médico lo revise.'),
    send: t('Health.Record.Send', 'Enviar mi pre-registro'),
    back: t('Health.Record.Back', 'Volver al inicio'),
    checkInSaved: t('Health.Record.CheckInSaved', 'Listo: tu pre-registro quedó en tu historia. El médico revisará lo que declaraste.'),
    checkInInvalid: t('Health.Record.CheckInInvalid', 'Revisa lo que escribiste: algún dato es demasiado largo o tiene una fecha que no sirve.'),
    checkInFailed: t('Health.Record.CheckInFailed', 'No pudimos guardar tu pre-registro. Intenta de nuevo.'),
    openDone: t('Health.Record.OpenDone', 'Historia abierta. El paciente ya puede hacer su pre-registro.'),
    openNoRole: t('Health.Record.OpenNoRole', 'Tu rol no abre historias: lo hacen recepción y el médico.'),
    openInvalid: t('Health.Record.OpenInvalid', 'Revisa el nombre y la fecha de nacimiento (aaaa-mm-dd).'),
    openFailed: t('Health.Record.OpenFailed', 'No pudimos abrir la historia. Intenta de nuevo.'),
    validateNoConsent: t('Health.Record.ValidateNoConsent', 'Sin el permiso del paciente para el consultorio no se ve ni se valida su historia. Lo da él, con el «Autorizo» de su cita o de su pre-registro.'),
    validateFailed: t('Health.Record.ValidateFailed', 'No pudimos validar el dato.'),
    patientRecord: t('Health.Record.PatientRecord', 'Historia del paciente'),
    patientEmail: t('Health.Record.PatientEmail', 'Correo del paciente'),
    search: t('Health.Record.Search', 'Buscar'),
    preRegistered: t('Health.Record.PreRegistered', 'Pre-registrado'),
    notPreRegistered: t('Health.Record.NotPreRegistered', 'Sin pre-registro'),
    viewSummary: t('Health.Record.ViewSummary', 'Ver resumen'),
    openIntro: t('Health.Record.OpenIntro', 'Este miembro todavía no tiene historia. Ábresela sólo con quién es: lo clínico lo pone el médico.'),
    fullName: t('Health.Record.FullName', 'Nombre completo'),
    birthDate: t('Health.Record.BirthDate', 'Fecha de nacimiento'),
    birthDateHint: t('Health.Record.BirthDateHint', 'aaaa-mm-dd, por ejemplo 1990-04-12.'),
    openRecord: t('Health.Record.OpenRecord', 'Abrir la historia'),
    noMember: t('Health.Record.NoMember', 'No hay un miembro con ese correo. El paciente se registra primero en el sitio.'),
    searchFailed: t('Health.Record.SearchFailed', 'No pudimos buscar la historia. Intenta de nuevo.'),
    summaryUnreadable: t('Health.Record.SummaryUnreadable', 'No pudimos leer el resumen. Esto no quiere decir que el paciente no tenga alergias.'),
    summaryEmpty: t('Health.Record.SummaryEmpty', 'Nadie ha llenado este resumen todavía. No quiere decir «sin alergias».'),
    validate: t('Health.Record.Validate', 'Validar'),
    // La consulta (I3).
    agendaTitle: t('Health.Record.AgendaTitle', 'Agenda del día'),
    professional: t('Health.Record.Professional', 'Profesional'),
    day: t('Health.Record.Day', 'Día'),
    dayHint: t('Health.Record.DayHint', 'aaaa-mm-dd.'),
    viewAgenda: t('Health.Record.ViewAgenda', 'Ver la agenda'),
    noAppointments: t('Health.Record.NoAppointments', 'No hay citas ese día.'),
    agendaUnreadable: t('Health.Record.AgendaUnreadable', 'No pudimos leer la agenda. Intenta de nuevo.'),
    agendaDenied: t('Health.Record.AgendaDenied', 'Tu rol no ve la agenda del consultorio.'),
    noRecordYet: t('Health.Record.NoRecordYet', 'Sin historia abierta'),
    stateBooked: t('Health.Record.StateBooked', 'Agendada'),
    stateArrived: t('Health.Record.StateArrived', 'Llegó'),
    stateInRoom: t('Health.Record.StateInRoom', 'En sala'),
    stateSeen: t('Health.Record.StateSeen', 'Atendido'),
    stateNoShow: t('Health.Record.StateNoShow', 'No vino'),
    stepArrive: t('Health.Record.StepArrive', 'Marcar llegada'),
    stepRoom: t('Health.Record.StepRoom', 'Pasar a sala'),
    stepAttend: t('Health.Record.StepAttend', 'Marcar atendido'),
    notes: t('Health.Record.Notes', 'Notas'),
    notesTitle: t('Health.Record.NotesTitle', 'Notas de la consulta'),
    subjective: t('Health.Record.Subjective', 'Subjetivo: lo que cuenta el paciente'),
    objective: t('Health.Record.Objective', 'Objetivo: lo que se observa'),
    assessment: t('Health.Record.Assessment', 'Análisis'),
    planLabel: t('Health.Record.PlanLabel', 'Plan'),
    saveDraft: t('Health.Record.SaveDraft', 'Guardar borrador'),
    sign: t('Health.Record.Sign', 'Firmar'),
    newNote: t('Health.Record.NewNote', 'Nota nueva'),
    draft: t('Health.Record.Draft', 'Borrador'),
    signed: t('Health.Record.Signed', 'Firmada'),
    edit: t('Health.Record.Edit', 'Editar'),
    verify: t('Health.Record.Verify', 'Comprobar la firma'),
    signatureValid: t('Health.Record.SignatureValid', 'La firma vale.'),
    signatureInvalid: t('Health.Record.SignatureInvalid', 'La firma no cuadra con lo que dice la nota.'),
    noNotes: t('Health.Record.NoNotes', 'Este paciente no tiene notas todavía.'),
    notesUnreadable: t('Health.Record.NotesUnreadable', 'No pudimos leer las notas.'),
    notesFor: (nombre: string): string => t('Health.Record.NotesFor', 'Notas de {nombre}', { nombre }),
    // Órdenes y resultados (I4).
    ordersTitle: t('Health.Record.OrdersTitle', 'Órdenes'),
    newOrder: t('Health.Record.NewOrder', 'Nueva orden'),
    orderType: t('Health.Record.OrderType', 'Tipo'),
    typeLab: t('Health.Record.TypeLab', 'Laboratorio'),
    typeImaging: t('Health.Record.TypeImaging', 'Imágenes'),
    typeReferral: t('Health.Record.TypeReferral', 'Remisión'),
    exams: t('Health.Record.Exams', 'Exámenes'),
    indication: t('Health.Record.Indication', 'Indicación'),
    placeOrder: t('Health.Record.PlaceOrder', 'Ordenar'),
    noOrders: t('Health.Record.NoOrders', 'Sin órdenes todavía.'),
    orderOpen: t('Health.Record.OrderOpen', 'Abierta'),
    orderDone: t('Health.Record.OrderDone', 'Cumplida'),
    value: t('Health.Record.Value', 'Valor'),
    unit: t('Health.Record.Unit', 'Unidad'),
    range: t('Health.Record.Range', 'Rango de referencia'),
    flag: t('Health.Record.Flag', 'Marca'),
    flagNormal: t('Health.Record.FlagNormal', 'Normal'),
    flagHigh: t('Health.Record.FlagHigh', 'Alto'),
    flagLow: t('Health.Record.FlagLow', 'Bajo'),
    flagCritical: t('Health.Record.FlagCritical', 'Crítico'),
    resultNote: t('Health.Record.ResultNote', 'Nota'),
    report: t('Health.Record.Report', 'Informe (PDF)'),
    loadResult: t('Health.Record.LoadResult', 'Cargar resultado'),
    release: t('Health.Record.Release', 'Liberar al paciente'),
    unreleased: t('Health.Record.Unreleased', 'Sin liberar'),
    released: t('Health.Record.Released', 'Liberado'),
    noResult: t('Health.Record.NoResult', 'Sin resultado'),
    downloadReport: t('Health.Record.DownloadReport', 'Descargar el informe'),
    myResultsTitle: t('Health.Record.MyResultsTitle', 'Mis resultados'),
    noResultsYet: t('Health.Record.NoResultsYet', 'Todavía no tienes órdenes ni resultados.'),
    resultsUnreadable: t('Health.Record.ResultsUnreadable', 'No pudimos leer tus resultados. Esto no quiere decir que no tengas ninguno.'),
    ordersUnreadable: t('Health.Record.OrdersUnreadable', 'No pudimos leer las órdenes. Esto no quiere decir que no haya ninguna.'),
    // Recetas y medicación (I5).
    recipesTitle: t('Health.Record.RecipesTitle', 'Recetas'),
    newRecipe: t('Health.Record.NewRecipe', 'Nueva receta'),
    medication: t('Health.Record.Medication', 'Medicamento'),
    dose: t('Health.Record.Dose', 'Dosis'),
    frequency: t('Health.Record.Frequency', 'Frecuencia'),
    instructions: t('Health.Record.Instructions', 'Indicaciones'),
    days: t('Health.Record.Days', 'Días de vigencia'),
    issueRecipe: t('Health.Record.IssueRecipe', 'Emitir y firmar'),
    revoke: t('Health.Record.Revoke', 'Anular'),
    validUntil: (fecha: string): string => t('Health.Record.ValidUntil', 'Vigente hasta el {fecha}', { fecha }),
    active: t('Health.Record.Active', 'Vigente'),
    expired: t('Health.Record.Expired', 'Vencida'),
    revokedLabel: t('Health.Record.RevokedLabel', 'Anulada'),
    downloadRecipe: t('Health.Record.DownloadRecipe', 'Descargar la receta'),
    renewalsTitle: t('Health.Record.RenewalsTitle', 'Renovaciones pedidas'),
    approve: t('Health.Record.Approve', 'Aprobar'),
    reject: t('Health.Record.Reject', 'Rechazar'),
    rejectReason: t('Health.Record.RejectReason', 'Motivo'),
    noRecipes: t('Health.Record.NoRecipes', 'Sin recetas todavía.'),
    recipesUnreadable: t('Health.Record.RecipesUnreadable', 'No pudimos leer las recetas. Esto no quiere decir que no haya ninguna.'),
    myMedicationTitle: t('Health.Record.MyMedicationTitle', 'Mis medicamentos'),
    requestRenewal: t('Health.Record.RequestRenewal', 'Pedir renovación'),
    renewalStateRequested: t('Health.Record.RenewalStateRequested', 'Renovación pedida'),
    renewalStateApproved: t('Health.Record.RenewalStateApproved', 'Renovación aprobada'),
    renewalStateRejected: t('Health.Record.RenewalStateRejected', 'Renovación rechazada'),
    noMedication: t('Health.Record.NoMedication', 'No tienes medicamentos vigentes.'),
    pastRecipes: t('Health.Record.PastRecipes', 'Recetas anteriores'),
  } as const;
}

export type TextosDeLasVistasDeLaHistoria = ReturnType<typeof textosDeLaHistoria>;
