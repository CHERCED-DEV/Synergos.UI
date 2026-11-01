import { TestBed } from '@angular/core/testing';
import { ResenasApi } from './resenas-api.client';

describe('ResenasApi', () => {
  function createClient(): ResenasApi {
    return TestBed.inject(ResenasApi);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── moderación (#31) ────────────────────────────────────────────────────────
  //
  // EL defecto: `response.ok` es cierto para TODO 2xx, así que un `202 Accepted`
  // —lo que contesta un borde que encola para revisión— se leía como publicación.
  function respuesta(status: number): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve({}),
        } as Response),
      ),
    );
  }

  it('EL caso: un 202 es «en revisión», no «publicada»', async () => {
    respuesta(202);
    const result = await createClient().submitReview('/api/shop', 'SKU-1', {
      rating: 5,
      title: 'Muy bueno',
      body: 'Cumple lo que promete y llegó antes.',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.pending).toBe(true);
  });

  it('un 201 sí es publicada', async () => {
    respuesta(201);
    const result = await createClient().submitReview('/api/shop', 'SKU-1', {
      rating: 5,
      title: 'Muy bueno',
      body: 'Cumple lo que promete y llegó antes.',
    });

    expect(result.ok && result.pending).toBe(false);
  });

  it('un 409 al reportar NO es un fallo: el servidor deduplica', async () => {
    respuesta(409);
    const result = await createClient().reportReview('/api/shop', 'r1');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('already-reported');
  });

  it('reportar sin sesión NO se confunde con reportar y que falle', async () => {
    respuesta(401);
    const client = createClient();
    expect((await client.reportReview('/api/shop', 'r1')) as unknown).toMatchObject({
      ok: false,
      reason: 'unauthenticated',
    });

    respuesta(500);
    expect((await client.reportReview('/api/shop', 'r1')) as unknown).toMatchObject({
      ok: false,
      reason: 'failed',
    });
  });
});
