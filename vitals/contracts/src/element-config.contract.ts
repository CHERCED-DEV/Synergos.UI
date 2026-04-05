// Mirror: Synergos.CMS/Application/Rendering/Content/Resolvers/*
//
// These interfaces define the exact `config` payload expected by Angular
// elements and experiences when they are mounted from CMS content resolvers.

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
  readonly theme?: string;
}

export interface BannerElementConfig {
  readonly title?: string;
  readonly body?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly ctaTarget?: string;
  readonly variant?: string;
  readonly theme?: string;
}

export interface BannerSliderElementConfig {
  readonly headingText?: string;
  readonly body?: string;
  readonly variant?: string;
  readonly theme?: string;
  readonly slides?: ReadonlyArray<{
    readonly imageSrc?: string;
    readonly imageAlt?: string;
    readonly title?: string;
    readonly body?: string;
    readonly ctaLabel?: string;
    readonly ctaUrl?: string;
    readonly ctaTarget?: string;
  }>;
}

export interface FaqSectionElementConfig {
  readonly headingText?: string;
  readonly theme?: string;
  readonly items?: ReadonlyArray<{
    readonly question?: string;
    readonly answer?: string;
    readonly initiallyExpanded?: boolean;
  }>;
}

export interface FeatureGridElementConfig {
  readonly headingText?: string;
  readonly variant?: string;
  readonly theme?: string;
  readonly items?: ReadonlyArray<{
    readonly headingText?: string;
    readonly body?: string;
    readonly icon?: string;
  }>;
}

export interface LogoCloudElementConfig {
  readonly headingText?: string;
  readonly body?: string;
  readonly variant?: string;
  readonly theme?: string;
  readonly items?: ReadonlyArray<{
    readonly src?: string;
    readonly alt?: string;
    readonly label?: string;
    readonly href?: string;
    readonly target?: string;
  }>;
}

export interface TestimonialSectionElementConfig {
  readonly headingText?: string;
  readonly theme?: string;
  readonly items?: ReadonlyArray<{
    readonly quote?: string;
    readonly name?: string;
    readonly role?: string;
    readonly avatarSrc?: string;
    readonly avatarAlt?: string;
  }>;
}

export interface TabGroupElementConfig {
  readonly title?: string;
  readonly ariaLabel?: string;
  readonly variant?: string;
  readonly theme?: string;
}

export interface DataTableElementConfig {
  readonly caption?: string;
  readonly headers?: ReadonlyArray<string>;
  readonly rows?: ReadonlyArray<ReadonlyArray<string>>;
}

export interface SectionElementConfig {
  readonly variant?: string;
  readonly theme?: string;
}

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
  readonly theme?: string;
}

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
  readonly theme?: string;
}

export interface AlertBarElementConfig {
  readonly title?: string;
  readonly description?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly variant?: string;
  readonly theme?: string;
  readonly dismissible?: boolean;
}

export interface ButtonGroupElementConfig {
  readonly alignment?: 'left' | 'center' | 'right';
  readonly direction?: 'row' | 'column';
  readonly gap?: 'xs' | 'sm' | 'md' | 'lg';
  readonly items?: ReadonlyArray<{
    readonly label?: string;
    readonly href?: string;
    readonly target?: string;
    readonly variant?: 'solid' | 'outline' | 'ghost';
    readonly size?: 'sm' | 'md' | 'lg';
    readonly disabled?: boolean;
  }>;
}

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
}

export interface FaqItemElementConfig {
  readonly question?: string;
  readonly answer?: string;
  readonly theme?: string;
  // UI-only — no viene del CMS:
  // readonly initiallyExpanded?: boolean;
}

export interface FeatureItemElementConfig {
  readonly headingText?: string;
  readonly body?: string;
  readonly icon?: string;
  readonly variant?: string;
  readonly theme?: string;
}

export interface GalleryItemElementConfig {
  readonly src?: string;
  readonly alt?: string;
  readonly caption?: string;
}

export interface IframeEmbedElementConfig {
  readonly src?: string;
  readonly title?: string;
  readonly height?: string;
  readonly allowFullscreen?: boolean;
}

export interface InfoBlockElementConfig {
  readonly title?: string;
  readonly body?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly variant?: string;
  readonly theme?: string;
}

export interface KeyValueElementConfig {
  readonly label?: string;
  readonly value?: string;
  readonly helpText?: string;
  readonly theme?: string;
}

