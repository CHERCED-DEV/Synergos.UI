/**
 * Seeded clinical graph for <c>&lt;synergos-ehr&gt;</c> **v2** — the visible
 * degradation data the API client falls back to so both portals (MyChart patient +
 * Hyperspace clinician) land on a *living* demo before the backend agent's new
 * endpoints respond (`/portal/home`, `/results`, `/medications`, `/messages`,
 * `/inbasket`, `/billing`).
 *
 * Pure data + builders, no Angular. Deterministic so the smoke spec can assert on it.
 * The core patients/doctors/appointments/chart seeds live in `ehr-api.client.ts`
 * (unchanged from v1); this file adds the v2 portal aggregates keyed by patient id.
 */

import {
  type BillingStatement,
  type HealthSummary,
  type InboxItem,
  type LabResult,
  type Medication,
  type MessageThread,
  type PortalHome,
  type ScheduleSlot,
} from './ehr.model';

/** Minutes-ago helper → ISO timestamp so relative-time rendering looks alive. */
function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const TODAY = new Date().toISOString().slice(0, 10);

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

// ─── Patient home feed (MyChart landing) ─────────────────────────────────────────

export function mockPortalHome(patientId: string): PortalHome {
  const id = patientId || 'P-1';
  return {
    patient: {
      id,
      name: 'María González',
      document: 'CC 1.018.445.221',
      sex: 'F',
      age: 54,
      phone: '+57 300 111 2233',
      email: 'maria.gonzalez@correo.co',
      bloodType: 'O+',
      problems: ['Hipertensión arterial', 'Diabetes tipo 2'],
      allergies: ['Penicilina'],
      primaryDoctorId: 'D-1',
      active: true,
    },
    cards: [
      {
        id: 'card-appt',
        kind: 'appointment',
        title: 'Próxima cita',
        detail: `Control con Dra. Laura Méndez · ${daysFromNow(6)} 08:00`,
        action: 'visits',
        actionLabel: 'Ver mis citas',
        tone: 'brand',
      },
      {
        id: 'card-checkin',
        kind: 'checkin',
        title: 'e-Check-In disponible',
        detail: 'Confirma tus datos antes de la cita para agilizar la atención.',
        action: 'echeckin',
        actionLabel: 'Hacer e-Check-In',
        tone: 'warning',
      },
      {
        id: 'card-result',
        kind: 'result',
        title: 'Nuevo resultado de laboratorio',
        detail: 'Perfil lipídico liberado por tu médico.',
        action: 'results',
        actionLabel: 'Ver resultados',
        tone: 'success',
      },
      {
        id: 'card-message',
        kind: 'message',
        title: 'Mensaje del equipo de salud',
        detail: 'Tienes 1 mensaje sin leer sobre tu tratamiento.',
        action: 'messages',
        actionLabel: 'Abrir mensajes',
        tone: 'neutral',
      },
      {
        id: 'card-balance',
        kind: 'balance',
        title: 'Saldo pendiente',
        detail: 'Tienes un estado de cuenta por pagar o financiar.',
        action: 'billing',
        actionLabel: 'Ver facturación',
        tone: 'danger',
      },
      {
        id: 'card-reminder',
        kind: 'reminder',
        title: 'Cuidado preventivo',
        detail: 'Tu tamizaje de colon está vencido. Agenda con tu médico.',
        action: 'health',
        actionLabel: 'Ver resumen de salud',
        tone: 'warning',
      },
    ],
    nextAppointment: {
      id: `${id}-AP-1`,
      patientId: id,
      patientName: 'María González',
      doctorId: 'D-1',
      doctorName: 'Dra. Laura Méndez',
      date: daysFromNow(6),
      time: '08:00',
      durationMin: 30,
      reason: 'Control trimestral',
      status: 'booked',
    },
    balanceMinor: 18_500_000,
    currency: 'COP',
    unreadMessages: 1,
    pendingCheckins: 1,
  };
}

