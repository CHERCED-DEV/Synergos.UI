import type { CartItem } from './shop.contract';

// Mirror: Synergos.CMS/Application/Cdn/Configs/*
//
// These interfaces define the exact `config` payload expected by web components
// when mounted from CMS content (macro RTE, Block Grid, LayoutComposer, or List).
//
// CONVENTIONS:
// • Every interface carries `translations` — a flat dict emitted by CMS with all
//   dictionary items relevant to that component. Components read labels from it
//   instead of hardcoding strings.
// • Experience elements (feature-journey, insight-explorer, etc.) receive only
//   structural config; they fetch their own data via internal APIs.
// • Collection items (faq-section, banner-slider, etc.) are fully server-assembled
//   by CMS resolvers — editors never write raw JSON.
// • Three-way mirror: CdnConfig (C#) ↔ element-config.contract.ts (TS) ↔ Web Component `config` prop.
//   All three MUST be kept in sync.

/** Flat dictionary of CMS dictionary items relevant to this component. */
export type ComponentTranslations = Record<string, string>;

// ---------------------------------------------------------------------------
// Module-tier configs (c8* — compositions with own layout and data)
// ---------------------------------------------------------------------------

/** Mirror of HeroCdnConfig. */
export interface HeroElementConfig {
  readonly headingText?: string;
  readonly headingLevel?: string;
  readonly body?: string;
  readonly imageSrc?: string;
  readonly imageAlt?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly ctaTarget?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of BannerCdnConfig. */
export interface BannerElementConfig {
  readonly eyebrow?: string;
  readonly title?: string;
  readonly body?: string;
  readonly imageSrc?: string;
  readonly imageAlt?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly ctaTarget?: string;
  readonly secondaryCtaLabel?: string;
  readonly secondaryCtaUrl?: string;
  readonly secondaryCtaTarget?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of BannerSliderCdnConfig — slide item shape. */
export interface BannerSliderSlideConfig {
  readonly imageSrc?: string;
  readonly imageAlt?: string;
  readonly title?: string;
  readonly body?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly ctaTarget?: string;
}

/** Mirror of BannerSliderCdnConfig. */
export interface BannerSliderElementConfig {
  readonly headingText?: string;
  readonly body?: string;
  readonly autoplay?: boolean;
  readonly loop?: boolean;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly slides?: ReadonlyArray<BannerSliderSlideConfig>;
  readonly translations?: ComponentTranslations;
}

/** Mirror of FaqSectionCdnConfig — item shape. */
export interface FaqSectionItemConfig {
  readonly question?: string;
  readonly answer?: string;
  readonly initiallyExpanded?: boolean;
}

/** Mirror of FaqSectionCdnConfig. */
export interface FaqSectionElementConfig {
  readonly headingText?: string;
  readonly theme?: string;
  readonly items?: ReadonlyArray<FaqSectionItemConfig>;
  readonly translations?: ComponentTranslations;
}

/** Mirror of FeatureGridCdnConfig — item shape. */
export interface FeatureGridItemConfig {
  readonly headingText?: string;
  readonly body?: string;
  readonly icon?: string;
}

/** Mirror of FeatureGridCdnConfig. */
export interface FeatureGridElementConfig {
  readonly headingText?: string;
  readonly columns?: number;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly items?: ReadonlyArray<FeatureGridItemConfig>;
  readonly translations?: ComponentTranslations;
}

/** Mirror of LogoCloudCdnConfig — item shape. */
export interface LogoCloudItemConfig {
  readonly src?: string;
  readonly alt?: string;
  readonly label?: string;
  readonly href?: string;
  readonly target?: string;
}

/** Mirror of LogoCloudCdnConfig. */
export interface LogoCloudElementConfig {
  readonly headingText?: string;
  readonly body?: string;
  readonly columns?: number;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly items?: ReadonlyArray<LogoCloudItemConfig>;
  readonly translations?: ComponentTranslations;
}

/** Mirror of TestimonialSectionCdnConfig — item shape. */
export interface TestimonialSectionItemConfig {
  readonly quote?: string;
  readonly name?: string;
  readonly role?: string;
  readonly avatarSrc?: string;
  readonly avatarAlt?: string;
}

/** Mirror of TestimonialSectionCdnConfig. */
export interface TestimonialSectionElementConfig {
  readonly headingText?: string;
  readonly theme?: string;
  readonly items?: ReadonlyArray<TestimonialSectionItemConfig>;
  readonly translations?: ComponentTranslations;
}

/** Mirror of TabGroupCdnConfig. */
export interface TabGroupElementConfig {
  readonly title?: string;
  readonly activeId?: string;
  readonly ariaLabel?: string;
  readonly tabs?: ReadonlyArray<{
    readonly id?: string;
    readonly label?: string;
    readonly content?: string;
    readonly disabled?: boolean;
  }>;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of DataTableCdnConfig. */
export interface DataTableElementConfig {
  readonly caption?: string;
  readonly emptyLabel?: string;
  readonly striped?: boolean;
  readonly bordered?: boolean;
  readonly hoverable?: boolean;
  readonly compact?: boolean;
  readonly columns?: ReadonlyArray<{
    readonly key?: string;
    readonly label?: string;
    readonly align?: 'left' | 'center' | 'right';
    readonly sortable?: boolean;
    readonly width?: string;
  }>;
  readonly headers?: ReadonlyArray<string>;
  readonly rows?: ReadonlyArray<ReadonlyArray<string>> | ReadonlyArray<Record<string, unknown>>;
  readonly translations?: ComponentTranslations;
}

/** Mirror of SectionCdnConfig. */
export interface SectionElementConfig {
  readonly headingText?: string;
  readonly headingLevel?: string;
  readonly containerType?: string;
  readonly alignment?: string;
  readonly direction?: string;
  readonly margin?: string;
  readonly padding?: string;
  readonly gap?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of CardCdnConfig. */
export interface CardElementConfig {
  readonly title?: string;
  readonly subtitle?: string;
  readonly body?: string;
  readonly imageSrc?: string;
  readonly imageAlt?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly badgeText?: string;
  readonly badgeType?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of MediaTextCdnConfig. */
export interface MediaTextElementConfig {
  readonly imageSrc?: string;
  readonly imageAlt?: string;
  readonly headingText?: string;
  readonly body?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly ctaTarget?: string;
  readonly mediaPosition?: 'left' | 'right';
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of AlertBarCdnConfig. */
export interface AlertBarElementConfig {
  readonly title?: string;
  readonly description?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly dismissible?: boolean;
  readonly translations?: ComponentTranslations;
}

/** Mirror of ButtonGroupCdnConfig — item shape. */
export interface ButtonGroupItemConfig {
  readonly label?: string;
  readonly href?: string;
  readonly target?: string;
  readonly variant?: 'solid' | 'outline' | 'ghost';
  readonly size?: 'sm' | 'md' | 'lg';
  readonly disabled?: boolean;
}

/** Mirror of ButtonGroupCdnConfig. */
export interface ButtonGroupElementConfig {
  readonly alignment?: 'left' | 'center' | 'right';
  readonly direction?: 'row' | 'column';
  readonly gap?: 'xs' | 'sm' | 'md' | 'lg';
  readonly items?: ReadonlyArray<ButtonGroupItemConfig>;
  readonly translations?: ComponentTranslations;
}

/** Mirror of CtaGroupCdnConfig. */
export interface CtaGroupElementConfig {
  readonly primaryLabel?: string;
  readonly primaryUrl?: string;
  readonly primaryTarget?: string;
  readonly primaryVariant?: string;
  readonly secondaryLabel?: string;
  readonly secondaryUrl?: string;
  readonly secondaryTarget?: string;
  readonly secondaryVariant?: string;
  readonly alignment?: string;
  readonly translations?: ComponentTranslations;
}

// ---------------------------------------------------------------------------
// Composition-tier configs (c8* / ca* — atomic compositions)
// ---------------------------------------------------------------------------

/** Mirror of FaqItemCdnConfig. */
export interface FaqItemElementConfig {
  readonly question?: string;
  readonly answer?: string;
  readonly initiallyExpanded?: boolean;
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of FeatureItemCdnConfig. */
export interface FeatureItemElementConfig {
  readonly headingText?: string;
  readonly body?: string;
  readonly icon?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of GalleryItemCdnConfig. */
export interface GalleryItemElementConfig {
  readonly src?: string;
  readonly alt?: string;
  readonly caption?: string;
  readonly aspectRatio?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of IframeEmbedCdnConfig. */
export interface IframeEmbedElementConfig {
  readonly src?: string;
  readonly title?: string;
  readonly height?: string;
  readonly allowFullscreen?: boolean;
  readonly translations?: ComponentTranslations;
}

/** Mirror of InfoBlockCdnConfig. */
export interface InfoBlockElementConfig {
  readonly title?: string;
  readonly body?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of KeyValueCdnConfig. */
export interface KeyValueElementConfig {
  readonly label?: string;
  readonly value?: string;
  readonly helpText?: string;
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of LogoItemCdnConfig. */
export interface LogoItemElementConfig {
  readonly src?: string;
  readonly alt?: string;
  readonly href?: string;
  readonly label?: string;
  readonly target?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of NewsletterFormCdnConfig. */
export interface NewsletterFormElementConfig {
  readonly title?: string;
  readonly intro?: string;
  readonly placeholder?: string;
  readonly submitLabel?: string;
  readonly consentText?: string;
  readonly successMessage?: string;
  readonly errorMessage?: string;
  readonly actionUrl?: string;
  readonly method?: string;
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of SocialShareCdnConfig — link shape. */
export interface SocialShareLinkConfig {
  readonly label?: string;
  readonly href?: string;
  readonly iconSymbol?: string;
  readonly target?: string;
}

/** Mirror of SocialShareCdnConfig. */
export interface SocialShareElementConfig {
  readonly title?: string;
  readonly pageUrl?: string;
  readonly layout?: 'row' | 'stack';
  readonly links?: ReadonlyArray<SocialShareLinkConfig>;
  readonly translations?: ComponentTranslations;
}

/** Mirror of TestimonialItemCdnConfig. */
export interface TestimonialItemElementConfig {
  readonly quote?: string;
  readonly name?: string;
  readonly role?: string;
  readonly avatarSrc?: string;
  readonly avatarAlt?: string;
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of TimelineItemCdnConfig. */
export interface TimelineItemElementConfig {
  readonly headingText?: string;
  readonly body?: string;
  readonly date?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of ExternalWidgetCdnConfig. */
export interface ExternalWidgetElementConfig {
  readonly src?: string;
  readonly type?: string;
  readonly title?: string;
  readonly endpoint?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of StatCdnConfig. */
export interface StatElementConfig {
  readonly value?: string;
  readonly label?: string;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of PricingCardCdnConfig. */
export interface PricingCardElementConfig {
  readonly title?: string;
  readonly price?: string;
  readonly period?: string;
  readonly description?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly badgeText?: string;
  readonly badgeTone?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly featured?: boolean;
  readonly translations?: ComponentTranslations;
}

// ---------------------------------------------------------------------------
// Primitive-tier configs (c3*–c7* — structural and atomic)
// ---------------------------------------------------------------------------

/** Mirror of BadgeCdnConfig. */
export interface BadgeElementConfig {
  readonly text?: string;
  readonly tone?: string;
  readonly ariaLabel?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of ButtonContainerCdnConfig. */
export interface ButtonContainerElementConfig {
  readonly label?: string;
  readonly href?: string;
  readonly target?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly size?: string;
  readonly disabled?: boolean;
  /**
   * Async work in flight: the button blocks the press and announces itself busy.
   *
   * Only honoured when the control renders as a BUTTON. In the `href` branch it is
   * ignored on purpose — a link navigates, it does not perform an action in place,
   * and the busy text would fold into the surrounding anchor's accessible name
   * ("Guardar Cargando"), which is worse than having no loading state at all.
   */
  readonly loading?: boolean;
  /** Short text announced while `loading`. Keep it brief: it is clipped, not wrapped. */
  readonly loadingLabel?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of ColumnCdnConfig. */
export interface ColumnElementConfig {
  readonly width?: string;
  readonly minWidth?: string;
  readonly alignment?: string;
  readonly padding?: string;
  readonly gap?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of ContainerBlockCdnConfig. */
export interface ContainerBlockElementConfig {
  readonly elementId?: string;
  readonly ariaLabel?: string;
  readonly containerType?: string;
  readonly maxWidth?: string;
  readonly padding?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of DividerCdnConfig. */
export interface DividerElementConfig {
  readonly orientation?: string;
  readonly inset?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of GridCdnConfig. */
export interface GridElementConfig {
  readonly columns?: number;
  readonly gap?: string;
  readonly minColumnWidth?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of IconBlockCdnConfig. */
export interface IconBlockElementConfig {
  readonly icon?: string;
  readonly size?: string;
  readonly color?: string;
  readonly ariaLabel?: string;
  readonly ariaHidden?: boolean;
  readonly translations?: ComponentTranslations;
}

/** Mirror of ImageBlockCdnConfig. */
export interface ImageBlockElementConfig {
  readonly src?: string;
  readonly alt?: string;
  readonly caption?: string;
  readonly aspectRatio?: string;
  readonly loading?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of LinkBlockCdnConfig. */
export interface LinkBlockElementConfig {
  readonly href?: string;
  readonly label?: string;
  readonly target?: string;
  readonly ariaLabel?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly translations?: ComponentTranslations;
}

/** Mirror of SpacerCdnConfig. */
export interface SpacerElementConfig {
  readonly size?: string;
  readonly axis?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of StackCdnConfig. */
export interface StackElementConfig {
  readonly direction?: string;
  readonly gap?: string;
  readonly alignment?: string;
  readonly justify?: string;
  readonly wrap?: boolean;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of TextBlockCdnConfig. */
export interface TextBlockElementConfig {
  readonly headingText?: string;
  readonly headingLevel?: string;
  readonly body?: string;
  readonly alignment?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly theme?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of VideoBlockCdnConfig. */
export interface VideoBlockElementConfig {
  readonly src?: string;
  readonly title?: string;
  readonly poster?: string;
  readonly controls?: boolean;
  readonly autoplay?: boolean;
  readonly muted?: boolean;
  readonly loop?: boolean;
  readonly translations?: ComponentTranslations;
}

/** Mirror of ScriptEmbedCdnConfig. */
export interface ScriptEmbedElementConfig {
  readonly scriptType?: string;
  readonly content?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of AvatarCdnConfig. */
export interface AvatarElementConfig {
  readonly src?: string;
  readonly alt?: string;
  readonly name?: string;
  readonly size?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly translations?: ComponentTranslations;
}

// ---------------------------------------------------------------------------
// Experience-tier configs (ce* — stateful experiences, load own data)
// Structural config only — data fetched via internal APIs by the component.
// ---------------------------------------------------------------------------

/** Mirror of FeatureJourneyCdnConfig. */
export interface FeatureJourneyElementConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly elementId?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of InsightExplorerCdnConfig. */
export interface InsightExplorerElementConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly elementId?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of MediaExplorerCdnConfig. */
export interface MediaExplorerElementConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly elementId?: string;
  readonly defaultCategory?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of ContentCarouselCdnConfig. */
export interface ContentCarouselElementConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly elementId?: string;
  readonly autoplay?: boolean;
  readonly interval?: number;
  readonly translations?: ComponentTranslations;
}

/** Mirror of QuizFlowCdnConfig. */
export interface QuizFlowElementConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly elementId?: string;
  readonly submitLabel?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of FilterBoardCdnConfig. */
export interface FilterBoardElementConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly elementId?: string;
  readonly defaultFilter?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of RatingWidgetCdnConfig. */
export interface RatingWidgetElementConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly elementId?: string;
  readonly maxRating?: number;
  readonly translations?: ComponentTranslations;
}

/** Mirror of CountdownClockCdnConfig. */
export interface CountdownClockElementConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly elementId?: string;
  readonly targetDate?: string;
  readonly expiredText?: string;
  readonly translations?: ComponentTranslations;
}

/** Mirror of NotificationStackCdnConfig. */
export interface NotificationStackElementConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly tone?: string; // runtime compatibility alias
  readonly elementId?: string;
  readonly maxItems?: number;
  readonly translations?: ComponentTranslations;
}

// ---------------------------------------------------------------------------
// ELEMENT_CONFIG_FIELDS
// Scalar fields per element type (string | boolean | number — not nested JSON).
// Used by macro param readers and config attribute builders.
// ---------------------------------------------------------------------------

export const ELEMENT_CONFIG_FIELDS = {
  // Structural
  section:            ['variant', 'theme'],
  column:             ['variant', 'theme'],
  grid:               ['variant', 'theme'],
  stack:              ['variant', 'theme'],
  divider:            ['variant', 'theme'],
  spacer:             [],
  'container-block':  ['elementId', 'ariaLabel', 'variant', 'theme'],
  // Primitives
  badge:              ['text', 'tone', 'ariaLabel'],
  'button-container': ['label', 'href', 'target'],
  'icon-block':       ['ariaLabel'],
  'image-block':      ['src', 'alt'],
  'link-block':       ['href', 'label', 'target', 'ariaLabel'],
  'text-block':       ['headingText', 'headingLevel', 'variant', 'theme'],
  'video-block':      ['src', 'title'],
  avatar:             ['src', 'alt', 'name', 'size', 'variant'],
  stat:               ['value', 'label', 'prefix', 'suffix', 'variant', 'theme'],
  // Compositions
  card:               ['title', 'subtitle', 'body', 'imageSrc', 'imageAlt', 'ctaLabel', 'ctaUrl', 'badgeText', 'badgeType', 'variant', 'theme'],
  'media-text':       ['imageSrc', 'imageAlt', 'headingText', 'body', 'ctaLabel', 'ctaUrl', 'ctaTarget', 'mediaPosition', 'variant', 'theme'],
  'info-block':       ['title', 'body', 'ctaLabel', 'ctaUrl', 'variant', 'theme'],
  'cta-group':        ['primaryLabel', 'primaryUrl', 'primaryTarget', 'primaryVariant', 'secondaryLabel', 'secondaryUrl', 'secondaryTarget', 'secondaryVariant', 'alignment'],
  'key-value':        ['label', 'value', 'helpText', 'theme'],
  'timeline-item':    ['headingText', 'body', 'date', 'variant', 'theme'],
  'faq-item':         ['question', 'answer', 'initiallyExpanded', 'theme'],
  'feature-item':     ['headingText', 'body', 'icon', 'variant', 'theme'],
  'testimonial-item': ['quote', 'name', 'role', 'avatarSrc', 'avatarAlt', 'theme'],
  'gallery-item':     ['src', 'alt', 'caption'],
  'logo-item':        ['src', 'alt', 'href', 'label', 'target'],
  'pricing-card':     ['title', 'price', 'period', 'description', 'ctaLabel', 'ctaUrl', 'badgeText', 'badgeTone', 'variant', 'theme', 'featured'],
  // Modules
  hero:               ['headingText', 'headingLevel', 'body', 'imageSrc', 'imageAlt', 'ctaLabel', 'ctaUrl', 'ctaTarget', 'variant', 'theme'],
  banner:             ['title', 'body', 'ctaLabel', 'ctaUrl', 'ctaTarget', 'variant', 'theme'],
  'banner-slider':    ['headingText', 'body', 'variant', 'theme'],
  'faq-section':      ['headingText', 'theme'],
  'feature-grid':     ['headingText', 'variant', 'theme'],
  'logo-cloud':       ['headingText', 'body', 'variant', 'theme'],
  'testimonial-section': ['headingText', 'theme'],
  'tab-group':        ['title', 'ariaLabel', 'variant', 'theme'],
  'data-table':       ['caption'],
  'alert-bar':        ['title', 'description', 'ctaLabel', 'ctaUrl', 'variant', 'tone', 'theme', 'dismissible'],
  'button-group':     ['alignment', 'direction', 'gap'],
  'newsletter-form':  ['title', 'intro', 'placeholder', 'submitLabel', 'consentText', 'successMessage', 'errorMessage', 'actionUrl', 'method', 'theme'],
  'social-share':     ['title', 'pageUrl', 'layout'],
  'iframe-embed':     ['src', 'title', 'height', 'allowFullscreen'],
  'external-widget':  ['src', 'type', 'title', 'endpoint'],
  'script-embed':     ['scriptType', 'content'],
  // Experiences — structural config only, no item arrays
  'feature-journey':      ['title', 'theme', 'variant', 'elementId'],
  'insight-explorer':     ['title', 'theme', 'variant', 'elementId'],
  'media-explorer':       ['title', 'theme', 'variant', 'elementId', 'defaultCategory'],
  'content-carousel':     ['title', 'theme', 'variant', 'elementId', 'autoplay', 'interval'],
  'quiz-flow':            ['title', 'theme', 'variant', 'elementId', 'submitLabel'],
  'filter-board':         ['title', 'theme', 'variant', 'elementId', 'defaultFilter'],
  'rating-widget':        ['title', 'theme', 'variant', 'elementId', 'maxRating'],
  'countdown-clock':      ['title', 'theme', 'variant', 'elementId', 'targetDate', 'expiredText'],
  'notification-stack':   ['title', 'theme', 'variant', 'elementId', 'maxItems'],
  // Shop — e-commerce components (cf000001–cf000008)
  'product-card':         ['productSku', 'productUrlTemplate', 'name', 'imageSrc', 'imageAlt', 'showPrice', 'showBadge', 'layout', 'cardLayout', 'theme', 'variant', 'variantKey'],
  'product-grid':         ['headingText', 'categoryAlias', 'categoryFilter', 'productUrlTemplate', 'maxItems', 'columns', 'showFilters', 'sortOrder', 'sortBy', 'layout', 'theme', 'variant', 'variantKey'],
  'product-detail':       ['productSku', 'showVariantPicker', 'showQuantitySelector', 'showRating', 'showReviews', 'showRelated', 'layout', 'theme', 'variant', 'variantKey'],
  'cart-summary':         ['title', 'summaryTitle', 'showCoupon', 'checkoutUrl', 'checkoutEndpoint', 'continueShoppingUrl', 'showShipping', 'showTax', 'theme', 'variant', 'variantKey'],
  'cart-item':            ['item', 'productSku', 'quantity', 'unitPrice', 'updateEndpoint', 'theme', 'variant', 'variantKey'],
  'price-display':        ['showOriginalPrice', 'showDiscount', 'priceSize', 'currency', 'theme', 'variant'],
  'quantity-selector':    ['label', 'min', 'minQty', 'max', 'maxQty', 'step', 'value', 'initialQty', 'theme', 'variant', 'variantKey'],
  'variant-picker':       ['label', 'selectedValue', 'variantType', 'displayAs', 'variantsJson', 'theme', 'variant', 'variantKey'],
} as const satisfies Record<string, readonly string[]>;

// ---------------------------------------------------------------------------
// ELEMENT_CONFIG_JSON_FIELDS
// Fields that carry serialized JSON (parsed by the config bridge before binding).
// `translations` is always JSON — a flat Record<string, string> from the CMS
// dictionary, emitted for every element type via its macro/resolver.
// ---------------------------------------------------------------------------

export const ELEMENT_CONFIG_JSON_FIELDS = {
  // Collections — server-assembled arrays
  'banner-slider':        ['slides', 'translations'],
  'button-group':         ['items', 'translations'],
  'data-table':           ['headers', 'rows', 'translations'],
  'faq-section':          ['items', 'translations'],
  'feature-grid':         ['items', 'translations'],
  'logo-cloud':           ['items', 'translations'],
  'social-share':         ['links', 'translations'],
  'testimonial-section':  ['items', 'translations'],
  // All remaining — translations only
  section:                ['translations'],
  column:                 ['translations'],
  grid:                   ['translations'],
  stack:                  ['translations'],
  divider:                ['translations'],
  spacer:                 ['translations'],
  'container-block':      ['translations'],
  badge:                  ['translations'],
  'button-container':     ['translations'],
  'icon-block':           ['translations'],
  'image-block':          ['translations'],
  'link-block':           ['translations'],
  'text-block':           ['translations'],
  'video-block':          ['translations'],
  avatar:                 ['translations'],
  stat:                   ['translations'],
  card:                   ['translations'],
  'media-text':           ['translations'],
  'info-block':           ['translations'],
  'cta-group':            ['translations'],
  'key-value':            ['translations'],
  'timeline-item':        ['translations'],
  'faq-item':             ['translations'],
  'feature-item':         ['translations'],
  'testimonial-item':     ['translations'],
  'gallery-item':         ['translations'],
  'logo-item':            ['translations'],
  'pricing-card':         ['translations'],
  hero:                   ['translations'],
  banner:                 ['translations'],
  'tab-group':            ['translations'],
  'alert-bar':            ['translations'],
  'newsletter-form':      ['translations'],
  'iframe-embed':         ['translations'],
  'external-widget':      ['translations'],
  'script-embed':         ['translations'],
  'feature-journey':      ['translations'],
  'insight-explorer':     ['translations'],
  'media-explorer':       ['translations'],
  'content-carousel':     ['translations'],
  'quiz-flow':            ['translations'],
  'filter-board':         ['translations'],
  'rating-widget':        ['translations'],
  'countdown-clock':      ['translations'],
  'notification-stack':   ['translations'],
  // Shop
  'product-card':         ['translations'],
  'product-grid':         ['translations'],
  'product-detail':       ['translations'],
  'cart-summary':         ['translations'],
  'cart-item':            ['translations'],
  'price-display':        ['translations'],
  'quantity-selector':    ['translations'],
  'variant-picker':       ['translations'],
} as const satisfies Record<string, readonly string[]>;

// ---------------------------------------------------------------------------
// Shop-tier configs (cf000001–cf000008 — e-commerce components)
// Three-way mirror: ShopCdnConfigs.cs ↔ here ↔ synergos-product-card etc.
// ---------------------------------------------------------------------------

/** Mirror of ProductCardCdnConfig. SKU fetched from /api/shop/products/sku/{sku} at runtime. */
export interface ProductCardElementConfig {
  readonly productSku?:    string;
  readonly productUrlTemplate?: string; // e.g. '/products/{slug}' or '/shop/{sku}'
  readonly name?:          string;    // editorial override — API name used if null
  readonly imageSrc?:      string;    // editorial override
  readonly imageAlt?:      string;
  readonly showPrice?:     boolean;
  readonly showBadge?:     boolean;
  readonly layout?:        'vertical' | 'horizontal';
  readonly cardLayout?:    'standard' | 'vertical' | 'horizontal'; // CMS Web compatibility alias
  readonly theme?:         string;
  readonly variant?:       string;
  readonly variantKey?:    string; // CMS Web compatibility alias
  readonly translations?:  ComponentTranslations;
}

/** Mirror of ProductGridCdnConfig. Fetches products from /api/shop/products?category={alias}. */
export interface ProductGridElementConfig {
  readonly headingText?:   string;
  readonly categoryAlias?: string;
  readonly categoryFilter?: string; // CMS Web compatibility alias
  readonly productUrlTemplate?: string; // e.g. '/products/{slug}' or '/shop/{sku}'
  readonly maxItems?:      number;
  readonly columns?:       2 | 3 | 4;
  readonly showFilters?:   boolean;
  readonly sortOrder?:     'relevance' | 'newest' | 'price-asc' | 'price-desc';
  readonly sortBy?:        'name' | 'relevance' | 'newest' | 'price-asc' | 'price-desc'; // CMS Web compatibility alias
  readonly layout?:        'grid' | 'list'; // CMS Web compatibility alias
  readonly theme?:         string;
  readonly variant?:       string;
  readonly variantKey?:    string; // CMS Web compatibility alias
  readonly translations?:  ComponentTranslations;
}

/** Mirror of ProductDetailCdnConfig. Full product data fetched from API. */
export interface ProductDetailElementConfig {
  readonly productSku?:             string;
  readonly showVariantPicker?:      boolean;
  readonly showQuantitySelector?:   boolean;
  readonly showRating?:             boolean;
  readonly showReviews?:            boolean; // CMS Web compatibility alias
  readonly showRelated?:            boolean; // CMS Web compatibility alias
  readonly layout?:                 'imageLeft' | 'imageRight' | 'imageTop';
  readonly theme?:                  string;
  readonly variant?:                string;
  readonly variantKey?:             string; // CMS Web compatibility alias
  readonly translations?:           ComponentTranslations;
}

/** Mirror of CartSummaryCdnConfig. Cart state managed client-side via cart.store.ts. */
export interface CartSummaryElementConfig {
  readonly title?:                  string;
  readonly summaryTitle?:           string; // CMS Web compatibility alias
  readonly showCoupon?:             boolean;
  readonly checkoutUrl?:            string;
  readonly checkoutEndpoint?:       string; // CMS Web compatibility alias
  readonly continueShoppingUrl?:    string;
  readonly showShipping?:           boolean; // CMS Web compatibility alias
  readonly showTax?:                boolean; // CMS Web compatibility alias
  readonly theme?:                  string;
  readonly variant?:                string;
  readonly variantKey?:             string; // CMS Web compatibility alias
  readonly translations?:           ComponentTranslations;
}

/** Mirror of CartItemCdnConfig. Rendered internally by CartSummary. */
export interface CartItemElementConfig {
  readonly item?:                   CartItem;
  readonly productSku?:             string; // CMS Web compatibility alias
  readonly quantity?:               number; // CMS Web compatibility alias
  readonly unitPrice?:              string; // CMS Web compatibility alias
  readonly updateEndpoint?:         string; // CMS Web compatibility alias
  readonly theme?:                  string;
  readonly variant?:                string;
  readonly variantKey?:             string; // CMS Web compatibility alias
  readonly translations?:           ComponentTranslations;
}

/** Mirror of PriceDisplayCdnConfig. */
export interface PriceDisplayElementConfig {
  readonly showOriginalPrice?:      boolean;
  readonly showDiscount?:           boolean;
  readonly priceSize?:              'sm' | 'md' | 'lg';
  readonly currency?:               string;
  readonly theme?:                  string;
  readonly variant?:                string;
  readonly translations?:           ComponentTranslations;
}

/** Mirror of QuantitySelectorCdnConfig. */
export interface QuantitySelectorElementConfig {
  readonly label?:                  string;
  readonly min?:                    number;
  readonly minQty?:                 number; // CMS Web compatibility alias
  readonly max?:                    number;
  readonly maxQty?:                 number; // CMS Web compatibility alias
  readonly step?:                   number;
  readonly value?:                  number;
  readonly initialQty?:             number; // CMS Web compatibility alias
  readonly theme?:                  string;
  readonly variant?:                string;
  readonly variantKey?:             string; // CMS Web compatibility alias
  readonly translations?:           ComponentTranslations;
}

/** Mirror of VariantPickerCdnConfig. */
export interface VariantPickerElementConfig {
  readonly label?:                  string;
  readonly selectedValue?:          string;
  readonly variantType?:            'color' | 'size' | 'storage' | 'custom';
  readonly displayAs?:              'buttons' | 'swatches' | 'dropdown';
  readonly variantsJson?:           string; // CMS Web compatibility alias
  readonly theme?:                  string;
  readonly variant?:                string;
  readonly variantKey?:             string; // CMS Web compatibility alias
  readonly translations?:           ComponentTranslations;
}

// ---------------------------------------------------------------------------
// Host-tier configs (mounting points for external code: angular apps,
// macros, micro-frontends). These hosts NO tienen schema CMS uSync
// equivalente — son técnicos, configurados via window.synergos bridge
// o props directos. Mirror runtime config consumed by *-host components.
// ---------------------------------------------------------------------------

/** Mounts a self-contained Angular app at runtime via dynamic component. */
export interface AngularHostElementConfig {
  readonly component?:    string;
  readonly endpoint?:     string;
  readonly params?:       Record<string, string>;
}

/** Renders a CMS macro / partial via internal API. */
export interface MacroHostElementConfig {
  readonly contentType?:  string;
  readonly contentData?:  Record<string, unknown>;
}

/** Mounts a Module Federation remote module. */
export interface MfHostElementConfig {
  readonly exposedModule?: string;
  readonly endpoint?:      string;
  readonly remoteEntry?:   string;
  readonly params?:        Record<string, string>;
}

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

/** Maps each element type key to its config interface. */
export type ElementConfigMap = {
  // Structural
  'section':              SectionElementConfig;
  'column':               ColumnElementConfig;
  'grid':                 GridElementConfig;
  'stack':                StackElementConfig;
  'divider':              DividerElementConfig;
  'spacer':               SpacerElementConfig;
  'container-block':      ContainerBlockElementConfig;
  // Primitives
  'badge':                BadgeElementConfig;
  'button-container':     ButtonContainerElementConfig;
  'icon-block':           IconBlockElementConfig;
  'image-block':          ImageBlockElementConfig;
  'link-block':           LinkBlockElementConfig;
  'text-block':           TextBlockElementConfig;
  'video-block':          VideoBlockElementConfig;
  'avatar':               AvatarElementConfig;
  'stat':                 StatElementConfig;
  // Compositions
  'card':                 CardElementConfig;
  'media-text':           MediaTextElementConfig;
  'info-block':           InfoBlockElementConfig;
  'cta-group':            CtaGroupElementConfig;
  'key-value':            KeyValueElementConfig;
  'timeline-item':        TimelineItemElementConfig;
  'faq-item':             FaqItemElementConfig;
  'feature-item':         FeatureItemElementConfig;
  'testimonial-item':     TestimonialItemElementConfig;
  'gallery-item':         GalleryItemElementConfig;
  'logo-item':            LogoItemElementConfig;
  'pricing-card':         PricingCardElementConfig;
  // Modules
  'hero':                 HeroElementConfig;
  'banner':               BannerElementConfig;
  'banner-slider':        BannerSliderElementConfig;
  'faq-section':          FaqSectionElementConfig;
  'feature-grid':         FeatureGridElementConfig;
  'logo-cloud':           LogoCloudElementConfig;
  'testimonial-section':  TestimonialSectionElementConfig;
  'tab-group':            TabGroupElementConfig;
  'data-table':           DataTableElementConfig;
  'alert-bar':            AlertBarElementConfig;
  'button-group':         ButtonGroupElementConfig;
  'newsletter-form':      NewsletterFormElementConfig;
  'social-share':         SocialShareElementConfig;
  'iframe-embed':         IframeEmbedElementConfig;
  'external-widget':      ExternalWidgetElementConfig;
  'script-embed':         ScriptEmbedElementConfig;
  // Experiences
  'feature-journey':      FeatureJourneyElementConfig;
  'insight-explorer':     InsightExplorerElementConfig;
  'media-explorer':       MediaExplorerElementConfig;
  'content-carousel':     ContentCarouselElementConfig;
  'quiz-flow':            QuizFlowElementConfig;
  'filter-board':         FilterBoardElementConfig;
  'rating-widget':        RatingWidgetElementConfig;
  'countdown-clock':      CountdownClockElementConfig;
  'notification-stack':   NotificationStackElementConfig;
  // Shop (cf000001–cf000008)
  'product-card':         ProductCardElementConfig;
  'product-grid':         ProductGridElementConfig;
  'product-detail':       ProductDetailElementConfig;
  'cart-summary':         CartSummaryElementConfig;
  'cart-item':            CartItemElementConfig;
  'price-display':        PriceDisplayElementConfig;
  'quantity-selector':    QuantitySelectorElementConfig;
  'variant-picker':       VariantPickerElementConfig;
};

/** All valid element type keys. */
export type ElementType = keyof ElementConfigMap;

/** Union of all element config shapes. */
export type AnyElementConfig = ElementConfigMap[ElementType];

/** Element types whose config carries a server-assembled items/slides collection. */
export type CollectionElementType =
  | 'banner-slider'
  | 'button-group'
  | 'data-table'
  | 'faq-section'
  | 'feature-grid'
  | 'logo-cloud'
  | 'social-share'
  | 'testimonial-section';

/** Union of collection element config shapes. */
export type CollectionElementConfig = ElementConfigMap[CollectionElementType];

