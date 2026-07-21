/**
 * Seeded demo data for <c>&lt;synergos-gov&gt;</c> — the visible graceful
 * degradation when the Gov API is not yet wired (contrato Ola 8). Every value is
 * shaped exactly like the contract responses; the mock store advances through the
 * whole lifecycle (radicar → revisar → decidir → subsanar) so both faces demo
 * end-to-end offline.
 *
 * `MOCK_SERVICES` carries `estimatedDays` on the detail (the summary derives from
 * it); `MOCK_FORMS` maps each service to its SH-9 schema (data-driven form — a new
 * trámite ships a new schema, never new component code); `SEED_APPLICATIONS` holds
 * mutable expedientes in several states so the queue/folder show the full cycle.
 */
import type {
  AnswerPair,
  ApplicationStatus,
  CaseDecision,
  GovDocument,
  GovForm,
  GovMessage,
  GovServiceDetail,
  TimelineEntry,
} from './gov.model';

/** Service detail plus the `estimatedDays` used to build the summary card. */
export type MockServiceDetail = GovServiceDetail & { readonly estimatedDays: number };

/** A mutable seeded application; the mock store advances it in place. */
export interface SeedApplication {
  id: string;
  reference: string;
  serviceId: string;
  serviceName: string;
  citizenName: string;
  status: ApplicationStatus;
  submittedAt: string;
  currentStage: string;
  answers: readonly AnswerPair[];
  documents: readonly GovDocument[];
  messages: readonly GovMessage[];
  timeline: readonly TimelineEntry[];
  priority: string;
  slaDaysLeft: number;
  decision?: CaseDecision;
}

// ─── Catálogo de trámites (SUIT-style) ──────────────────────────────────────────

export const MOCK_SERVICES: readonly MockServiceDetail[] = [
  {
    id: 'svc-pasaporte',
    name: 'Expedición de pasaporte',
    summary:
      'Obtenga su pasaporte para viajar fuera del país. Se solicita en línea y se recoge en la sede.',
    category: 'identidad',
    agency: 'Cancillería',
    estimatedDays: 8,
    steps: [
      { id: 'st-1', title: 'Verifique que le aplica', detail: 'Debe ser mayor de edad o tener autorización de sus padres.' },
      { id: 'st-2', title: 'Reúna sus documentos', detail: 'Cédula vigente y, si lo tiene, su pasaporte anterior.' },
      { id: 'st-3', title: 'Diligencie el formulario', detail: 'Datos personales y ciudad donde recogerá el pasaporte.' },
      { id: 'st-4', title: 'Pague la tasa', detail: 'El pago se hace en línea, antes de radicar.' },
    ],
    eligibility: [
      'Ser ciudadano colombiano.',
      'No tener el pasaporte vigente sin reportar pérdida.',
    ],
    required: [
      'Cédula de ciudadanía escaneada por ambas caras (PDF).',
      'Pasaporte anterior, si lo tiene (PDF).',
    ],
    feeMinor: 19000000,
    currency: 'COP',
  },
  {
    id: 'svc-antecedentes',
    name: 'Certificado de antecedentes judiciales',
    summary:
      'Descargue el certificado que dice si tiene o no antecedentes judiciales. Es gratis e inmediato.',
    category: 'identidad',
    agency: 'Policía Nacional',
    estimatedDays: 1,
    steps: [
      { id: 'st-1', title: 'Autorice el tratamiento de datos', detail: 'Ley 1581 de 2012.' },
      { id: 'st-2', title: 'Confirme el motivo', detail: 'Solo se usa con fines estadísticos.' },
    ],
    eligibility: ['Ser mayor de edad con cédula vigente.'],
    required: [],
    feeMinor: 0,
    currency: 'COP',
  },
  {
    id: 'svc-licencia-dup',
    name: 'Duplicado de licencia de conducción',
    summary:
      'Pida una copia de su licencia si la perdió o se la robaron. Llega a su casa en pocos días.',
    category: 'vehiculos',
    agency: 'Ministerio de Transporte',
    estimatedDays: 5,
    steps: [
      { id: 'st-1', title: 'Indique la categoría', detail: 'La categoría de la licencia que necesita reponer.' },
      { id: 'st-2', title: 'Diga por qué la repone', detail: 'Pérdida, hurto o deterioro.' },
      { id: 'st-3', title: 'Confirme la dirección de entrega', detail: 'Donde quiere recibir la licencia.' },
      { id: 'st-4', title: 'Pague el derecho', detail: 'El valor del duplicado se paga en línea.' },
    ],
    eligibility: ['Tener una licencia vigente registrada a su nombre.'],
    required: ['Denuncia de pérdida o hurto, si aplica (PDF).'],
    feeMinor: 26700000,
    currency: 'COP',
  },
  {
    id: 'svc-sisben',
    name: 'Actualización de datos en el Sisbén',
    summary:
      'Actualice la información de su hogar para que su clasificación del Sisbén refleje su situación real.',
    category: 'salud',
    agency: 'Departamento Nacional de Planeación',
    estimatedDays: 15,
    steps: [
      { id: 'st-1', title: 'Cuente su hogar', detail: 'Incluya niños y adultos mayores.' },
      { id: 'st-2', title: 'Explique el cambio', detail: 'Por ejemplo: cambio de vivienda o de ingresos.' },
      { id: 'st-3', title: 'Adjunte un soporte', detail: 'Un recibo de servicio público reciente.' },
    ],
    eligibility: ['Estar registrado en el Sisbén.'],
    required: ['Recibo de un servicio público reciente (PDF o foto).'],
    feeMinor: 0,
    currency: 'COP',
  },
  {
    id: 'svc-matricula',
    name: 'Renovación de matrícula mercantil',
    summary:
      'Renueve cada año la matrícula de su negocio para mantenerlo activo y al día ante la ley.',
    category: 'empresa',
    agency: 'Cámara de Comercio',
    estimatedDays: 3,
    steps: [
      { id: 'st-1', title: 'Identifique el negocio', detail: 'NIT sin dígito de verificación.' },
      { id: 'st-2', title: 'Reporte sus activos', detail: 'El valor define la tarifa de la renovación.' },
      { id: 'st-3', title: 'Confirme el correo', detail: 'Para notificaciones judiciales.' },
      { id: 'st-4', title: 'Pague la renovación', detail: 'La tarifa depende de sus activos.' },
    ],
    eligibility: ['Tener matrícula mercantil vigente.'],
    required: ['Estados financieros del último año (PDF).'],
    feeMinor: 4500000,
    currency: 'COP',
  },
  {
    id: 'svc-predial',
    name: 'Certificado de paz y salvo predial',
    summary:
      'Certifique que su predio no debe impuesto predial. Lo necesita para vender o hipotecar.',
    category: 'tributario',
    agency: 'Secretaría de Hacienda',
    estimatedDays: 2,
    steps: [
      { id: 'st-1', title: 'Identifique el predio', detail: 'CHIP o matrícula inmobiliaria.' },
      { id: 'st-2', title: 'Indique el uso', detail: 'Venta, crédito u otro.' },
    ],
    eligibility: ['Ser propietario o autorizado del predio.'],
    required: [],
    feeMinor: 0,
    currency: 'COP',
  },
];