// ─── Lab results (value + reference range + flag) ────────────────────────────────

export function mockResults(patientId: string): readonly LabResult[] {
  const id = patientId || 'P-1';
  return [
    {
      id: 'R-1',
      patientId: id,
      name: 'Colesterol total',
      panel: 'Perfil lipídico',
      value: 224,
      unit: 'mg/dL',
      refLow: 0,
      refHigh: 200,
      flag: 'high',
      date: daysFromNow(-3),
      comment: 'Ligeramente elevado. Reforzar dieta y control en 3 meses.',
      released: true,
    },
    {
      id: 'R-2',
      patientId: id,
      name: 'Colesterol HDL',
      panel: 'Perfil lipídico',
      value: 42,
      unit: 'mg/dL',
      refLow: 40,
      refHigh: 60,
      flag: 'normal',
      date: daysFromNow(-3),
      comment: '',
      released: true,
    },
    {
      id: 'R-3',
      patientId: id,
      name: 'Glucosa en ayunas',
      panel: 'Química sanguínea',
      value: 118,
      unit: 'mg/dL',
      refLow: 70,
      refHigh: 100,
      flag: 'high',
      date: daysFromNow(-3),
      comment: 'Consistente con diabetes en seguimiento.',
      released: true,
    },
    {
      id: 'R-4',
      patientId: id,
      name: 'Hemoglobina glicosilada',
      panel: 'Química sanguínea',
      value: 7.1,
      unit: '%',
      refLow: 4,
      refHigh: 5.7,
      flag: 'high',
      date: daysFromNow(-3),
      comment: '',
      released: true,
    },
    {
      id: 'R-5',
      patientId: id,
      name: 'Creatinina',
      panel: 'Función renal',
      value: 0.9,
      unit: 'mg/dL',
      refLow: 0.6,
      refHigh: 1.2,
      flag: 'normal',
      date: daysFromNow(-3),
      comment: '',
      released: true,
    },
    {
      id: 'R-6',
      patientId: id,
      name: 'Potasio',
      panel: 'Electrolitos',
      value: 3.2,
      unit: 'mmol/L',
      refLow: 3.5,
      refHigh: 5.1,
      flag: 'low',
      date: daysFromNow(-3),
      comment: 'Bajo. Repetir y valorar suplementación.',
      released: false,
    },
  ];
}

// ─── Medications (active list + refill affordance) ───────────────────────────────

export function mockMedications(patientId: string): readonly Medication[] {
  const id = patientId || 'P-1';
  return [
    {
      id: 'M-1',
      patientId: id,
      drug: 'Losartán',
      dose: '50 mg',
      frequency: 'Cada 12 horas',
      instructions: 'Tomar con o sin alimentos. No suspender sin indicación.',
      pharmacy: 'Farmacia Central',
      refillsLeft: 2,
      refillStatus: null,
    },
    {
      id: 'M-2',
      patientId: id,
      drug: 'Metformina',
      dose: '850 mg',
      frequency: 'Con cada comida',
      instructions: 'Tomar con las comidas para reducir molestias gástricas.',
      pharmacy: 'Farmacia Central',
      refillsLeft: 1,
      refillStatus: null,
    },
    {
      id: 'M-3',
      patientId: id,
      drug: 'Atorvastatina',
      dose: '20 mg',
      frequency: 'Cada noche',
      instructions: 'Tomar en la noche. Reportar dolor muscular.',
      pharmacy: 'Droguería del Barrio',
      refillsLeft: 0,
      refillStatus: null,
    },
  ];
}

// ─── Health summary (conditions / allergies / immunizations / maintenance) ───────

