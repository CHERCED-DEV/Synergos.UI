/**
 * Un servidor EHR de mentira **con la forma del de verdad**, para los specs.
 *
 * Existe por lo que contaba el defecto CHERCED-DEV/Synergos.CMS#106: los specs de este
 * módulo stubeaban `fetch` para que **rechazara siempre**, así que los ocho corrían por
 * el camino degradado —incluido el que se llamaba «happy case»—. **El único camino que
 * se probaba era el que escondía el defecto**: nadie podía ver que la ficha del paciente
 * B traía la historia del paciente A, porque nunca hubo una ficha de verdad con la que
 * comparar.
 *
 * Reglas del fixture (regla 7 del `CLAUDE.md` — el dato de prueba tiene que EXIGIR la
 * regla):
 *
 *  - **Dos pacientes que no se parecen en nada.** `pac-maria` (54 años, HTA/DM2, alergia
 *    a Penicilina) y `pac-valentina` (9 años, asma, alergia a Polen). Si los dos
 *    tuvieran las mismas alergias, servir el paciente equivocado pasaría en verde.
 *  - **Ningún id coincide con los del mock borrado** (`P-1`…`P-5`), a propósito: así una
 *    regresión que vuelva a caer al paciente cero se ve como un nombre que el servidor
 *    NUNCA mandó, y no como un id que por casualidad cuadra.
 *  - **`immunizations` no se emite por defecto**, que es lo que hace el backend desde
 *    #106 — no hay seam de vacunación. Los specs que necesitan la clave la piden.
 *  - **`maintenance` llega SIN `status`**, por lo mismo: la recomendación se deriva de
 *    edad y sexo, el estado exigiría saber si la persona se lo hizo.
 */

export interface FakeServerOptions {
  /** Fragmentos de ruta que contestan 404 — el `[DevSeedOnly]` apagado, por endpoint. */
  readonly caidos?: readonly string[];
  /** `omit` (default, como el backend hoy) · `empty` (lista vacía real) · `full`. */
  readonly vacunas?: 'omit' | 'empty' | 'full';
  /** Cuando es `true`, `maintenance` vuelve a traer `status` (backend anterior a #106). */
  readonly estadoPreventivo?: boolean;
}

interface FakePatient {
  readonly id: string;
  readonly name: string;
  readonly document: string;
  readonly sex: 'F' | 'M';
  readonly age: number;
  readonly bloodType: string;
  readonly problems: readonly string[];
  readonly allergies: readonly string[];
  readonly primaryDoctorId: string;
  readonly assessment: string;
  readonly drug: string;
}

export const MARIA: FakePatient = {
  id: 'pac-maria',
  name: 'María Fernanda Quintero',
  document: 'CC 1.018.445.221',
  sex: 'F',
  age: 54,
  bloodType: 'O+',
  problems: ['Hipertensión arterial', 'Diabetes tipo 2'],
  allergies: ['Penicilina'],
  primaryDoctorId: 'doc-mendez',
  assessment: 'Hipertensión controlada. Diabetes tipo 2 estable.',
  drug: 'Losartán',
};

export const VALENTINA: FakePatient = {
  id: 'pac-valentina',
  name: 'Valentina Ospina Cruz',
  document: 'TI 1.099.882.014',
  sex: 'F',
  age: 9,
  bloodType: 'B+',
  problems: ['Asma'],
  allergies: ['Polen'],
  primaryDoctorId: 'doc-rojas',
  assessment: 'Asma intermitente bien controlada.',
  drug: 'Salbutamol',
};

const PACIENTES: readonly FakePatient[] = [MARIA, VALENTINA];

const MEDICOS = [
  {
    id: 'doc-mendez',
    name: 'Dra. Laura Méndez',
    specialty: 'Medicina interna',
    license: 'RM-48211',
    phone: '+57 310 555 0101',
    email: 'laura.mendez@clinica.co',
    acceptingPatients: true,
    rating: 4.9,
  },
  {
    id: 'doc-rojas',
    name: 'Dra. Camila Rojas',
    specialty: 'Pediatría',
    license: 'RM-51777',
    phone: '+57 312 555 0103',
    email: 'camila.rojas@clinica.co',
    acceptingPatients: true,
    rating: 4.8,
  },
] as const;

function paciente(id: string): FakePatient | undefined {
  return PACIENTES.find((entry) => entry.id === id);
}

function demografia(p: FakePatient): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    document: p.document,
    sex: p.sex,
    age: p.age,
    phone: '+57 300 111 2233',
    email: `${p.id}@correo.co`,
    bloodType: p.bloodType,
    problems: p.problems,
    allergies: p.allergies,
    primaryDoctorId: p.primaryDoctorId,
    active: true,
  };
}