// ─── Formularios (SH-9 schemas — data-driven) ───────────────────────────────────

export const MOCK_FORMS: Readonly<Record<string, GovForm>> = {
  'svc-pasaporte': {
    id: 'form-pasaporte',
    title: 'Solicitud de pasaporte',
    sections: [
      {
        id: 'sec-tipo',
        title: 'Tipo de pasaporte',
        fields: [
          {
            id: 'tipoPasaporte',
            label: 'Tipo de pasaporte',
            type: 'select',
            required: true,
            help: 'El ordinario sirve para la mayoría de los viajes.',
            options: [
              { value: 'ordinario', label: 'Ordinario (32 páginas)' },
              { value: 'ejecutivo', label: 'Ejecutivo (48 páginas)' },
            ],
          },
          {
            id: 'fechaNacimiento',
            label: 'Fecha de nacimiento',
            type: 'date',
            required: true,
            help: 'Como aparece en su documento de identidad.',
          },
        ],
      },
      {
        id: 'sec-recogida',
        title: 'Dónde recoge el pasaporte',
        fields: [
          {
            id: 'ciudadExpedicion',
            label: 'Ciudad donde recogerá el pasaporte',
            type: 'radio',
            required: true,
            options: [
              { value: 'bogota', label: 'Bogotá' },
              { value: 'medellin', label: 'Medellín' },
              { value: 'cali', label: 'Cali' },
            ],
          },
        ],
      },
    ],
  },
  'svc-antecedentes': {
    id: 'form-antecedentes',
    title: 'Certificado de antecedentes',
    sections: [
      {
        id: 'sec-motivo',
        title: 'Motivo de la consulta',
        fields: [
          {
            id: 'motivoConsulta',
            label: 'Motivo de la consulta',
            type: 'select',
            required: true,
            help: 'Solo se usa con fines estadísticos.',
            options: [
              { value: 'laboral', label: 'Requisito laboral' },
              { value: 'personal', label: 'Uso personal' },
              { value: 'visa', label: 'Solicitud de visa' },
            ],
          },
          {
            id: 'aceptaTratamiento',
            label: 'Autorizo el tratamiento de mis datos personales (Ley 1581 de 2012)',
            type: 'checkbox',
            required: true,
          },
        ],
      },
    ],
  },
  'svc-licencia-dup': {
    id: 'form-licencia',
    title: 'Duplicado de licencia',
    sections: [
      {
        id: 'sec-licencia',
        title: 'Datos de la licencia',
        fields: [
          {
            id: 'categoriaLicencia',
            label: 'Categoría de la licencia',
            type: 'select',
            required: true,
            options: [
              { value: 'a2', label: 'A2 — Motocicletas' },
              { value: 'b1', label: 'B1 — Automóviles particulares' },
              { value: 'c1', label: 'C1 — Automóviles de servicio público' },
            ],
          },
          {
            id: 'motivoDuplicado',
            label: '¿Por qué necesita el duplicado?',
            type: 'radio',
            required: true,
            options: [
              { value: 'perdida', label: 'Pérdida' },
              { value: 'hurto', label: 'Hurto' },
              { value: 'deterioro', label: 'Deterioro' },
            ],
          },
        ],
      },
      {
        id: 'sec-entrega',
        title: 'Entrega',
        fields: [
          {
            id: 'direccionEntrega',
            label: 'Dirección de entrega',
            type: 'text',
            required: true,
            help: 'Donde quiere recibir la licencia.',
          },
          {
            id: 'denuncia',
            label: 'Denuncia de pérdida o hurto (si aplica)',
            type: 'file',
            required: false,
          },
        ],
      },
    ],
  },
  'svc-sisben': {
    id: 'form-sisben',
    title: 'Actualización del Sisbén',
    sections: [
      {
        id: 'sec-hogar',
        title: 'Su hogar',
        fields: [
          {
            id: 'personasHogar',
            label: 'Personas que viven en el hogar',
            type: 'number',
            required: true,
            help: 'Incluya niños y adultos mayores.',
          },
          {
            id: 'cambioReportado',
            label: '¿Qué cambió en su hogar?',
            type: 'textarea',
            required: true,
            help: 'Cuéntenos en sus palabras. Por ejemplo: cambio de vivienda o de ingresos.',
          },
        ],
      },
    ],
  },
  'svc-matricula': {
    id: 'form-matricula',
    title: 'Renovación de matrícula mercantil',
    sections: [
      {
        id: 'sec-negocio',
        title: 'Datos del negocio',
        fields: [
          {
            id: 'nit',
            label: 'NIT del negocio',
            type: 'text',
            required: true,
            help: 'Sin dígito de verificación.',
            pattern: '^[0-9]{6,10}$',
          },
          {
            id: 'activosTotales',
            label: 'Activos totales del último año (COP)',
            type: 'number',
            required: true,
            help: 'El valor define la tarifa de la renovación.',
          },
        ],
      },
      {
        id: 'sec-notificaciones',
        title: 'Notificaciones',
        fields: [
          {
            id: 'correoNotificaciones',
            label: 'Correo para notificaciones judiciales',
            type: 'email',
            required: true,
            pattern: '.+@.+\\..+',
          },
        ],
      },
    ],
  },
  'svc-predial': {
    id: 'form-predial',
    title: 'Paz y salvo predial',
    sections: [
      {
        id: 'sec-predio',
        title: 'Datos del predio',
        fields: [
          {
            id: 'chip',
            label: 'CHIP o matrícula inmobiliaria del predio',
            type: 'text',
            required: true,
            help: 'Lo encuentra en el recibo del predial.',
          },
          {
            id: 'usoCertificado',
            label: 'Para qué necesita el certificado',
            type: 'select',
            required: false,
            options: [
              { value: 'venta', label: 'Venta del predio' },
              { value: 'credito', label: 'Crédito o hipoteca' },
              { value: 'otro', label: 'Otro' },
            ],
          },
        ],
      },
    ],
  },
};

