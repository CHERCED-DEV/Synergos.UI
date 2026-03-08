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

  // TODO: inject an AuthService and attach the bearer token
  // const token = inject(AuthService).getToken();
  // const authed = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  // return next(authed);

  return next(req);
};