function ficha(p: FakePatient): Record<string, unknown> {
  return {
    patient: demografia(p),
    history: [
      {
        id: `${p.id}-enc-1`,
        patientId: p.id,
        doctorId: p.primaryDoctorId,
        doctorName: 'Dra. Laura Méndez',
        date: '2026-06-18',
        reason: 'Control',
        soap: {
          subjective: 'Sin novedades.',
          objective: { systolic: 118, diastolic: 76, heartRate: 70, temperature: 36.5, weight: 40, height: 140, glucose: 90 },
          assessment: p.assessment,
          plan: 'Control en 3 meses.',
        },
        signature: 'LM',
      },
    ],
    prescriptions: [
      {
        id: `${p.id}-rx-1`,
        patientId: p.id,
        doctorId: p.primaryDoctorId,
        doctorName: 'Dra. Laura Méndez',
        date: '2026-06-18',
        items: [{ drug: p.drug, dose: '50 mg', frequency: 'Cada 12 horas', durationDays: 90 }],
        interactions: [],
      },
    ],
    appointments: [],
  };
}

function salud(p: FakePatient, options: FakeServerOptions): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {
    conditions: p.problems,
    allergies: p.allergies,
    maintenance: [
      {
        id: `pm-bp-${p.id}`,
        name: 'Control de presión arterial',
        detail: 'Toma de presión en consulta de control.',
        ...(options.estadoPreventivo ? { status: 'complete', dueDate: '2026-10-01' } : {}),
      },
    ],
  };
  if (options.vacunas === 'empty') {
    cuerpo['immunizations'] = [];
  } else if (options.vacunas === 'full') {
    cuerpo['immunizations'] = [
      { id: `imm-flu-${p.id}`, name: 'Influenza (anual)', date: '2026-05-01', status: 'complete' },
    ];
  }
  return cuerpo;
}

function citaDe(p: FakePatient): Record<string, unknown> {
  return {
    id: `${p.id}-ap-1`,
    patientId: p.id,
    patientName: p.name,
    doctorId: p.primaryDoctorId,
    doctorName: 'Dra. Laura Méndez',
    date: '2026-09-18',
    time: '08:00',
    durationMin: 30,
    reason: 'Control trimestral',
    status: 'booked',
  };
}

/**
 * Devuelve un doble de `fetch` que sirve el contrato del `EhrController`. Lo que no
 * conoce contesta 404 —que es exactamente lo que hace el backend con
 * `Synergos:DevSeed:Enabled=false`— y el cliente lo convierte en una lectura fallida.
 */
