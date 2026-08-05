// ── Element Data Contracts ────────────────────────────────────────────────────
// Mirror: Synergos.CMS/Application/Elements/
//
// Each interface represents the `data` payload inside a BlockConfig
// for a specific element type. Property names match the CMS API
// JSON serialization (camelCase).

import type {
  ContentHeading,
  ContentText,
  ContentMedia,
  ContentCta,
  ContentBadge,
  ContentCollection,
  ContentAuthor,
  ContentDate,
  ContentEmbed,
  DomClass,
  DomAttributes,
  DomVariant,
  DomLayout,
  DomSpacing,
  DomVisibility,
  BehaviorTracking,
  BehaviorNavigation,
  BehaviorInteraction,
  BehaviorAsync,
  BehaviorScript,
  MountConfig,
} from './compositions.contract';

// ── Base (inherited by all elements) ─────────────────────────────────────────

export interface BaseElementData {
  domClass?: DomClass;
  domAttributes?: DomAttributes;
  domVariant?: DomVariant;
  domLayout?: DomLayout;
  domSpacing?: DomSpacing;
  domVisibility?: DomVisibility;
  tracking?: BehaviorTracking;
  navigation?: BehaviorNavigation;
  interaction?: BehaviorInteraction;
}

// ── Composition Elements (c8) ────────────────────────────────────────────────

export interface HeroElementData extends BaseElementData {
  heading?: ContentHeading;
  text?: ContentText;
  media?: ContentMedia;
  cta?: ContentCta;
}

export interface CardElementData extends BaseElementData {
  text?: ContentText;
  media?: ContentMedia;
  cta?: ContentCta;
  badge?: ContentBadge;
}

export interface CtaBannerElementData extends BaseElementData {
  heading?: ContentHeading;
  text?: ContentText;
  media?: ContentMedia;
  cta?: ContentCta;
  secondaryCta?: ContentCta;
}

export interface FeatureGridElementData extends BaseElementData {
  collection?: ContentCollection;
}

export interface FaqListElementData extends BaseElementData {
  collection?: ContentCollection;
}

export interface TestimonialListElementData extends BaseElementData {
  collection?: ContentCollection;
}


export interface MediaTextSplitElementData extends BaseElementData {
  text?: ContentText;
  media?: ContentMedia;
  cta?: ContentCta;
}

// ── Structural Elements (c3) ─────────────────────────────────────────────────

export interface SectionElementData extends BaseElementData {}

export interface ContainerElementData extends BaseElementData {}

export interface GridElementData extends BaseElementData {}

export interface ColumnElementData extends BaseElementData {}

export interface StackElementData extends BaseElementData {}

export interface DividerElementData extends BaseElementData {}

export interface SpacerElementData extends BaseElementData {}

// ── Textual Elements (c4) ────────────────────────────────────────────────────

export interface HeadingElementData extends BaseElementData {
  heading?: ContentHeading;
}

export interface ParagraphElementData extends BaseElementData {
  text?: ContentText;
}

export interface RichTextElementData extends BaseElementData {
  text?: ContentText;
}

export interface EyebrowElementData extends BaseElementData {
  text?: ContentText;
}

export interface QuoteElementData extends BaseElementData {
  text?: ContentText;
  author?: ContentAuthor;
}

export interface LabelElementData extends BaseElementData {
  text?: ContentText;
}

// ── Action Elements (c5) ─────────────────────────────────────────────────────

export interface ButtonElementData extends BaseElementData {
  cta?: ContentCta;
}

export interface LinkElementData extends BaseElementData {
  cta?: ContentCta;
}

export interface CtaGroupElementData extends BaseElementData {}

// ── Media Elements (c6) ──────────────────────────────────────────────────────

export interface ImageElementData extends BaseElementData {
  media?: ContentMedia;
}

export interface VideoElementData extends BaseElementData {
  media?: ContentMedia;
}

export interface IconElementData extends BaseElementData {
  media?: ContentMedia;
}

export interface GalleryItemElementData extends BaseElementData {
  media?: ContentMedia;
  text?: ContentText;
}

