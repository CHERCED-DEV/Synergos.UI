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
 *  - **La historia la pone la SESIÓN, no la URL** (CMS#197). `?patient=` y `?user=` se
 *    ignoran, como en el controlador: un falso que los obedeciera haría verde justo la UI
 *    que manda el paciente de la página. Las negativas (401/403/404/400) llevan `{ error }`;
 *    los `caidos`, no.
 */

export interface FakeServerOptions {
  /**
   * Fragmentos de ruta que contestan 404 — el `[DevSeedOnly]` apagado, por endpoint. **Sin
   * cuerpo**, como el `NotFoundResult` del filtro: un 404 CON `{ error }` es otra cosa —el
   * servidor diciendo que la cuenta no tiene historia (#197)— y la UI tiene que distinguirlos.
   *
   * Un fragmento puede llevar MÉTODO delante (`'POST /encounter'`): así se apaga la
   * ESCRITURA dejando viva la lectura del mismo recurso, que es el apagón **parcial**
   * —el único que alcanza las escrituras, porque toda escritura va detrás de una
   * lectura que funcionó (#111)—. Y hace falta además porque `'/appointment'` a secas
   * también casa con `'/appointments'`, o sea que apagar la reserva apagaba la agenda.
   */
  readonly caidos?: readonly string[];
  /** `omit` (default, como el backend hoy) · `empty` (lista vacía real) · `full`. */
  readonly vacunas?: 'omit' | 'empty' | 'full';
  /** Cuando es `true`, `maintenance` vuelve a traer `status` (backend anterior a #106). */
  readonly estadoPreventivo?: boolean;
  /**
   * Los cuatro campos que el borde **dejó de afirmar** (#111): `active`,
   * `acceptingPatients`, `pharmacy` y `unread`. `omit` (default) es lo que hace hoy;
   * `full` es un backend que sí los sabe.
   *
   * Sembrarlos era la regla 10 en su forma exacta: un servidor de mentira que afirma
   * lo que el de verdad dejó de afirmar hace verde justo el camino que hay que
   * probar —el del cliente reponiendo `true` y `0` por su cuenta—.
   */
  readonly opcionales?: 'omit' | 'full';
  /**
   * El copago que contesta `GET /copay`, en COP (CMS#196). Por defecto, el del motor en proceso
   * del CMS (80.000): un falso que contestara cero haría verde justo el «Sin costo» que el
   * servidor de verdad no cobra. `null` = el borde no lo sabe (503).
   */
  readonly copago?: number | null;
  /**
   * Quién está en la SESIÓN (CMS#197). El servidor de verdad resuelve la historia por el correo
   * del miembro y la superficie clínica por su ROL, e ignora lo que diga el navegador
   * (`?patient=`, `?user=`, `patientId` del refill, `user`/`from` del mensaje); este también.
   * Por defecto, `MEDICA_CON_HISTORIA`: el miembro que abre las DOS superficies. `'anonimo'`
   * contesta 401 en todo lo que no es público (`doctors`, `copay`).
   */
  readonly sesion?: FakeSession | 'anonimo';
  /** `GET /billing` contesta 404 `{ error }`: hay historia, pero sin estado de cuenta. */
  readonly sinEstadoDeCuenta?: boolean;
}

/** El miembro de la sesión, tal como lo ve el `EhrController`. */
export interface FakeSession {
  /** La historia vinculada a su correo; `null` = ninguna (404 `{ error }` en el portal). */
  readonly paciente: FakePatient | null;
  /**
   * Su rol clínico: `'medico'` (con médico vinculado, `doc-mendez`), `'enfermeria'` (rol clínico
   * SIN médico vinculado —como el directorio de demo, que no tiene correos—: la bandeja exige
   * `provider`) o `null` (sin rol: 403 en la superficie clínica).
   */
  readonly clinico: 'medico' | 'enfermeria' | null;
}

export interface FakePatient {
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

/** Médica (`doc-mendez`) que además tiene su historia vinculada: abre el portal Y la clínica. */
export const MEDICA_CON_HISTORIA: FakeSession = { paciente: MARIA, clinico: 'medico' };
/** Paciente sin rol clínico: el portal abre; la clínica contesta 403. */
export const SOLO_PACIENTE: FakeSession = { paciente: MARIA, clinico: null };
/** Miembro sin historia ni rol: el portal contesta 404 `{ error }`; la clínica, 403. */
export const SIN_HISTORIA: FakeSession = { paciente: null, clinico: null };
/** Enfermería: rol clínico sin médico vinculado. La bandeja pide de qué médico es. */
export const ENFERMERIA: FakeSession = { paciente: null, clinico: 'enfermeria' };

/** El médico vinculado al correo del miembro, como `MedicoDeLaSesionAsync`. */
const MEDICO_DE_LA_SESION = 'doc-mendez';

const MEDICOS = [
  {
    id: 'doc-mendez',
    name: 'Dra. Laura Méndez',
    specialty: 'Medicina interna',
    license: 'RM-48211',
    phone: '+57 310 555 0101',
    email: 'laura.mendez@clinica.co',
    rating: 4.9,
  },
  {
    id: 'doc-rojas',
    name: 'Dra. Camila Rojas',
    specialty: 'Pediatría',
    license: 'RM-51777',
    phone: '+57 312 555 0103',
    email: 'camila.rojas@clinica.co',
    rating: 4.8,
  },
] as const;

/** `acceptingPatients` sólo cuando el backend de turno lo afirme. */
function medicos(options: FakeServerOptions): readonly Record<string, unknown>[] {
  return MEDICOS.map((medico) =>
    options.opcionales === 'full' ? { ...medico, acceptingPatients: true } : { ...medico },
  );
}

function paciente(id: string): FakePatient | undefined {
  return PACIENTES.find((entry) => entry.id === id);
}

function demografia(p: FakePatient, options: FakeServerOptions = {}): Record<string, unknown> {
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
    ...(options.opcionales === 'full' ? { active: true } : {}),
  };
}

function ficha(p: FakePatient, options: FakeServerOptions = {}): Record<string, unknown> {
  return {
    patient: demografia(p, options),
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

/** Las rutas del portal: resuelven el paciente por la SESIÓN (`PacienteDeLaSesionAsync`). */
const RUTAS_DEL_PORTAL = ['/portal/home', '/results', '/medications', '/health', '/billing', '/refill'];
/** Las rutas clínicas: exigen el rol (`ExigirClinico`). `/appointments` es la agenda de TODOS. */
const RUTAS_CLINICAS = ['/patients', '/patient/', '/appointments', '/schedule', '/inbasket', '/encounter', '/prescription', '/order'];

/**
 * Devuelve un doble de `fetch` que sirve el contrato del `EhrController`. Lo que no
 * conoce contesta 404 —que es exactamente lo que hace el backend con
 * `Synergos:DevSeed:Enabled=false`— y el cliente lo convierte en una lectura fallida.
 *
 * Las NEGATIVAS (CMS#197) llevan `{ error }`, como las del controlador: 401 sin sesión, 403 sin
 * rol clínico, 404 sin historia vinculada y 400 en la bandeja de un clínico sin médico.
 */
export function servidorFalso(
  options: FakeServerOptions = {},
): (url: string, init?: RequestInit) => Promise<Response> {
  const caidos = options.caidos ?? [];
  const sesion = options.sesion ?? MEDICA_CON_HISTORIA;

  return (url: string, init?: RequestInit) => {
    const ruta = String(url);
    const metodo = (init?.method ?? 'GET').toUpperCase();
    if (caidos.some((fragmento) => casa(fragmento, metodo, ruta))) {
      return Promise.resolve(respuesta(404, null));
    }
    const query = new URLSearchParams(ruta.includes('?') ? ruta.slice(ruta.indexOf('?') + 1) : '');
    const negativa = negativaDe(ruta, metodo, sesion);
    if (negativa) {
      return Promise.resolve(negativa);
    }
    // Pasó la negativa: hay sesión, y si la ruta es del portal, historia vinculada.
    const miembro = sesion as FakeSession;
    const p = miembro.paciente ?? MARIA;

    if (metodo === 'POST') {
      return Promise.resolve(respuesta(200, cuerpoDeEscritura(ruta, init ?? {}, miembro)));
    }

    if (ruta.includes('/patients')) {
      const q = (query.get('q') ?? '').toLowerCase();
      const lista = PACIENTES.filter(
        (entry) => !q || entry.name.toLowerCase().includes(q) || entry.problems.some((c) => c.toLowerCase().includes(q)),
      );
      return Promise.resolve(respuesta(200, { patients: lista.map((entry) => demografia(entry, options)) }));
    }
    if (ruta.includes('/patient/')) {
      const id = decodeURIComponent(ruta.slice(ruta.lastIndexOf('/') + 1));
      const elegido = paciente(id);
      return Promise.resolve(elegido ? respuesta(200, ficha(elegido, options)) : respuesta(404, { error: 'no existe' }));
    }
    if (ruta.includes('/copay')) {
      const copago = options.copago === undefined ? 80_000 : options.copago;
      return Promise.resolve(
        copago === null
          ? respuesta(503, { error: 'No se pudo calcular el copago.' })
          : respuesta(200, { amount: copago, amountMinor: Math.round(copago * 100), currency: 'COP' }),
      );
    }
    if (ruta.includes('/doctors')) {
      return Promise.resolve(respuesta(200, { doctors: medicos(options) }));
    }
    if (ruta.includes('/portal/home')) {
      return Promise.resolve(
        respuesta(200, {
          patient: demografia(p, options),
          cards: [
            { id: 'card-appt', kind: 'appointment', title: 'Próxima cita', detail: 'Control trimestral', action: 'visits', actionLabel: 'Ver mis citas', tone: 'brand' },
          ],
          nextAppointment: citaDe(p),
          balanceMinor: 0,
          currency: 'COP',
          // `unreadMessages` NO se emite por defecto, que es lo que hace el backend
          // desde #116 — no hay read-receipts. Sembrarlo sería la regla 10: un
          // servidor de mentira que afirma lo que el de verdad dejó de afirmar hace
          // verde justo el camino que hay que probar.
          ...(options.opcionales === 'full' ? { unreadMessages: 4 } : {}),
          pendingCheckins: 0,
        }),
      );
    }
    if (ruta.includes('/results')) {
      return Promise.resolve(
        respuesta(200, {
          results: [
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
          ],
        }),
      );
    }
    if (ruta.includes('/medications')) {
      return Promise.resolve(
        respuesta(200, {
          medications: [
            {
              id: `${p.id}-med-1`,
              patientId: p.id,
              drug: p.drug,
              dose: '50 mg',
              frequency: 'Cada 12 horas',
              instructions: 'Tomar con alimentos.',
              ...(options.opcionales === 'full' ? { pharmacy: 'Farmacia Central' } : {}),
              refillsLeft: 2,
              refillStatus: null,
            },
          ],
        }),
      );
    }
    if (ruta.includes('/health')) {
      return Promise.resolve(respuesta(200, salud(p, options)));
    }
    if (ruta.includes('/billing')) {
      if (options.sinEstadoDeCuenta) {
        return Promise.resolve(respuesta(404, { error: 'Tu historia clínica no tiene estado de cuenta.' }));
      }
      return Promise.resolve(
        respuesta(200, {
          statement: {
            patientId: p.id,
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
              ...(options.opcionales === 'full' ? { unread: 1 } : {}),
              messages: [
                { id: 'hilo-1-m1', author: 'Dra. Laura Méndez', body: 'Nos vemos en la cita.', createdAtUtc: '2026-09-10T12:00:00.000Z', outgoing: false },
              ],
            },
          ],
        }),
      );
    }
    if (ruta.includes('/inbasket')) {
      // La del médico de la sesión; `provider` sólo cuenta para quien no tiene médico (#197).
      const deQuien = miembro.clinico === 'medico' ? MEDICO_DE_LA_SESION : (query.get('provider') ?? '').trim();
      if (!deQuien) {
        return Promise.resolve(respuesta(400, { error: 'El parámetro provider es requerido.' }));
      }
      return Promise.resolve(respuesta(200, { items: bandejaDe(deQuien) }));
    }
    if (ruta.includes('/schedule')) {
      return Promise.resolve(
        respuesta(200, {
          slots: PACIENTES.map((entry, i) => ({
            appointmentId: `${entry.id}-slot`,
            patientId: entry.id,
            patientName: entry.name,
            doctorId: entry.primaryDoctorId,
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

/**
 * La negativa del `EhrController` para esta sesión y esta ruta, o `null` si pasa. Mismo orden
 * que el controlador: la sesión primero; luego el rol (clínica) o la historia (portal).
 */
function negativaDe(ruta: string, metodo: string, sesion: FakeSession | 'anonimo'): Response | null {
  const publica = ruta.includes('/doctors') || ruta.includes('/copay');
  if (publica) {
    return null;
  }
  // `/appointment` (POST, reservar) casa también con `/appointments` (GET, la agenda clínica).
  const reservar = metodo === 'POST' && ruta.includes('/appointment') && !ruta.includes('/appointments');
  const clinica = !reservar && RUTAS_CLINICAS.some((fragmento) => ruta.includes(fragmento));
  if (sesion === 'anonimo') {
    return respuesta(401, {
      error: clinica ? 'Inicia sesión como personal clínico.' : 'Inicia sesión para ver tu historia clínica.',
    });
  }
  if (clinica) {
    return sesion.clinico ? null : respuesta(403, { error: 'Tu cuenta no tiene permiso clínico.' });
  }
  // Mensajes: un clínico escribe como su médico (o su correo) sin historia; reservar: un clínico
  // agenda al `patientId` del cuerpo. El resto del portal exige la historia vinculada.
  const sinHistoriaBasta = (ruta.includes('/message') || reservar) && sesion.clinico !== null;
  const delPortal = reservar || ruta.includes('/message') || RUTAS_DEL_PORTAL.some((fragmento) => ruta.includes(fragmento));
  if (delPortal && !sinHistoriaBasta && sesion.paciente === null) {
    return respuesta(404, { error: 'Tu cuenta no tiene una historia clínica vinculada.' });
  }
  return null;
}

/** La bandeja de cada médico: distinta, para que el spec vea DE QUIÉN se pidió. */
function bandejaDe(medico: string): readonly Record<string, unknown>[] {
  const p = PACIENTES.find((entry) => entry.primaryDoctorId === medico);
  if (!p) {
    return [];
  }
  return [
    {
      id: `ib-${p.id}`,
      kind: 'result',
      patientId: p.id,
      patientName: p.name,
      title: p === MARIA ? 'Glucosa por revisar' : 'Espirometría por revisar',
      detail: 'Resultado liberado.',
      createdAtUtc: '2026-09-10T12:00:00.000Z',
      priority: 'routine',
      done: false,
    },
  ];
}

/** `'/health'` casa por ruta; `'POST /encounter'` casa por método Y ruta. */
function casa(fragmento: string, metodo: string, ruta: string): boolean {
  const espacio = fragmento.indexOf(' ');
  if (espacio === -1) {
    return ruta.includes(fragmento);
  }
  return (
    fragmento.slice(0, espacio).toUpperCase() === metodo &&
    ruta.includes(fragmento.slice(espacio + 1))
  );
}

function cuerpoDeEscritura(ruta: string, init: RequestInit, miembro: FakeSession): Record<string, unknown> {
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
  if (ruta.includes('/appointment')) {
    const slot = (enviado['slot'] ?? {}) as Record<string, unknown>;
    // Un clínico agenda al `patientId` del cuerpo; cualquier otro, a SU paciente: el del cuerpo
    // se ignora (#197).
    const paraQuien = miembro.clinico ? String(enviado['patientId'] ?? '') : (miembro.paciente?.id ?? '');
    return {
      appointment: {
        // El id lo pone el SERVIDOR: es lo que el paciente enseña en recepción, y es
        // lo que distingue una cita apartada de un comprobante acuñado en el navegador.
        id: 'CITA-DEL-SERVIDOR-7',
        patientId: paraQuien,
        patientName: paciente(paraQuien)?.name ?? '',
        doctorId: String(enviado['doctorId'] ?? ''),
        doctorName: 'Dra. Laura Méndez',
        date: String(slot['date'] ?? ''),
        time: String(slot['time'] ?? ''),
        durationMin: 30,
        reason: 'Consulta',
        status: 'booked',
      },
    };
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
