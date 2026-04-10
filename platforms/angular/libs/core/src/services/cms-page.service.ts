import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ENVIRONMENT } from '../core.tokens';
import type { PageConfig } from '@synergos/contracts';

/**
 * Fetches Synergos page configurations from the CMS.
 *
 * Endpoint: GET /api/synergos/v1/page?path={path}
 * Cache:    30 s on the server (OutputCache); client cache honours
 *           Environment.cache if includeUrls contains the API base.
 */
@Injectable({ providedIn: 'root' })
export class CmsPageService {
  readonly #http = inject(HttpClient);
  readonly #env  = inject(ENVIRONMENT);

  getPage(path: string): Observable<PageConfig> {
    const url = `${this.#env.apiBaseUrl}/api/synergos/v1/page`;
    return this.#http.get<PageConfig>(url, { params: { path } });
  }
}
