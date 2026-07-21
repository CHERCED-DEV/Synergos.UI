import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ENVIRONMENT } from '../core.tokens';

/**
 * Attaches authorization headers to outbound API requests.
 * Skips requests that go to external origins (CDN, third-party).
 *
 * If Environment.apiKey is set, attaches X-Api-Key to every request
 * that targets apiBaseUrl. Required for protected endpoints like
 * /api/synergos/v1/orchestration/*.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const env = inject(ENVIRONMENT);

  if (!req.url.startsWith(env.apiBaseUrl) || !env.apiKey) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { 'X-Api-Key': env.apiKey } }));
};
