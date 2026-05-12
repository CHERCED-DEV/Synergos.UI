import type {
  BehaviorInteraction,
  BehaviorNavigation,
  BehaviorTracking,
  DomAttributes,
  DomClass,
  DomLayout,
  DomSpacing,
  DomVariant,
  DomVisibility,
} from './compositions.contract';

// ── CDN Artifact Resolution ───────────────────────────────────────────────────
// Mirror: Synergos.CMS/Application/Cdn/Output/ArtifactInfo.cs

export interface ArtifactInfo {
  readonly name: string;
  readonly tag: string;
  readonly scriptUrl: string;
  readonly styleUrl?: string;
  readonly integrity?: string;
  readonly version: string;
  readonly framework?: string;
}

/** Resolved content element ready for DOM mounting. */
export interface ContentElement {
  readonly tag: string;
  readonly scriptUrl: string;
  readonly configJson: string;
  readonly blockClass?: string;
  readonly elementId?: string;
  readonly domClass?: string;
  readonly ariaLabel?: string;
}

/** @deprecated Pre-Block-Grid pattern — inject via Block Grid instead. */
export interface AngularHostConfig {
  readonly componentName?: string;
  readonly apiEndpoint?: string;
  readonly dataAttributes?: string;
}

/** @deprecated Pre-Block-Grid pattern — inject via Block Grid instead. */
export interface MfHostConfig {
  readonly remoteEntry?: string;
  readonly exposedModule?: string;
  readonly apiEndpoint?: string;
  readonly dataAttributes?: string;
}

/** Minimal block shape for CDN style/integrity info. */
export interface SynergosBlock {
  readonly styleUrl?: string;
  readonly integrity?: string;
}

// Backward-compat aliases (keep callers that used the "Resolved" prefix working)
export type {
  ArtifactInfo as ResolvedArtifactInfo,
  AngularHostConfig as ResolvedAngularHostConfig,
  ContentElement as ResolvedContentElement,
  MfHostConfig as ResolvedMfHostConfig,
  SynergosBlock as ResolvedSynergosBlock,
};

// ── Component Model Base ──────────────────────────────────────────────────────

export interface BaseResolverComponentModel {
  readonly domClass?: DomClass;
  readonly domAttributes?: DomAttributes;
  readonly domVariant?: DomVariant;
  readonly domLayout?: DomLayout;
  readonly domSpacing?: DomSpacing;
  readonly domVisibility?: DomVisibility;
  readonly tracking?: BehaviorTracking;
  readonly navigation?: BehaviorNavigation;
  readonly interaction?: BehaviorInteraction;
}
