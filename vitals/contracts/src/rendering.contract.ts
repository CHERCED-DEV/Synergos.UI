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

export type {
  ArtifactInfo as ResolvedArtifactInfo,
  AngularHostConfig as ResolvedAngularHostConfig,
  ContentElement as ResolvedContentElement,
  MfHostConfig as ResolvedMfHostConfig,
  SynergosBlock as ResolvedSynergosBlock,
} from './generated/rendering.generated';

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