export function mockHealthSummary(): HealthSummary {
  return {
    conditions: ['Hipertensión arterial', 'Diabetes tipo 2', 'Dislipidemia'],
    allergies: ['Penicilina'],
    immunizations: [
      { id: 'IM-1', name: 'Influenza (anual)', date: daysFromNow(-120), status: 'complete' },
      { id: 'IM-2', name: 'COVID-19 (refuerzo)', date: daysFromNow(-200), status: 'complete' },
      { id: 'IM-3', name: 'Neumococo', date: '', status: 'due' },
      { id: 'IM-4', name: 'Tétanos (Td)', date: '', status: 'overdue' },
    ],
    maintenance: [
      {
        id: 'HM-1',
        name: 'Tamizaje de colon',
        detail: 'Colonoscopia o prueba de sangre oculta según edad.',
        status: 'overdue',
        dueDate: daysFromNow(-30),
      },
      {
        id: 'HM-2',
        name: 'Mamografía',
        detail: 'Tamizaje de cáncer de mama.',
        status: 'due',
        dueDate: daysFromNow(20),
      },
      {
        id: 'HM-3',
        name: 'Fondo de ojo (retinopatía)',
        detail: 'Control anual para pacientes con diabetes.',
        status: 'complete',
        dueDate: daysFromNow(-90),
      },
    ],
  };
}

// ─── Billing (statement + payment plan) ──────────────────────────────────────────

export function mockBilling(patientId: string): BillingStatement {
  const id = patientId || 'P-1';
  return {
    patientId: id,
    currency: 'COP',
    balanceMinor: 18_500_000,
    planActive: false,
    lines: [
      {
        id: 'S-1',
        date: daysFromNow(-8),
        description: 'Consulta de medicina interna',
        amountMinor: 9_500_000,
      },
      {
        id: 'S-2',
        date: daysFromNow(-8),
        description: 'Perfil lipídico + química sanguínea',
        amountMinor: 6_200_000,
      },
      {
        id: 'S-3',
        date: daysFromNow(-8),
        description: 'Copago consulta especializada',
        amountMinor: 2_800_000,
      },
    ],
  };
}

// ─── Messages (bidirectional patient ↔ care team, SH-7) ──────────────────────────

export function mockMessages(): readonly MessageThread[] {
  return [
    {
      id: 'T-1',
      participant: 'Dra. Laura Méndez',
      subject: 'Sobre tu perfil lipídico',
      lastMessage: 'El colesterol está un poco alto; reforcemos la dieta.',
      lastAtUtc: ago(90),
      unread: 1,
      messages: [
        {
          id: 'T-1-m1',
          threadId: 'T-1',
          author: 'Dra. Laura Méndez',
          body: 'Hola María, revisé tu perfil lipídico. El colesterol total está un poco alto.',
          createdAtUtc: ago(120),
          outgoing: false,
        },
        {
          id: 'T-1-m2',
          threadId: 'T-1',
          author: 'María González',
          body: '¿Debo cambiar algo del tratamiento actual?',
          createdAtUtc: ago(105),
          outgoing: true,
        },
        {
          id: 'T-1-m3',
          threadId: 'T-1',
          author: 'Dra. Laura Méndez',
          body: 'Por ahora reforcemos la dieta hiposódica y baja en grasas; control en 3 meses.',
          createdAtUtc: ago(90),
          outgoing: false,
        },
      ],
    },
    {
      id: 'T-2',
      participant: 'Facturación',
      subject: 'Opciones de pago',
      lastMessage: 'Puedes financiar tu saldo en cuotas sin interés.',
      lastAtUtc: ago(600),
      unread: 0,
      messages: [
        {
          id: 'T-2-m1',
          threadId: 'T-2',
          author: 'Facturación',
          body: 'Hola, te recordamos que puedes financiar tu saldo en cuotas sin interés desde el portal.',
          createdAtUtc: ago(600),
          outgoing: false,
        },
      ],
    },
  ];
}

// ─── In Basket (clinician side — typed rows + routing, SH-7 v3) ───────────────────

