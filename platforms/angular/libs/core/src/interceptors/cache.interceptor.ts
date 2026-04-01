import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ENVIRONMENT } from '../core.tokens';
import { RequestCacheService } from '../services/request-cache.service';

export const cacheInterceptor: HttpInterceptorFn = (req, next) => {
  const environment = inject(ENVIRONMENT);
  const cacheService = inject(RequestCacheService);
  const cacheConfig = environment.cache;

  if (
    req.method !== 'GET' ||
    !cacheConfig?.enabled ||
    !cacheConfig.includeUrls?.some((pattern) => req.url.startsWith(pattern))
  ) {
    return next(req);
  }

  const cachedResponse = cacheService.get(req.urlWithParams);
  if (cachedResponse) {
    return of(cachedResponse);
  }

  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) {
        cacheService.set(req.urlWithParams, event, cacheConfig.ttlSeconds);
      }
    }),
  );
};