export interface LogoItemElementData extends BaseElementData {
  media?: ContentMedia;
}

// ── Informational Elements (c7) ──────────────────────────────────────────────

export interface BadgeElementData extends BaseElementData {
  badge?: ContentBadge;
}

export interface StatElementData extends BaseElementData {
  text?: ContentText;
}

export interface FeatureElementData extends BaseElementData {
  text?: ContentText;
  media?: ContentMedia;
}

export interface KeyValueElementData extends BaseElementData {
  text?: ContentText;
}

export interface TimelineItemElementData extends BaseElementData {
  text?: ContentText;
  date?: ContentDate;
}

export interface FaqItemElementData extends BaseElementData {
  text?: ContentText;
}

export interface TestimonialItemElementData extends BaseElementData {
  text?: ContentText;
  author?: ContentAuthor;
  media?: ContentMedia;
}

// ── Integration Elements (c9) ────────────────────────────────────────────────




/** @deprecated Pre-Block Grid wrapper-component architecture — do not use. */
export interface AngularHostElementData extends BaseElementData {
  mount?: MountConfig;
  async?: BehaviorAsync;
}

/** @deprecated Pre-Block Grid wrapper-component architecture — do not use. */
export interface MfHostElementData extends BaseElementData {
  mount?: MountConfig;
  async?: BehaviorAsync;
}

/** @deprecated Pre-Block Grid wrapper-component architecture — do not use. */
export interface MacroHostElementData extends BaseElementData {
  contentType?: string;
  contentData?: Record<string, unknown>;
}

// ── Corporate Elements (ca) ─────────────────────────────────────────────────

export interface TabGroupElementData extends BaseElementData {
  collection?: ContentCollection;
  text?: ContentText;
}

export interface AlertBarElementData extends BaseElementData {
  text?: ContentText;
  cta?: ContentCta;
}

export interface BannerSliderElementData extends BaseElementData {
  collection?: ContentCollection;
  text?: ContentText;
}

export interface NewsletterFormElementData extends BaseElementData {
  text?: ContentText;
  cta?: ContentCta;
  async?: BehaviorAsync;
}

export interface SocialShareElementData extends BaseElementData {
  collection?: ContentCollection;
}

export interface DataTableElementData extends BaseElementData {
  text?: ContentText;
  collection?: ContentCollection;
}

// ── Additional Elements (UI-aligned) ────────────────────────────────────────


export interface AccordionElementData extends BaseElementData {
  collection?: ContentCollection;
  text?: ContentText;
}

export interface AvatarElementData extends BaseElementData {
  media?: ContentMedia;
  text?: ContentText;
}

// ── Experience Elements (cx) ─────────────────────────────────────────────────

export interface FeatureJourneyElementData extends BaseElementData {
  text?: ContentText;
}

export interface InsightExplorerElementData extends BaseElementData {
  text?: ContentText;
  collection?: ContentCollection;
}

export interface MediaExplorerElementData extends BaseElementData {
  text?: ContentText;
  collection?: ContentCollection;
}





export interface CountdownClockElementData extends BaseElementData {
  text?: ContentText;
  date?: ContentDate;
}


// ── Element Registry ─────────────────────────────────────────────────────────

import registry from './element-registry.json';

export type ElementAlias = `${'element' | 'experience'}${string}`;
export type ElementTag = `synergos-${string}`;
export type ElementRegistryTier = 'module' | 'composition' | 'primitive' | 'experience';

export interface ElementRegistryEntry {
  name: string;
  alias: ElementAlias;
  tag: ElementTag;
  tier: ElementRegistryTier;
}

// ── Element Type Alias Registry (derived from element-registry.json) ────────

const typedRegistry = registry as readonly ElementRegistryEntry[];

export const ELEMENT_REGISTRY: readonly ElementRegistryEntry[] = typedRegistry;

export const ELEMENT_ALIASES = Object.freeze(
  Object.fromEntries(typedRegistry.map((entry) => [entry.alias, entry.tag])),
) as Readonly<Record<string, ElementTag>>;

export function resolveElementTag(alias: string): ElementTag | null {
  return ELEMENT_ALIASES[alias] ?? null;
}
