// ── Flow Engine Contracts ──────────────────────────────────────────────────────
// Mirror: Synergos.CMS/Domain/Orchestration/FlowConfig.cs
//         Synergos.CMS/Presentation/Api/FlowOrchestrationController.cs

export interface FlowSummary {
  readonly flowAlias: string;
  readonly flowName: string;
  readonly executionMode: string;
  readonly isActive: boolean;
  readonly trackCount: number;
  readonly outcomeCount: number;
  readonly schemaVersion: string;
}

export interface FlowTrack {
  readonly trackId: string;
  readonly name: string;
  readonly order: number;
  readonly stepType: string;
  readonly condition?: string;
  readonly onFailure?: string;
}

export interface FlowOutcome {
  readonly code: string;
  readonly label: string;
  readonly httpStatus: number;
  readonly triggerWebhook: boolean;
}

export interface FlowDetail extends FlowSummary {
  readonly flowDescription?: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly webhookTargetUrl?: string;
  readonly tracks: readonly FlowTrack[];
  readonly outcomes: readonly FlowOutcome[];
}

export interface FlowListResponse {
  readonly count: number;
  readonly flows: readonly FlowSummary[];
}

export interface FlowPublishResult {
  readonly published: boolean;
  readonly flowAlias: string;
  readonly engineStatusCode?: number;
  readonly executionMode: string;
  readonly trackCount: number;
  readonly outcomeCount: number;
  readonly publishedAt: string;
}

export interface FlowTriggerRequest {
  readonly caseId: string;
  readonly input?: Record<string, unknown>;
}
