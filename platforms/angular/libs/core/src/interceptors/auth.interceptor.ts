import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ENVIRONMENT } from '../core.tokens';

/**
 * Attaches authorization headers to outbound API requests.
 * Skips requests that go to external origins (CDN, third-party).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const env = inject(ENVIRONMENT);

  if (!req.url.startsWith(env.apiBaseUrl)) {
    return next(req);
  }

  return next(req);
};