export function servidorFalso(
  options: FakeServerOptions = {},
): (url: string, init?: RequestInit) => Promise<Response> {
  const caidos = options.caidos ?? [];

  return (url: string, init?: RequestInit) => {
    const ruta = String(url);
    if (caidos.some((fragmento) => ruta.includes(fragmento))) {
      return Promise.resolve(respuesta(404, { error: 'Not found' }));
    }
    const query = new URLSearchParams(ruta.includes('?') ? ruta.slice(ruta.indexOf('?') + 1) : '');
    const quien = query.get('patient') ?? query.get('user') ?? '';

    if (init?.method === 'POST') {
      return Promise.resolve(respuesta(200, cuerpoDeEscritura(ruta, init)));
    }

    if (ruta.includes('/patients')) {
      const q = (query.get('q') ?? '').toLowerCase();
      const lista = PACIENTES.filter(
        (p) => !q || p.name.toLowerCase().includes(q) || p.problems.some((c) => c.toLowerCase().includes(q)),
      );
      return Promise.resolve(respuesta(200, { patients: lista.map(demografia) }));
    }
    if (ruta.includes('/patient/')) {
      const id = decodeURIComponent(ruta.slice(ruta.lastIndexOf('/') + 1));
      const p = paciente(id);
      return Promise.resolve(p ? respuesta(200, ficha(p)) : respuesta(404, { error: 'no existe' }));
    }
    if (ruta.includes('/doctors')) {
      return Promise.resolve(respuesta(200, { doctors: MEDICOS }));
    }
    if (ruta.includes('/portal/home')) {
      const p = paciente(quien);
      if (!p) {
        return Promise.resolve(respuesta(404, { error: 'no existe' }));
      }
      return Promise.resolve(
        respuesta(200, {
          patient: demografia(p),
          cards: [
            { id: 'card-appt', kind: 'appointment', title: 'Próxima cita', detail: 'Control trimestral', action: 'visits', actionLabel: 'Ver mis citas', tone: 'brand' },
          ],
          nextAppointment: citaDe(p),
          balanceMinor: 0,
          currency: 'COP',
          unreadMessages: 0,
          pendingCheckins: 0,
        }),
      );
    }
    if (ruta.includes('/results')) {
      const p = paciente(quien);
      return Promise.resolve(
        respuesta(200, {
          results: p
            ? [
                {
                  id: `${p.id}-lab-1`,
                  patientId: p.id,
                  name: 'Glucosa en ayunas',
                  panel: 'Química sanguínea',
                  value: 96,
                  unit: 'mg/dL',
                  refLow: 70,
                  refHigh: 100,
                  flag: 'normal',
                  date: '2026-09-01',
                  comment: '',
                  released: true,
                },
              ]
            : [],
        }),
      );
    }
    if (ruta.includes('/medications')) {
      const p = paciente(quien);
      return Promise.resolve(
        respuesta(200, {
          medications: p
            ? [
                {
                  id: `${p.id}-med-1`,
                  patientId: p.id,
                  drug: p.drug,
                  dose: '50 mg',
                  frequency: 'Cada 12 horas',
                  instructions: 'Tomar con alimentos.',
                  pharmacy: 'Farmacia Central',
                  refillsLeft: 2,
                  refillStatus: null,
                },
              ]
            : [],
        }),
      );
    }
    if (ruta.includes('/health')) {
      const p = paciente(quien);
      return Promise.resolve(p ? respuesta(200, salud(p, options)) : respuesta(404, { error: 'no existe' }));
    }
    if (ruta.includes('/billing')) {
      const p = paciente(quien);
      return Promise.resolve(
        respuesta(200, {
          statement: {
            patientId: p?.id ?? quien,
            currency: 'COP',
            balanceMinor: 0,
            planActive: false,
            lines: [],
          },
        }),
      );
    }
    if (ruta.includes('/messages')) {
      return Promise.resolve(
        respuesta(200, {
          threads: [
            {
              id: 'hilo-1',
              participant: 'Dra. Laura Méndez',
              subject: 'Sobre tu control',
              lastMessage: 'Nos vemos en la cita.',
              lastAtUtc: '2026-09-10T12:00:00.000Z',
              unread: 1,
              messages: [
                { id: 'hilo-1-m1', author: 'Dra. Laura Méndez', body: 'Nos vemos en la cita.', createdAtUtc: '2026-09-10T12:00:00.000Z', outgoing: false },
              ],
            },
          ],
        }),
      );
    }
    if (ruta.includes('/inbasket')) {
      return Promise.resolve(
        respuesta(200, {
          items: [
            {
              id: 'ib-1',
              kind: 'result',
              patientId: MARIA.id,
              patientName: MARIA.name,
              title: 'Glucosa por revisar',
              detail: 'Resultado liberado.',
              createdAtUtc: '2026-09-10T12:00:00.000Z',
              priority: 'routine',
              done: false,
            },
          ],
        }),
      );
    }
    if (ruta.includes('/schedule')) {
      return Promise.resolve(
        respuesta(200, {
          slots: PACIENTES.map((p, i) => ({
            appointmentId: `${p.id}-slot`,
            patientId: p.id,
            patientName: p.name,
            doctorId: p.primaryDoctorId,
            doctorName: 'Dra. Laura Méndez',
            time: i === 0 ? '08:00' : '09:15',
            durationMin: 30,
            reason: 'Control',
            type: 'in-person',
            state: i === 0 ? 'arrived' : 'scheduled',
          })),
        }),
      );
    }
    if (ruta.includes('/appointments')) {
      return Promise.resolve(respuesta(200, { appointments: PACIENTES.map(citaDe) }));
    }
    return Promise.resolve(respuesta(404, { error: 'ruta desconocida' }));
  };
}

function cuerpoDeEscritura(ruta: string, init: RequestInit): Record<string, unknown> {
  const enviado = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
  if (ruta.includes('/encounter')) {
    const patientId = String(enviado['patientId'] ?? '');
    return {
      encounter: {
        id: `${patientId}-enc-nuevo`,
        patientId,
        doctorId: 'doc-mendez',
        doctorName: 'Dra. Laura Méndez',
        date: '2026-09-14',
        reason: 'Consulta',
        soap: enviado['soap'],
        signature: '',
      },
    };
  }
  if (ruta.includes('/prescription')) {
    const patientId = String(enviado['patientId'] ?? '');
    return {
      prescription: {
        id: `${patientId}-rx-nueva`,
        patientId,
        doctorId: 'doc-mendez',
        doctorName: 'Dra. Laura Méndez',
        date: '2026-09-14',
        items: enviado['items'],
        interactions: [],
      },
    };
  }
  if (ruta.includes('/refill')) {
    return { status: 'requested' };
  }
  return { ok: true };
}

function respuesta(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}
