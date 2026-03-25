// ── Content Compositions ──────────────────────────────────────────────────────
// Mirror: Synergos.CMS/Domain/Compositions/Content/

import type { Image, Link } from './shared.contract';

export interface ContentHeading {
  headingText?: string;
  headingLevel?: string;
  headingTagOverride?: string;
}

export interface ContentText {
  title?: string;
  subtitle?: string;
  body?: string;
  summary?: string;
  caption?: string;
}

export interface ContentMedia {
  media?: Image;
  altText?: string;
  mediaTitle?: string;
  mediaDescription?: string;
}

export interface ContentCta {
  ctaLabel?: string;
  ctaLink?: Link;
  ctaTarget?: string;
  ctaAriaLabel?: string;
}

export interface ContentBadge {
  badgeText?: string;
  badgeType?: string;
}

export interface ContentCollection {
  collectionTitle?: string;
  collectionDescription?: string;
  items?: readonly Record<string, unknown>[];
}

export interface ContentAuthor {
  authorName?: string;
  authorRole?: string;
  authorImage?: Image;
}

export interface ContentDate {
  publishDate?: string;
  updateDate?: string;
}

export interface ContentMetadata {
  tags: readonly string[];
  category?: string;
  keywords?: string;
}

export interface ContentEmbed {
  embedUrl?: string;
  embedType?: string;
  embedTitle?: string;
}

// ── DOM Compositions ─────────────────────────────────────────────────────────
// Mirror: Synergos.CMS/Domain/Compositions/Dom/

export interface DomClass {
  classList?: string;
}

export interface DomAttributes {
  elementId?: string;
  dataAttributes?: string;
  ariaLabel?: string;
  role?: string;
}

export interface DomLayout {
  containerType?: string;
  alignment?: string;
  direction?: string;
}

export interface DomSpacing {
  margin?: string;
  padding?: string;
  gap?: string;
}

export interface DomVisibility {
  hideOnMobile: boolean;
  hideOnDesktop: boolean;
}

export interface DomVariant {
  variant?: string;
  theme?: string;
}

// ── Behavior Compositions ────────────────────────────────────────────────────
// Mirror: Synergos.CMS/Domain/Compositions/Behavior/

export interface BehaviorTracking {
  eventName?: string;
  eventCategory?: string;
  eventLabel?: string;
}

export interface BehaviorInteraction {
  interactionType?: string;
  interactionAction?: string;
}

export interface BehaviorNavigation {
  navigateTo?: string;
  navigationType?: string;
}

export interface BehaviorFeatureFlag {
  featureKey?: string;
  isEnabled: boolean;
}

export interface BehaviorAsync {
  apiEndpoint?: string;
  method?: string;
}

export interface BehaviorScript {
  scriptType?: string;
  scriptContent?: string;
}
