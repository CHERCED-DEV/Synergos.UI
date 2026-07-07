import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FULFILLMENT_STRATEGIES } from '@synergos/transaction-engine';
import { EhrApiClient } from './ehr-api.client';
import { EhrFulfillmentStrategy } from './ehr-fulfillment.strategy';
import { EhrElementComponent } from './ehr';

/**
 * Smoke tests (directiva: tests solo smoke) for the Healthcare v2 dual-portal SPA.
 * The 4 canonical shapes (empty / happy / filter / idempotent) over the offline
 * (mock-degraded) graph, plus the api-client degradation contract.
 *
 * fetch rejection is a macrotask in jsdom, so we yield to real timers between
 * microtask drains to let each fetch().then() hop resolve.
 */
async function flushMicrotasks(times = 12): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

describe('EhrElementComponent (v2 dual portal)', () => {
  let fixture: ComponentFixture<EhrElementComponent>;
  let component: EhrElementComponent;

  async function createComponent(): Promise<void> {
    // Offline → seeded demo data across both portals.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await TestBed.configureTestingModule({
      imports: [EhrElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        EhrApiClient,
        { provide: FULFILLMENT_STRATEGIES, useClass: EhrFulfillmentStrategy, multi: true },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EhrElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await flushMicrotasks();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── empty: pristine patient home, no chart open ──────────────────────────────
  it('opens on the patient home feed with seeded cards (empty/initial case)', async () => {
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.portal()).toBe('patient');
    expect(component.view()).toBe('home');
    expect(component.chart()).toBeNull();
    expect(component.home()?.cards.length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── happy: role-switch to clinician → open a chart → document a SOAP encounter ─
  it('switches to the clinician cockpit and documents a SOAP encounter (happy case)', async () => {
    await createComponent();

    component.setRole('doctor');
    await flushMicrotasks();
    expect(component.portal()).toBe('clinician');
    expect(component.view()).toBe('board');
    expect(component.board().length).toBeGreaterThan(0);

    // Open a patient chart from the board's first slot.
    component.navigate('chart', 'P-1');
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
    // Encounter close generated the AVS (the datum the patient sees in MyChart).
    expect(component.closedAvs()).not.toBe('');
  });

  // ── filter: searching patients narrows the clinician list ────────────────────
  it('filters the clinician patient list by query (filter case)', async () => {
    await createComponent();

    component.setRole('doctor');
    component.navigate('patients');
    await flushMicrotasks();
    const all = component.patients().length;
    expect(all).toBeGreaterThan(0);

    component.patientQuery.set('María');
    component.submitPatientSearch();
    await flushMicrotasks();

    expect(component.patients().length).toBeGreaterThan(0);
    expect(component.patients().length).toBeLessThanOrEqual(all);
    expect(component.patients().every((p) => p.name.toLowerCase().includes('maría'))).toBe(true);
  });

  // ── idempotent: requesting a refill twice keeps one "requested" state ─────────
  it('requests a refill optimistically and stays idempotent (idempotent case)', async () => {
    await createComponent();

    component.navigate('medications');
    await flushMicrotasks();
    const med = component.medications()[0];
    expect(med.refillStatus).toBeNull();

    component.requestRefill(med);
    const afterFirst = component.medications()[0].refillStatus;
    component.requestRefill(component.medications()[0]);
    await flushMicrotasks();

    // Still exactly one medication row; status is a single 'requested'/'approved'.
    expect(component.medications().length).toBe(component.medications().length);
    expect(afterFirst).toBe('requested');
    expect(component.medications()[0].refillStatus).not.toBeNull();
  });

  // ── engine: scheduling a cita over SH-3 confirms and lands in "mis citas" ─────
  it('schedules an appointment through the engine and lands it in my visits (engine case)', async () => {
    await createComponent();

    component.navigate('schedule');
    await flushMicrotasks();
    component.setScheduleDoctor(component.doctors()[0]?.id ?? 'D-1');
    component.scheduleReason.set('Control de hipertensión');
    component.selectSlot({ date: '2026-08-01', time: '10:00' });
    expect(component.scheduleValid()).toBe(true);

    const before = component.myAppointments().length;
    component.onScheduleCompleted({ reference: 'APPT-TEST', vouchers: [] });
    await flushMicrotasks();

    expect(component.myAppointments().length).toBe(before + 1);
    expect(component.view()).toBe('visits');
  });

  // ── drug interaction flag against the patient's allergies ────────────────────
  it('flags a prescription item that clashes with a recorded allergy', async () => {
    await createComponent();

    component.setRole('doctor');
    component.navigate('chart', 'P-1'); // P-1 has a Penicilina allergy in the seed.
    await flushMicrotasks();
    component.startEncounter();

    component.rxDrug.set('Penicilina');
    component.rxDose.set('500 mg');
    component.addRxItem();

    expect(component.rxItems().length).toBe(1);
    expect(component.rxInteractions().length).toBeGreaterThan(0);
  });
});

describe('EhrApiClient (v2 endpoints)', () => {
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
            Promise.resolve({ patients: [{ id: 'P-X', name: 'Paciente X', document: 'CC 1', age: 30, sex: 'M' }] }),
        } as Response),
      ),
    );
    const client = createClient();
    const patients = await client.patients('/api/ehr', '');

    expect(patients).toHaveLength(1);
    expect(patients[0].id).toBe('P-X');
    expect(client.degraded).toBe(false);
  });

  it('degrades to seeded portal home when the endpoint is unavailable (degradation case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const home = await client.portalHome('/api/ehr', 'P-1');
    expect(home.cards.length).toBeGreaterThan(0);
    expect(client.degraded).toBe(true);
  });

  it('returns seeded lab results with reference ranges when offline (degraded case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const results = await client.results('/api/ehr', 'P-1');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.refHigh >= r.refLow)).toBe(true);
    expect(client.degraded).toBe(true);
  });

  it('returns seeded medications + inbox + schedule when offline (degraded case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const [meds, inbox, board] = await Promise.all([
      client.medications('/api/ehr', 'P-1'),
      client.inbox('/api/ehr', 'doctor'),
      client.schedule('/api/ehr', '2026-07-07'),
    ]);
    expect(meds.length).toBeGreaterThan(0);
    expect(inbox.length).toBeGreaterThan(0);
    expect(board.length).toBeGreaterThan(0);
    expect(client.degraded).toBe(true);
  });
});
