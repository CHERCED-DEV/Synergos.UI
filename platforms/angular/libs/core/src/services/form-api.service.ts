import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ENVIRONMENT } from '../core.tokens';
import type { FormSubmissionResult } from '@synergos/contracts';

/**
 * Submits Synergos form data to the CMS.
 *
 * Endpoint: POST /api/forms/submit
 * Encoding: application/x-www-form-urlencoded
 *
 * The CMS controller binds `formAlias` via [FromForm] and reads
 * individual field values from Request.Form by field name.
 */
@Injectable({ providedIn: 'root' })
export class FormApiService {
  readonly #http    = inject(HttpClient);
  readonly #env     = inject(ENVIRONMENT);
  readonly #headers = new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' });

  /**
   * @param formAlias  Alias of the FormDefinition node in the CMS.
   * @param fields     Key/value map of submitted field values (field name → value).
   */
  submit(formAlias: string, fields: Record<string, string>): Observable<FormSubmissionResult> {
    const url = `${this.#env.apiBaseUrl}/api/forms/submit`;
    const body = this.#encodeBody(formAlias, fields);
    return this.#http.post<FormSubmissionResult>(url, body, { headers: this.#headers });
  }

  #encodeBody(formAlias: string, fields: Record<string, string>): string {
    const params = new URLSearchParams({ formAlias });
    for (const [key, value] of Object.entries(fields)) {
      params.set(key, value);
    }
    return params.toString();
  }
}