export interface LogoItemElementConfig {
  readonly src?: string;
  readonly alt?: string;
  readonly href?: string;
  readonly label?: string;
  readonly target?: string;
}

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
}

export interface SocialShareElementConfig {
  readonly title?: string;
  readonly pageUrl?: string;
  readonly layout?: 'row' | 'stack';
  readonly links?: ReadonlyArray<{
    readonly label?: string;
    readonly href?: string;
    readonly iconSymbol?: string;
    readonly target?: string;
  }>;
}

export interface TestimonialItemElementConfig {
  readonly quote?: string;
  readonly name?: string;
  readonly role?: string;
  readonly avatarSrc?: string;
  readonly avatarAlt?: string;
  readonly theme?: string;
}

export interface TimelineItemElementConfig {
  readonly headingText?: string;
  readonly body?: string;
  readonly date?: string;
  readonly variant?: string;
  readonly theme?: string;
}

export interface ExternalWidgetElementConfig {
  readonly src?: string;
  readonly type?: string;
  readonly title?: string;
  readonly endpoint?: string;
}

export interface BadgeElementConfig {
  readonly text?: string;
  readonly tone?: string;
  readonly ariaLabel?: string;
}

export interface ButtonContainerElementConfig {
  readonly label?: string;
  readonly href?: string;
  readonly target?: string;
}

export interface ColumnElementConfig {
  readonly variant?: string;
  readonly theme?: string;
}

export interface ContainerBlockElementConfig {
  readonly elementId?: string;
  readonly ariaLabel?: string;
  readonly variant?: string;
  readonly theme?: string;
}

export interface DividerElementConfig {
  readonly variant?: string;
  readonly theme?: string;
}

export interface GridElementConfig {
  readonly variant?: string;
  readonly theme?: string;
}

export interface IconBlockElementConfig {
  readonly ariaLabel?: string;
}

export interface ImageBlockElementConfig {
  readonly src?: string;
  readonly alt?: string;
}

export interface LinkBlockElementConfig {
  readonly href?: string;
  readonly label?: string;
  readonly target?: string;
  readonly ariaLabel?: string;
}

export interface SpacerElementConfig {}

export interface StackElementConfig {
  readonly variant?: string;
  readonly theme?: string;
}

export interface TextBlockElementConfig {
  readonly headingText?: string;
  readonly headingLevel?: string;
  readonly variant?: string;
  readonly theme?: string;
}

export interface VideoBlockElementConfig {
  readonly src?: string;
  readonly title?: string;
}

export interface ScriptEmbedElementConfig {
  readonly scriptType?: string;
  readonly content?: string;
}

export interface AngularHostElementConfig {
  readonly component?: string;
  readonly endpoint?: string;
  readonly params?: Record<string, string>;
}

export interface MfHostElementConfig {
  readonly remoteEntry?: string;
  readonly exposedModule?: string;
  readonly endpoint?: string;
  readonly params?: Record<string, string>;
}

export interface MacroHostElementConfig {
  readonly contentType?: string;
  readonly contentData?: Record<string, unknown>;
}

export interface FeatureJourneyElementConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly elementId?: string;
}

export interface InsightExplorerElementConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly elementId?: string;
}

export interface MediaExplorerElementConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly elementId?: string;
  readonly defaultCategory?: string;
}

export interface ContentCarouselElementConfig {
  readonly title?: string;
  readonly items?: ReadonlyArray<{
    readonly title?: string;
    readonly body?: string;
    readonly image?: string;
    readonly ctaLabel?: string;
    readonly ctaUrl?: string;
  }>;
  readonly autoplay?: boolean;
  readonly interval?: number;
  readonly theme?: string;
}

export interface QuizFlowElementConfig {
  readonly title?: string;
  readonly subtitle?: string;
  readonly questions?: ReadonlyArray<{
    readonly text?: string;
    readonly options?: ReadonlyArray<string>;
    readonly correct?: number;
  }>;
  readonly theme?: string;
}

export interface RatingWidgetElementConfig {
  readonly title?: string;
  readonly subtitle?: string;
  readonly max?: number;
  readonly labels?: ReadonlyArray<string>;
  readonly theme?: string;
}

export interface FilterBoardElementConfig {
  readonly title?: string;
  readonly items?: ReadonlyArray<{
    readonly title?: string;
    readonly body?: string;
    readonly tags?: ReadonlyArray<string>;
  }>;
  readonly theme?: string;
}

