import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EhrApiClient } from './ehr-api.client';
import { EhrElementComponent } from './ehr';

/**
 * Settle a fetch().then() chain — fetch rejection is a macrotask in jsdom, so we
 * yield to real timers between microtask drains to let each hop resolve.
 */
async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

describe('EhrElementComponent', () => {
  let fixture: ComponentFixture<EhrElementComponent>;
  let component: EhrElementComponent;

  async function createComponent(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [EhrElementComponent],
      providers: [provideZonelessChangeDetection(), EhrApiClient],
    }).compileComponents();

    fixture = TestBed.createComponent(EhrElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // The clinical dashboard loads in the constructor; let it settle.
    await flushMicrotasks();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── empty: pristine dashboard, no patient open ───────────────────────────────
  it('opens on the clinical dashboard with seeded KPIs (empty/initial case)', async () => {
    // Offline → seeded demo data; dashboard still renders.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.view()).toBe('dashboard');
    expect(component.chart()).toBeNull();
    expect(component.kpis().length).toBe(4);
    expect(component.patients().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── happy: open a chart → document a SOAP encounter → it lands in history ─────
  it('documents a SOAP encounter and prepends it to the chart (happy case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    // Clinicians may write; switch to the doctor role.
    component.setRole('doctor');
    const patient = component.patients()[0];
    component.openPatient(patient);
    await flushMicrotasks();

    expect(component.view()).toBe('chart');
    const before = component.chart()?.history.length ?? 0;

    component.startEncounter();
    expect(component.view()).toBe('encounter');

    component.soapSubjective.set('Refiere cefalea leve.');
    component.soapAssessment.set('Cefalea tensional.');
    component.soapPlan.set('Analgésico y control.');
    component.vitalsSystolic.set('120');
    component.vitalsWeight.set('70');
    expect(component.soapValid()).toBe(true);

    await component.saveEncounter();
    await flushMicrotasks();

    expect(component.view()).toBe('chart');
    expect(component.chart()?.history.length).toBe(before + 1);
    expect(component.chart()?.history[0].soap.assessment).toBe('Cefalea tensional.');
  });

  // ── filter: searching patients narrows the list ──────────────────────────────
  it('filters the patient list by query (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const all = component.patients().length;
    component.patientQuery.set('María');
    component.submitPatientSearch();
    await flushMicrotasks();

    expect(component.patients().length).toBeGreaterThan(0);
    expect(component.patients().length).toBeLessThanOrEqual(all);
    expect(
      component.patients().every((patient) => patient.name.toLowerCase().includes('maría')),
    ).toBe(true);
  });

  // ── idempotent: booking the same slot keeps one optimistic appointment ───────
  it('books an appointment optimistically and reconciles to one entry (idempotent case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.go('appointments');
    await flushMicrotasks();
    const before = component.appointments().length;

    component.setRole('admin');
    component.bookPatientId.set(component.patients()[0].id);
    component.bookDoctorId.set(component.doctors()[0].id);
    component.bookDate.set('2026-07-01');
    component.bookTime.set('09:00');
    component.bookReason.set('Control');
    expect(component.bookValid()).toBe(true);

    await component.bookAppointment();
    await flushMicrotasks();

    // Exactly one new appointment (optimistic entry reconciled with the fallback, not duplicated).
    expect(component.appointments().length).toBe(before + 1);
    expect(component.appointments().some((appointment) => appointment.reason === 'Control')).toBe(
      true,
    );
  });

  // ── RBAC: a nurse/admin gate clinical writes vs scheduling ───────────────────
  it('gates clinical writes and scheduling by demo role', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.setRole('admin');
    expect(component.canClinicalWrite()).toBe(false);
    expect(component.canSchedule()).toBe(true);

    component.setRole('doctor');
    expect(component.canClinicalWrite()).toBe(true);
    expect(component.canSchedule()).toBe(true);

    component.setRole('nurse');
    expect(component.canClinicalWrite()).toBe(true);
    expect(component.canSchedule()).toBe(false);
  });

  // ── drug interaction flag against the patient's allergies ────────────────────
  it('flags a prescription item that clashes with a recorded allergy', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.setRole('doctor');
    // P-1 (María González) has a Penicilina allergy in the seed.
    const patient = component.patients().find((entry) => entry.id === 'P-1');
    if (!patient) {
      throw new Error('expected seeded patient P-1');
    }
    component.openPatient(patient);
    await flushMicrotasks();
    component.startEncounter();

    component.rxDrug.set('Penicilina');
    component.rxDose.set('500 mg');
    component.addRxItem();

    expect(component.rxItems().length).toBe(1);
    expect(component.rxInteractions().length).toBeGreaterThan(0);
  });
});

describe('EhrApiClient', () => {
  function createClient(): EhrApiClient {
    TestBed.configureTestingModule({ providers: [EhrApiClient] });
    return TestBed.inject(EhrApiClient);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('normalises a live patients response (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              patients: [
                { id: 'P-X', name: 'Paciente X', document: 'CC 1', age: 30, sex: 'M' },
              ],
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const patients = await client.patients('/api/ehr', '');

    expect(patients).toHaveLength(1);
    expect(patients[0].id).toBe('P-X');
    expect(client.degraded).toBe(false);
  });

  it('degrades to seeded demo data when patients endpoint is unavailable (degradation case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const patients = await client.patients('/api/ehr', '');
    expect(patients.length).toBeGreaterThan(0);
    expect(client.degraded).toBe(true);
  });

  it('filters the seeded patient list by query when degraded (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const patients = await client.patients('/api/ehr', 'Carlos');
    expect(client.degraded).toBe(true);
    expect(patients.length).toBeGreaterThan(0);
    expect(patients.every((patient) => patient.name.toLowerCase().includes('carlos'))).toBe(true);
  });

  it('returns a seeded chart with encounters when offline (happy/degraded case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const chart = await client.patientChart('/api/ehr', 'P-1');
    expect(chart.patient.id).toBe('P-1');
    expect(chart.encounters.length).toBeGreaterThan(0);
    expect(chart.prescriptions.length).toBeGreaterThan(0);
    expect(client.degraded).toBe(true);
  });
});
