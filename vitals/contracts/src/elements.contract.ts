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
  text?: ContentText;
  cta?: ContentCta;
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

export interface LogoCloudElementData extends BaseElementData {
  collection?: ContentCollection;
  text?: ContentText;
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

export interface ScriptEmbedElementData extends BaseElementData {
  embed?: ContentEmbed;
}

export interface IframeEmbedElementData extends BaseElementData {
  embed?: ContentEmbed;
}

export interface ExternalWidgetElementData extends BaseElementData {
  embed?: ContentEmbed;
}

export interface AngularHostElementData extends BaseElementData {}

export interface MfHostElementData extends BaseElementData {}

export interface MacroHostElementData extends BaseElementData {
  contentType?: string;
  contentData?: Record<string, unknown>;
}

// ── Element Registry ─────────────────────────────────────────────────────────

import registry from './element-registry.json';

export { registry as ELEMENT_REGISTRY };

export interface ElementRegistryEntry {
  name: string;
  alias: string;
  tag: string;
  tier: 'module' | 'composition' | 'primitive';
}

// ── Element Type Alias Registry (derived from element-registry.json) ────────

export const ELEMENT_ALIASES = Object.fromEntries(
  registry.map((entry: ElementRegistryEntry) => [entry.alias, entry.tag]),
) as Record<string, string>;

export type ElementAlias = string;
export type ElementTag = string;