// ─── Solicitudes sembradas (lifecycle demo) ─────────────────────────────────────

export const SEED_APPLICATIONS: readonly SeedApplication[] = [
  {
    id: 'app-seed-1',
    reference: 'GOV-2026-10001',
    serviceId: 'svc-pasaporte',
    serviceName: 'Expedición de pasaporte',
    citizenName: 'Carolina Pérez García',
    status: 'in-review',
    submittedAt: '2026-06-24T09:12:00Z',
    currentStage: 'En revisión',
    priority: 'normal',
    slaDaysLeft: 4,
    answers: [
      { label: 'Tipo de pasaporte', value: 'Ordinario (32 páginas)' },
      { label: 'Ciudad donde recogerá el pasaporte', value: 'Bogotá' },
    ],
    documents: [
      { id: 'doc-1', name: 'cedula.pdf', status: 'received', uploadedAt: '2026-06-24T09:12:00Z' },
    ],
    messages: [
      {
        id: 'msg-1',
        author: 'Funcionario J. Mora',
        body: 'Recibimos su solicitud. La revisaremos en los próximos días.',
        createdAtUtc: '2026-06-26T14:00:00Z',
        outgoing: false,
      },
    ],
    timeline: [
      { id: 'tl-1', label: 'Radicada', date: '2026-06-24', state: 'done', note: 'Solicitud radicada en línea.' },
      { id: 'tl-2', label: 'En revisión', date: '2026-06-26', state: 'current', note: 'Expediente asignado para revisión.' },
      { id: 'tl-3', label: 'Resultado', date: '', state: 'pending' },
    ],
  },
  {
    id: 'app-seed-2',
    reference: 'GOV-2026-10002',
    serviceId: 'svc-sisben',
    serviceName: 'Actualización de datos en el Sisbén',
    citizenName: 'Carolina Pérez García',
    status: 'info-requested',
    submittedAt: '2026-06-18T10:00:00Z',
    currentStage: 'Requiere información',
    priority: 'high',
    slaDaysLeft: 6,
    answers: [
      { label: 'Personas que viven en el hogar', value: '4' },
      { label: '¿Qué cambió en su hogar?', value: 'Nos mudamos de vivienda en mayo.' },
    ],
    documents: [],
    messages: [
      {
        id: 'msg-1',
        author: 'Funcionaria L. Ríos',
        body: 'Falta el recibo de un servicio público de la nueva vivienda. Adjúntelo para continuar.',
        createdAtUtc: '2026-06-27T11:30:00Z',
        outgoing: false,
      },
    ],
    timeline: [
      { id: 'tl-1', label: 'Radicada', date: '2026-06-18', state: 'done', note: 'Solicitud radicada en línea.' },
      { id: 'tl-2', label: 'En revisión', date: '2026-06-20', state: 'done', note: 'Expediente asignado para revisión.' },
      { id: 'tl-3', label: 'Requiere información', date: '2026-06-27', state: 'current', note: 'Falta el recibo de servicio público.' },
      { id: 'tl-4', label: 'Resultado', date: '', state: 'pending' },
    ],
  },
  {
    id: 'app-seed-3',
    reference: 'GOV-2026-10003',
    serviceId: 'svc-antecedentes',
    serviceName: 'Certificado de antecedentes judiciales',
    citizenName: 'Carolina Pérez García',
    status: 'approved',
    submittedAt: '2026-06-30T08:00:00Z',
    currentStage: 'Aprobada',
    priority: 'normal',
    slaDaysLeft: 0,
    answers: [
      { label: 'Motivo de la consulta', value: 'Requisito laboral' },
      { label: 'Autorizo el tratamiento de mis datos personales', value: 'Sí' },
    ],
    documents: [
      { id: 'doc-1', name: 'certificado-antecedentes.pdf', status: 'issued', uploadedAt: '2026-06-30T08:05:00Z' },
    ],
    messages: [],
    timeline: [
      { id: 'tl-1', label: 'Radicada', date: '2026-06-30', state: 'done', note: 'Solicitud radicada en línea.' },
      { id: 'tl-2', label: 'En revisión', date: '2026-06-30', state: 'done', note: 'Verificación automática de antecedentes.' },
      { id: 'tl-3', label: 'Aprobada', date: '2026-06-30', state: 'done', note: 'Certificado generado. Disponible para descarga.' },
    ],
    decision: { outcome: 'approve', note: 'Sin antecedentes registrados.', decidedAtUtc: '2026-06-30T08:05:00Z' },
  },
  {
    id: 'app-seed-4',
    reference: 'GOV-2026-10004',
    serviceId: 'svc-matricula',
    serviceName: 'Renovación de matrícula mercantil',
    citizenName: 'Andrés Felipe Castro',
    status: 'submitted',
    submittedAt: '2026-07-02T15:20:00Z',
    currentStage: 'Radicada',
    priority: 'urgent',
    slaDaysLeft: 1,
    answers: [
      { label: 'NIT del negocio', value: '901234567' },
      { label: 'Activos totales del último año (COP)', value: '25000000' },
    ],
    documents: [
      { id: 'doc-1', name: 'estados-financieros.pdf', status: 'received', uploadedAt: '2026-07-02T15:20:00Z' },
    ],
    messages: [],
    timeline: [
      { id: 'tl-1', label: 'Radicada', date: '2026-07-02', state: 'current', note: 'Solicitud radicada en línea.' },
      { id: 'tl-2', label: 'En revisión', date: '', state: 'pending' },
      { id: 'tl-3', label: 'Resultado', date: '', state: 'pending' },
    ],
  },
];
