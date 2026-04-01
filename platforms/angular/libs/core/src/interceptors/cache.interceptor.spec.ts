import { HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { cacheInterceptor } from './cache.interceptor';
import { ENVIRONMENT } from '../core.tokens';
import { RequestCacheService } from '../services/request-cache.service';

describe('cacheInterceptor', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RequestCacheService,
        {
          provide: ENVIRONMENT,
          useValue: {
            production: false,
            apiBaseUrl: '/api',
            cdnBaseUrl: '',
            cache: {
              enabled: true,
              ttlSeconds: 60,
              includeUrls: ['/api/cacheable'],
            },
          },
        },
      ],
    });
  });

  it('caches matching GET responses', async () => {
    const request = new HttpRequest('GET', '/api/cacheable/items');
    const next = vi.fn().mockReturnValue(of(new HttpResponse({ body: { ok: true } })));

    const firstResponse = await TestBed.runInInjectionContext(() =>
      firstValueFrom(cacheInterceptor(request, next)),
    );
    const secondResponse = await TestBed.runInInjectionContext(() =>
      firstValueFrom(cacheInterceptor(request, next)),
    );

    expect(firstResponse).toBeInstanceOf(HttpResponse);
    expect(secondResponse).toBeInstanceOf(HttpResponse);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('skips requests that are not cacheable', async () => {
    const request = new HttpRequest('POST', '/api/cacheable/items', null);
    const next = vi.fn().mockReturnValue(of(new HttpResponse({ body: { ok: true } })));

    await TestBed.runInInjectionContext(() => firstValueFrom(cacheInterceptor(request, next)));

    expect(next).toHaveBeenCalledTimes(1);
  });
});