export function mockInbox(): readonly InboxItem[] {
  return [
    {
      id: 'IB-1',
      kind: 'result',
      patientId: 'P-1',
      patientName: 'María González',
      title: 'Perfil lipídico por revisar',
      detail: 'Colesterol total 224 mg/dL (alto). Requiere liberación al portal.',
      createdAtUtc: ago(45),
      priority: 'high',
      done: false,
    },
    {
      id: 'IB-2',
      kind: 'refill',
      patientId: 'P-2',
      patientName: 'Carlos Ramírez',
      title: 'Solicitud de renovación · Atorvastatina 20 mg',
      detail: 'Farmacia Central. Sin refills restantes.',
      createdAtUtc: ago(80),
      priority: 'routine',
      done: false,
    },
    {
      id: 'IB-3',
      kind: 'advice',
      patientId: 'P-1',
      patientName: 'María González',
      title: 'Consulta del paciente',
      detail: '"¿Debo cambiar algo del tratamiento actual?"',
      createdAtUtc: ago(105),
      priority: 'routine',
      done: false,
    },
    {
      id: 'IB-4',
      kind: 'cosign',
      patientId: 'P-3',
      patientName: 'Valentina Torres',
      title: 'Nota de enfermería por firmar',
      detail: 'Control de asma. Requiere cofirma del médico tratante.',
      createdAtUtc: ago(160),
      priority: 'routine',
      done: false,
    },
  ];
}

// ─── Schedule board (clinician — arrival state machine) ──────────────────────────

export function mockSchedule(date: string): readonly ScheduleSlot[] {
  void (date || TODAY);
  const base: readonly ScheduleSlot[] = [
    {
      appointmentId: 'A-1',
      patientId: 'P-1',
      patientName: 'María González',
      doctorId: 'D-1',
      doctorName: 'Dra. Laura Méndez',
      time: '08:00',
      durationMin: 30,
      reason: 'Control hipertensión',
      type: 'in-person',
      state: 'roomed',
      checkedInAhead: true,
    },
    {
      appointmentId: 'A-2',
      patientId: 'P-2',
      patientName: 'Carlos Ramírez',
      doctorId: 'D-2',
      doctorName: 'Dr. Andrés Gómez',
      time: '08:30',
      durationMin: 30,
      reason: 'Valoración cardiológica',
      type: 'video',
      state: 'arrived',
      checkedInAhead: true,
    },
    {
      appointmentId: 'A-3',
      patientId: 'P-3',
      patientName: 'Valentina Torres',
      doctorId: 'D-3',
      doctorName: 'Dra. Camila Rojas',
      time: '09:15',
      durationMin: 20,
      reason: 'Seguimiento asma',
      type: 'in-person',
      state: 'scheduled',
      checkedInAhead: false,
    },
    {
      appointmentId: 'A-4',
      patientId: 'P-5',
      patientName: 'Daniela Ospina',
      doctorId: 'D-1',
      doctorName: 'Dra. Laura Méndez',
      time: '10:00',
      durationMin: 30,
      reason: 'Consulta general',
      type: 'in-person',
      state: 'in-visit',
      checkedInAhead: false,
    },
    {
      appointmentId: 'A-5',
      patientId: 'P-4',
      patientName: 'Jorge Castaño',
      doctorId: 'D-4',
      doctorName: 'Dr. Felipe Suárez',
      time: '11:00',
      durationMin: 40,
      reason: 'Control tiroides',
      type: 'in-person',
      state: 'no-show',
      checkedInAhead: false,
    },
    {
      appointmentId: 'A-6',
      patientId: 'P-1',
      patientName: 'María González',
      doctorId: 'D-1',
      doctorName: 'Dra. Laura Méndez',
      time: '11:45',
      durationMin: 30,
      reason: 'Resultados de laboratorio',
      type: 'video',
      state: 'checked-out',
      checkedInAhead: true,
    },
  ];
  return base;
}
