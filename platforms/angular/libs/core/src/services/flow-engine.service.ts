import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ENVIRONMENT } from '../core.tokens';
import type {
  FlowDetail,
  FlowListResponse,
  FlowPublishResult,
  FlowTriggerRequest,
} from '@synergos/contracts';

/**
 * Client for the Synergos Flow Engine API.
 *
 * All endpoints require Environment.apiKey to be set — the authInterceptor
 * attaches X-Api-Key automatically for requests to apiBaseUrl.
 *
 * Endpoints:
 *   GET  /api/synergos/v1/orchestration/flows
 *   GET  /api/synergos/v1/orchestration/flows/{alias}
 *   POST /api/synergos/v1/orchestration/flows/{alias}/publish
 *   POST /api/synergos/v1/orchestration/flows/{alias}/trigger
 */
@Injectable({ providedIn: 'root' })
export class FlowEngineService {
  readonly #http = inject(HttpClient);
  readonly #env  = inject(ENVIRONMENT);

  /** Returns a summary list of all published flow definitions. */
  getFlows(): Observable<FlowListResponse> {
    return this.#http.get<FlowListResponse>(
      `${this.#env.apiBaseUrl}/api/synergos/v1/orchestration/flows`,
    );
  }

  /** Returns the full configuration of a single flow by alias. */
  getFlow(alias: string): Observable<FlowDetail> {
    return this.#http.get<FlowDetail>(
      `${this.#env.apiBaseUrl}/api/synergos/v1/orchestration/flows/${encodeURIComponent(alias)}`,
    );
  }

  /**
   * Reads the FlowDefinition from the CMS, signs it, and pushes it to
   * the Synergos.API engine. Use from admin/internal tooling only.
   */
  publishFlow(alias: string): Observable<FlowPublishResult> {
    return this.#http.post<FlowPublishResult>(
      `${this.#env.apiBaseUrl}/api/synergos/v1/orchestration/flows/${encodeURIComponent(alias)}/publish`,
      null,
    );
  }

  /**
   * Relays a flow execution request to the engine and returns its result.
   *
   * @param alias    Flow alias as defined in the CMS.
   * @param request  Execution context: caseId (required) + optional input map.
   */
  triggerFlow(alias: string, request: FlowTriggerRequest): Observable<unknown> {
    return this.#http.post<unknown>(
      `${this.#env.apiBaseUrl}/api/synergos/v1/orchestration/flows/${encodeURIComponent(alias)}/trigger`,
      request,
    );
  }
}