export interface NotificationStackElementConfig {
  readonly notifications?: ReadonlyArray<{
    readonly id?: string;
    readonly message?: string;
    readonly type?: string;
    readonly duration?: number;
  }>;
  readonly theme?: string;
}

export interface CountdownClockElementConfig {
  readonly targetDate?: string;
  readonly label?: string;
  readonly theme?: string;
}

export const ELEMENT_CONFIG_FIELDS = {
  'alert-bar': ['title', 'description', 'ctaLabel', 'ctaUrl', 'variant', 'theme', 'dismissible'],
  'angular-host': ['component', 'endpoint', 'params'],
  banner: ['title', 'body', 'ctaLabel', 'ctaUrl', 'ctaTarget', 'variant', 'theme'],
  'banner-slider': ['headingText', 'body', 'variant', 'theme', 'slides'],
  badge: ['text', 'tone', 'ariaLabel'],
  'button-container': ['label', 'href', 'target'],
  'button-group': ['alignment', 'direction', 'gap', 'items'],
  card: ['title', 'subtitle', 'body', 'imageSrc', 'imageAlt', 'ctaLabel', 'ctaUrl', 'badgeText', 'badgeType', 'variant', 'theme'],
  column: ['variant', 'theme'],
  'container-block': ['elementId', 'ariaLabel', 'variant', 'theme'],
  'cta-group': ['primaryLabel', 'primaryUrl', 'primaryTarget', 'primaryVariant', 'secondaryLabel', 'secondaryUrl', 'secondaryTarget', 'secondaryVariant', 'alignment'],
  'data-table': ['caption', 'headers', 'rows'],
  divider: ['variant', 'theme'],
  'external-widget': ['src', 'type', 'title', 'endpoint'],
  'faq-item': ['question', 'answer', 'theme'],
  'faq-section': ['headingText', 'theme', 'items'],
  'feature-grid': ['headingText', 'variant', 'theme', 'items'],
  'feature-item': ['headingText', 'body', 'icon', 'variant', 'theme'],
  'feature-journey': ['title', 'theme', 'variant', 'elementId'],
  'gallery-item': ['src', 'alt', 'caption'],
  grid: ['variant', 'theme'],
  hero: ['headingText', 'headingLevel', 'body', 'imageSrc', 'imageAlt', 'ctaLabel', 'ctaUrl', 'ctaTarget', 'variant', 'theme'],
  'icon-block': ['ariaLabel'],
  'iframe-embed': ['src', 'title', 'height', 'allowFullscreen'],
  'info-block': ['title', 'body', 'ctaLabel', 'ctaUrl', 'variant', 'theme'],
  'insight-explorer': ['title', 'theme', 'variant', 'elementId'],
  'key-value': ['label', 'value', 'helpText', 'theme'],
  'link-block': ['href', 'label', 'target', 'ariaLabel'],
  'logo-cloud': ['headingText', 'body', 'variant', 'theme', 'items'],
  'logo-item': ['src', 'alt', 'href', 'label', 'target'],
  'macro-host': ['contentType', 'contentData'],
  'media-explorer': ['title', 'theme', 'variant', 'elementId', 'defaultCategory'],
  'media-text': ['imageSrc', 'imageAlt', 'headingText', 'body', 'ctaLabel', 'ctaUrl', 'ctaTarget', 'mediaPosition', 'variant', 'theme'],
  'mf-host': ['remoteEntry', 'exposedModule', 'endpoint', 'params'],
  'newsletter-form': ['title', 'intro', 'placeholder', 'submitLabel', 'consentText', 'successMessage', 'errorMessage', 'actionUrl', 'method', 'theme'],
  section: ['variant', 'theme'],
  'script-embed': ['scriptType', 'content'],
  'social-share': ['title', 'pageUrl', 'layout', 'links'],
  spacer: [],
  stack: ['variant', 'theme'],
  'tab-group': ['title', 'ariaLabel', 'variant', 'theme'],
  'testimonial-item': ['quote', 'name', 'role', 'avatarSrc', 'avatarAlt', 'theme'],
  'testimonial-section': ['headingText', 'theme', 'items'],
  'text-block': ['headingText', 'headingLevel', 'variant', 'theme'],
  'timeline-item': ['headingText', 'body', 'date', 'variant', 'theme'],
  'video-block': ['src', 'title'],
  'content-carousel': ['title', 'items', 'autoplay', 'interval', 'theme'],
  'quiz-flow': ['title', 'subtitle', 'questions', 'theme'],
  'rating-widget': ['title', 'subtitle', 'max', 'labels', 'theme'],
  'filter-board': ['title', 'items', 'theme'],
  'notification-stack': ['notifications', 'theme'],
  'countdown-clock': ['targetDate', 'label', 'theme'],
} as const satisfies Record<string, readonly string[]>;

