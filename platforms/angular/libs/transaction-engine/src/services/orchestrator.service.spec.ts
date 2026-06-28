import { TestBed } from '@angular/core/testing';
import { OrchestratorService } from './orchestrator.service';

describe(OrchestratorService.name, () => {
  let service: OrchestratorService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [OrchestratorService] });
    service = TestBed.inject(OrchestratorService);
  });

  // ── empty ──────────────────────────────────────────────────────────────────
  it('is not ready with zero widgets registered', () => {
    expect(service.allReady()).toBe(false);
    expect(service.widgets()).toEqual([]);
    expect(service.loading()).toBe(false);
  });

  // ── happy ──────────────────────────────────────────────────────────────────
  it('becomes ready only when every widget leaves loading', () => {
    service.register('search');
    service.register('cart');

    expect(service.allReady()).toBe(false);

    service.setStatus('search', 'loaded');
    expect(service.allReady()).toBe(false);

    service.setStatus('cart', 'loaded');
    expect(service.allReady()).toBe(true);
  });

  it('dedups concurrent calls with the same requestId onto one promise', async () => {
    let calls = 0;
    const task = () => {
      calls += 1;
      return Promise.resolve('avail');
    };

    const a = service.callApi('avail:CTG', task);
    const b = service.callApi('avail:CTG', task);
    expect(a).toBe(b);
    expect(service.isInFlight('avail:CTG')).toBe(true);

    await Promise.all([a, b]);
    expect(calls).toBe(1);
    expect(service.isInFlight('avail:CTG')).toBe(false);

    // settled → a new call re-issues
    await service.callApi('avail:CTG', task);
    expect(calls).toBe(2);
  });

  it('runs the submit queue in ascending order once all submitters enqueue', async () => {
    const ran: string[] = [];
    service.register('checkout', { isSubmitter: true, order: 2 });
    service.register('cart', { isSubmitter: true, order: 1 });
    service.setStatus('checkout', 'ready');
    service.setStatus('cart', 'ready');

    const first = service.submit('checkout', async () => {
      ran.push('checkout');
    });
    // not all submitters enqueued yet → queue not fired
    expect(ran).toEqual([]);

    await service.submit('cart', async () => {
      ran.push('cart');
    });
    await first;

    expect(ran).toEqual(['cart', 'checkout']);
  });

  // ── filter (de-duplication of names) ─────────────────────────────────────────
  it('suffixes duplicate widget names instead of colliding', () => {
    const a = service.register('results');
    const b = service.register('results');
    const c = service.register('results');
    expect([a, b, c]).toEqual(['results', 'results-1', 'results-2']);
  });

  // ── idempotent ───────────────────────────────────────────────────────────────
  it('reset clears widgets, queue and in-flight registry', async () => {
    service.register('cart', { isSubmitter: true });
    service.callApi('x', () => new Promise(() => undefined));
    expect(service.isInFlight('x')).toBe(true);

    service.reset();

    expect(service.widgets()).toEqual([]);
    expect(service.isInFlight('x')).toBe(false);
    expect(service.allReady()).toBe(false);
  });

  it('suppresses shared spinner while a skeleton widget is registered', async () => {
    service.register('cart', { isSubmitter: true, useSkeleton: true });
    service.setStatus('cart', 'ready');
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const submit = service.submit('cart', () => gate);
    expect(service.loading()).toBe(false); // skeleton suppresses spinner
    release();
    await submit;
  });
});
