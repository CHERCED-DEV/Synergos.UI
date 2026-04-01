import { HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { RequestCacheService } from './request-cache.service';

describe(RequestCacheService.name, () => {
  let service: RequestCacheService;

  beforeEach(() => {
    vi.useFakeTimers();

    TestBed.configureTestingModule({
      providers: [RequestCacheService],
    });

    service = TestBed.inject(RequestCacheService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and returns cached responses', () => {
    service.set('/api/home', new HttpResponse({ body: { ok: true } }), 30);

    expect(service.get('/api/home')?.body).toEqual({ ok: true });
  });

  it('expires cached responses after ttl', () => {
    service.set('/api/home', new HttpResponse({ body: { ok: true } }), 1);
    vi.advanceTimersByTime(1500);

    expect(service.get('/api/home')).toBeNull();
  });
});