export const ELEMENT_CONFIG_JSON_FIELDS = {
  'angular-host': ['params'],
  'banner-slider': ['slides'],
  'button-group': ['items'],
  'data-table': ['headers', 'rows'],
  'faq-section': ['items'],
  'feature-grid': ['items'],
  'logo-cloud': ['items'],
  'macro-host': ['contentData'],
  'mf-host': ['params'],
  'social-share': ['links'],
  'testimonial-section': ['items'],
  'content-carousel': ['items'],
  'quiz-flow': ['questions'],
  'rating-widget': ['labels'],
  'filter-board': ['items'],
  'notification-stack': ['notifications'],
} as const satisfies Record<string, readonly string[]>;

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

/** Maps each element type key to its config interface. */
export type ElementConfigMap = {
  'alert-bar': AlertBarElementConfig;
  'angular-host': AngularHostElementConfig;
  'badge': BadgeElementConfig;
  'banner': BannerElementConfig;
  'banner-slider': BannerSliderElementConfig;
  'button-container': ButtonContainerElementConfig;
  'button-group': ButtonGroupElementConfig;
  'card': CardElementConfig;
  'column': ColumnElementConfig;
  'container-block': ContainerBlockElementConfig;
  'cta-group': CtaGroupElementConfig;
  'data-table': DataTableElementConfig;
  'divider': DividerElementConfig;
  'external-widget': ExternalWidgetElementConfig;
  'faq-item': FaqItemElementConfig;
  'faq-section': FaqSectionElementConfig;
  'feature-grid': FeatureGridElementConfig;
  'feature-item': FeatureItemElementConfig;
  'feature-journey': FeatureJourneyElementConfig;
  'gallery-item': GalleryItemElementConfig;
  'grid': GridElementConfig;
  'hero': HeroElementConfig;
  'icon-block': IconBlockElementConfig;
  'iframe-embed': IframeEmbedElementConfig;
  'image-block': ImageBlockElementConfig;
  'info-block': InfoBlockElementConfig;
  'insight-explorer': InsightExplorerElementConfig;
  'key-value': KeyValueElementConfig;
  'link-block': LinkBlockElementConfig;
  'logo-cloud': LogoCloudElementConfig;
  'logo-item': LogoItemElementConfig;
  'macro-host': MacroHostElementConfig;
  'media-explorer': MediaExplorerElementConfig;
  'media-text': MediaTextElementConfig;
  'mf-host': MfHostElementConfig;
  'newsletter-form': NewsletterFormElementConfig;
  'script-embed': ScriptEmbedElementConfig;
  'section': SectionElementConfig;
  'social-share': SocialShareElementConfig;
  'spacer': SpacerElementConfig;
  'stack': StackElementConfig;
  'tab-group': TabGroupElementConfig;
  'testimonial-item': TestimonialItemElementConfig;
  'testimonial-section': TestimonialSectionElementConfig;
  'text-block': TextBlockElementConfig;
  'timeline-item': TimelineItemElementConfig;
  'video-block': VideoBlockElementConfig;
  'content-carousel': ContentCarouselElementConfig;
  'quiz-flow': QuizFlowElementConfig;
  'rating-widget': RatingWidgetElementConfig;
  'filter-board': FilterBoardElementConfig;
  'notification-stack': NotificationStackElementConfig;
  'countdown-clock': CountdownClockElementConfig;
};

/** All valid element type keys. */
export type ElementType = keyof ElementConfigMap;

/** Union of all element config shapes. */
export type AnyElementConfig = ElementConfigMap[ElementType];

/** Element types whose config carries an items/slides collection. */
export type CollectionElementType =
  | 'banner-slider'
  | 'faq-section'
  | 'feature-grid'
  | 'logo-cloud'
  | 'testimonial-section';

/** Union of collection element config shapes. */
export type CollectionElementConfig = ElementConfigMap[CollectionElementType];
