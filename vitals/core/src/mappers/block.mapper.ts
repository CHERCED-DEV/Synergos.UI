import {
  ELEMENT_CONFIG_FIELDS,
  ELEMENT_CONFIG_JSON_FIELDS,
  type BlockConfig,
} from '@synergos/contracts';
import type {
  HeroElementData,
  CardElementData,
  CtaBannerElementData,
  SectionElementData,
  FeatureGridElementData,
  FaqListElementData,
  TestimonialListElementData,
  LogoCloudElementData,
  MediaTextSplitElementData,
  MacroHostElementData,
  TabGroupElementData,
  BannerSliderElementData,
  DataTableElementData,
  ScriptEmbedElementData,
  AngularHostElementData,
  MfHostElementData,
  ContainerElementData,
  GridElementData,
  ColumnElementData,
  StackElementData,
  DividerElementData,
  SpacerElementData,
  ButtonElementData,
  IconElementData,
  ImageElementData,
  VideoElementData,
  LinkElementData,
  FeatureElementData,
  KeyValueElementData,
  TimelineItemElementData,
  FaqItemElementData,
  TestimonialItemElementData,
  GalleryItemElementData,
  LogoItemElementData,
  BadgeElementData,
  AlertBarElementData,
  NewsletterFormElementData,
  SocialShareElementData,
  IframeEmbedElementData,
  ExternalWidgetElementData,
  FeatureJourneyElementData,
  InsightExplorerElementData,
  MediaExplorerElementData,
  QuoteElementData,
} from '@synergos/contracts';
import { mapHeroData } from './hero.mapper';
import { mapCardData } from './card.mapper';
import { mapBannerData } from './banner.mapper';
import { mapSectionData } from './section.mapper';
import { mapFeatureGridData } from './feature-grid.mapper';
import { mapFaqSectionData } from './faq-section.mapper';
import { mapTestimonialSectionData } from './testimonial-section.mapper';
import { mapLogoCloudData } from './logo-cloud.mapper';
import { mapMediaTextData } from './media-text.mapper';
import { mapMacroHostData } from './macro-host.mapper';
import { mapTabGroupData } from './tab-group.mapper';
import { mapBannerSliderData } from './banner-slider.mapper';
import { mapDataTableData } from './data-table.mapper';
import { mapScriptEmbedData } from './script-embed.mapper';
import { mapAngularHostData } from './angular-host.mapper';
import { mapMfHostData } from './mf-host.mapper';
import { mapCtaGroupData } from './cta-group.mapper';
import { mapFeatureItemData } from './feature-item.mapper';
import { mapKeyValueData } from './key-value.mapper';
import { mapTimelineItemData } from './timeline-item.mapper';
import { mapFaqItemData } from './faq-item.mapper';
import { mapTestimonialItemData } from './testimonial-item.mapper';
import { mapInfoBlockData } from './info-block.mapper';
import { mapButtonGroupData } from './button-group.mapper';
import { mapContainerBlockData } from './container-block.mapper';
import { mapGridData } from './grid.mapper';
import { mapStackData } from './stack.mapper';
import { mapButtonContainerData } from './button-container.mapper';
import { mapIconBlockData } from './icon-block.mapper';
import { mapImageBlockData } from './image-block.mapper';
import { mapLinkBlockData } from './link-block.mapper';
import { mapTextBlockData } from './text-block.mapper';
import { mapStatCounterData } from './stat-counter.mapper';
import { mapAccordionData } from './accordion.mapper';
import { mapAvatarData } from './avatar.mapper';
import { mapBadgeData } from './badge.mapper';
import { mapVideoBlockData } from './video-block.mapper';
import { mapGalleryItemData } from './gallery-item.mapper';
import { mapLogoItemData } from './logo-item.mapper';
import { mapAlertBarData } from './alert-bar.mapper';
import { mapNewsletterFormData } from './newsletter-form.mapper';
import { mapSocialShareData } from './social-share.mapper';
import { mapIframeEmbedData } from './iframe-embed.mapper';
import { mapExternalWidgetData } from './external-widget.mapper';
import { mapColumnData } from './column.mapper';
import { mapDividerData } from './divider.mapper';
import { mapSpacerData } from './spacer.mapper';
import { mapFeatureJourneyData } from './feature-journey.mapper';
import { mapInsightExplorerData } from './insight-explorer.mapper';
import { mapMediaExplorerData } from './media-explorer.mapper';
import { mapCountdownClockData } from './countdown-clock.mapper';
import { mapProductCardData } from './product-card.mapper';
import { mapProductGridData } from './product-grid.mapper';
import { mapProductDetailData } from './product-detail.mapper';
import { mapCartSummaryData } from './cart-summary.mapper';
import { mapCartItemData } from './cart-item.mapper';
import { mapPriceDisplayData } from './price-display.mapper';
import { mapQuantitySelectorData } from './quantity-selector.mapper';
import { mapVariantPickerData } from './variant-picker.mapper';

export interface MappedBlock {
  tag: string;
  inputs: Record<string, string>;
  blockClass: string;
}

interface MapperEntry {
  tag: string;
  map: (data: Record<string, unknown>) => Record<string, string>;
}

export type BlockMappingErrorCode = 'mapper_not_found';

export interface BlockMappingError {
  code: BlockMappingErrorCode;
  blockType: string;
  message: string;
}

export type BlockMappingResult =
  | { ok: true; value: MappedBlock }
  | { ok: false; error: BlockMappingError };

function toRecord(obj: object): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      result[key] = '';
    } else if (Array.isArray(value) || typeof value === 'object') {
      result[key] = JSON.stringify(value);
    } else {
      result[key] = String(value);
    }
  }
  return result;
}

function tryParseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function withConfigPayload(tag: string, inputs: Record<string, string>): Record<string, string> {
  const slug = tag.startsWith('synergos-') ? tag.slice('synergos-'.length) : tag;
  if (!Object.prototype.hasOwnProperty.call(ELEMENT_CONFIG_FIELDS, slug)) {
    return inputs;
  }

  const configFields = new Set<string>(ELEMENT_CONFIG_FIELDS[slug as keyof typeof ELEMENT_CONFIG_FIELDS]);
  const jsonFields = new Set<string>(ELEMENT_CONFIG_JSON_FIELDS[slug as keyof typeof ELEMENT_CONFIG_JSON_FIELDS] ?? []);
  const config: Record<string, unknown> = {};
  const extraInputs: Record<string, string> = {};

  for (const [key, value] of Object.entries(inputs)) {
    if (!configFields.has(key)) {
      extraInputs[key] = value;
      continue;
    }

    if (value === '') {
      continue;
    }

    config[key] = jsonFields.has(key) ? tryParseJsonValue(value) : value;
  }

  return {
    ...extraInputs,
    config: JSON.stringify(config),
  };
}

const REGISTRY: Record<string, MapperEntry> = {
  elementCompHero: {
    tag: 'synergos-hero',
    map: (d) => toRecord(mapHeroData(d as unknown as HeroElementData)),
  },
  elementCompCard: {
    tag: 'synergos-card',
    map: (d) => toRecord(mapCardData(d as unknown as CardElementData)),
  },
  elementCompCtaBanner: {
    tag: 'synergos-banner',
    map: (d) => toRecord(mapBannerData(d as unknown as CtaBannerElementData)),
  },
  elementStructSection: {
    tag: 'synergos-section',
    map: (d) => toRecord(mapSectionData(d as unknown as SectionElementData)),
  },
  elementCompFeatureGrid: {
    tag: 'synergos-feature-grid',
    map: (d) => toRecord(mapFeatureGridData(d as unknown as FeatureGridElementData)),
  },
  elementCompFaqList: {
    tag: 'synergos-faq-section',
    map: (d) => toRecord(mapFaqSectionData(d as unknown as FaqListElementData)),
  },
  elementCompTestimonialList: {
    tag: 'synergos-testimonial-section',
    map: (d) => toRecord(mapTestimonialSectionData(d as unknown as TestimonialListElementData)),
  },
  elementCompLogoCloud: {
    tag: 'synergos-logo-cloud',
    map: (d) => toRecord(mapLogoCloudData(d as unknown as LogoCloudElementData)),
  },
  elementCorpTabGroup: {
    tag: 'synergos-tab-group',
    map: (d) => toRecord(mapTabGroupData(d as unknown as TabGroupElementData)),
  },
  elementCorpBannerSlider: {
    tag: 'synergos-banner-slider',
    map: (d) => toRecord(mapBannerSliderData(d as unknown as BannerSliderElementData)),
  },
  elementCorpDataTable: {
    tag: 'synergos-data-table',
    map: (d) => toRecord(mapDataTableData(d as unknown as DataTableElementData)),
  },
  elementIntScriptEmbed: {
    tag: 'synergos-script-embed',
    map: (d) => toRecord(mapScriptEmbedData(d as unknown as ScriptEmbedElementData)),
  },
  elementIntAngularHost: {
    tag: 'synergos-angular-host',
    map: (d) => toRecord(mapAngularHostData(d as unknown as AngularHostElementData)),
  },
  elementIntMfHost: {
    tag: 'synergos-mf-host',
    map: (d) => toRecord(mapMfHostData(d as unknown as MfHostElementData)),
  },
  elementCompMediaTextSplit: {
    tag: 'synergos-media-text',
    map: (d) => toRecord(mapMediaTextData(d as unknown as MediaTextSplitElementData)),
  },
  // Canonical CMS alias is "elementIntMacroHost" — the old UI key was wrong.
  elementIntMacroHost: {
    tag: 'synergos-macro-host',
    map: (d) => toRecord(mapMacroHostData(d as unknown as MacroHostElementData)),
  },

  // ── Compositions ────────────────────────────────────────────────────────────
  elementActionCtaGroup: {
    tag: 'synergos-cta-group',
    map: (d) => toRecord(mapCtaGroupData(d as unknown as Record<string, unknown>)),
  },
  elementInfoFeature: {
    tag: 'synergos-feature-item',
    map: (d) => toRecord(mapFeatureItemData(d as unknown as FeatureElementData)),
  },
  elementInfoKeyValue: {
    tag: 'synergos-key-value',
    map: (d) => toRecord(mapKeyValueData(d as unknown as KeyValueElementData)),
  },
  elementInfoTimelineItem: {
    tag: 'synergos-timeline-item',
    map: (d) => toRecord(mapTimelineItemData(d as unknown as TimelineItemElementData)),
  },
  elementInfoFaqItem: {
    tag: 'synergos-faq-item',
    map: (d) => toRecord(mapFaqItemData(d as unknown as FaqItemElementData)),
  },
  elementInfoTestimonialItem: {
    tag: 'synergos-testimonial-item',
    map: (d) => toRecord(mapTestimonialItemData(d as unknown as TestimonialItemElementData)),
  },
  elementCompInfoBlock: {
    tag: 'synergos-info-block',
    map: (d) => toRecord(mapInfoBlockData(d as unknown as Record<string, unknown>)),
  },
  elementActionButtonGroup: {
    tag: 'synergos-button-group',
    map: (d) => toRecord(mapButtonGroupData(d as unknown as Record<string, unknown>)),
  },

  // ── Primitives ──────────────────────────────────────────────────────────────
  elementStructContainer: {
    tag: 'synergos-container-block',
    map: (d) => toRecord(mapContainerBlockData(d as unknown as ContainerElementData)),
  },
  elementStructGrid: {
    tag: 'synergos-grid',
    map: (d) => toRecord(mapGridData(d as unknown as GridElementData)),
  },
  elementStructColumn: {
    tag: 'synergos-column',
    map: (d) => toRecord(mapColumnData(d as unknown as ColumnElementData)),
  },
  elementStructStack: {
    tag: 'synergos-stack',
    map: (d) => toRecord(mapStackData(d as unknown as StackElementData)),
  },
  elementStructDivider: {
    tag: 'synergos-divider',
    map: (d) => toRecord(mapDividerData(d as unknown as DividerElementData)),
  },
  elementStructSpacer: {
    tag: 'synergos-spacer',
    map: (d) => toRecord(mapSpacerData(d as unknown as SpacerElementData)),
  },
  elementActionButton: {
    tag: 'synergos-button-container',
    map: (d) => toRecord(mapButtonContainerData(d as unknown as ButtonElementData)),
  },
  elementMediaIcon: {
    tag: 'synergos-icon-block',
    map: (d) => toRecord(mapIconBlockData(d as unknown as IconElementData)),
  },
  elementMediaImage: {
    tag: 'synergos-image-block',
    map: (d) => toRecord(mapImageBlockData(d as unknown as ImageElementData)),
  },
  elementMediaVideo: {
    tag: 'synergos-video-block',
    map: (d) => toRecord(mapVideoBlockData(d as unknown as VideoElementData)),
  },
  elementMediaGalleryItem: {
    tag: 'synergos-gallery-item',
    map: (d) => toRecord(mapGalleryItemData(d as unknown as GalleryItemElementData)),
  },
  elementMediaLogoItem: {
    tag: 'synergos-logo-item',
    map: (d) => toRecord(mapLogoItemData(d as unknown as LogoItemElementData)),
  },
  elementActionLink: {
    tag: 'synergos-link-block',
    map: (d) => toRecord(mapLinkBlockData(d as unknown as LinkElementData)),
  },
  elementTextBlock: {
    tag: 'synergos-text-block',
    map: (d) => toRecord(mapTextBlockData(d as unknown as Record<string, unknown>)),
  },
  elementTextHeading: {
    tag: 'synergos-text-block',
    map: (d) => toRecord(mapTextBlockData(d as unknown as Record<string, unknown>)),
  },
  elementTextParagraph: {
    tag: 'synergos-text-block',
    map: (d) => toRecord(mapTextBlockData(d as unknown as Record<string, unknown>)),
  },
  elementTextRichText: {
    tag: 'synergos-text-block',
    map: (d) => toRecord(mapTextBlockData(d as unknown as Record<string, unknown>)),
  },
  elementTextEyebrow: {
    tag: 'synergos-text-block',
    map: (d) => toRecord(mapTextBlockData(d as unknown as Record<string, unknown>)),
  },
  elementTextQuote: {
    tag: 'synergos-text-block',
    map: (d) => toRecord(mapTextBlockData(d as unknown as Record<string, unknown>)),
  },
  elementTextLabel: {
    tag: 'synergos-text-block',
    map: (d) => toRecord(mapTextBlockData(d as unknown as Record<string, unknown>)),
  },

  // ── Cross-framework elements ────────────────────────────────────────────────
  elementInfoStat: {
    tag: 'synergos-stat-counter',
    map: (d) => toRecord(mapStatCounterData(d as unknown as Record<string, unknown>)),
  },
  elementCompAccordion: {
    tag: 'synergos-accordion',
    map: (d) => toRecord(mapAccordionData(d as unknown as Record<string, unknown>)),
  },
  elementMediaAvatar: {
    tag: 'synergos-avatar',
    map: (d) => toRecord(mapAvatarData(d as unknown as Record<string, unknown>)),
  },
  elementInfoBadge: {
    tag: 'synergos-badge',
    map: (d) => toRecord(mapBadgeData(d as unknown as BadgeElementData)),
  },
  elementCorpAlertBar: {
    tag: 'synergos-alert-bar',
    map: (d) => toRecord(mapAlertBarData(d as unknown as AlertBarElementData)),
  },
  elementCorpNewsletterForm: {
    tag: 'synergos-newsletter-form',
    map: (d) => toRecord(mapNewsletterFormData(d as unknown as NewsletterFormElementData)),
  },
  elementCorpSocialShare: {
    tag: 'synergos-social-share',
    map: (d) => toRecord(mapSocialShareData(d as unknown as SocialShareElementData)),
  },
  elementIntIframeEmbed: {
    tag: 'synergos-iframe-embed',
    map: (d) => toRecord(mapIframeEmbedData(d as unknown as IframeEmbedElementData)),
  },
  elementIntExternalWidget: {
    tag: 'synergos-external-widget',
    map: (d) => toRecord(mapExternalWidgetData(d as unknown as ExternalWidgetElementData)),
  },

  // ── Experiences ─────────────────────────────────────────────────────────────
  experienceFeatureJourney: {
    tag: 'synergos-feature-journey',
    map: (d) => toRecord(mapFeatureJourneyData(d as unknown as FeatureJourneyElementData)),
  },
  experienceInsightExplorer: {
    tag: 'synergos-insight-explorer',
    map: (d) => toRecord(mapInsightExplorerData(d as unknown as InsightExplorerElementData)),
  },
  experienceMediaExplorer: {
    tag: 'synergos-media-explorer',
    map: (d) => toRecord(mapMediaExplorerData(d as unknown as MediaExplorerElementData)),
  },
  experienceCountdownClock: {
    tag: 'synergos-countdown-clock',
    map: (d) => toRecord(mapCountdownClockData(d as Record<string, unknown>)),
  },

  // ── Layout Presets ──────────────────────────────────────────────────────────
  // Structural grid wrappers — DOM compositions only, blockClass carries preset semantics.
  layoutPreset1Col: {
    tag: 'synergos-section',
    map: (d) => toRecord(mapSectionData(d as unknown as SectionElementData)),
  },
  layoutPreset2ColEqual: {
    tag: 'synergos-grid',
    map: (d) => toRecord(mapGridData(d as unknown as GridElementData)),
  },
  layoutPreset3ColEqual: {
    tag: 'synergos-grid',
    map: (d) => toRecord(mapGridData(d as unknown as GridElementData)),
  },
  layoutPreset4ColEqual: {
    tag: 'synergos-grid',
    map: (d) => toRecord(mapGridData(d as unknown as GridElementData)),
  },
  layoutPresetMainSidebar: {
    tag: 'synergos-grid',
    map: (d) => toRecord(mapGridData(d as unknown as GridElementData)),
  },

  // ── Corporate (new) ─────────────────────────────────────────────────────────
  elementCorpContactInfo: {
    tag: 'synergos-contact-info',
    map: (d) => toRecord(mapInfoBlockData(d as unknown as Parameters<typeof mapInfoBlockData>[0])),
  },
  elementCorpMapEmbed: {
    tag: 'synergos-map-embed',
    map: (d) => toRecord(mapIframeEmbedData(d as unknown as IframeEmbedElementData)),
  },
  elementCorpMissionBlock: {
    tag: 'synergos-mission-block',
    map: (d) => toRecord(mapMediaTextData(d as unknown as MediaTextSplitElementData)),
  },
  // AlertBox uses the same presentation component as AlertBar (different editor alias)
  elementCorpAlertBox: {
    tag: 'synergos-alert-bar',
    map: (d) => toRecord(mapAlertBarData(d as unknown as AlertBarElementData)),
  },

  // ── Textual (new) ───────────────────────────────────────────────────────────
  elementTextCodeBlock: {
    tag: 'synergos-code-block',
    map: (d) => toRecord(mapTextBlockData(d as unknown as Parameters<typeof mapTextBlockData>[0])), // TextBlockElementData local type
  },
  elementTextAttributedQuote: {
    tag: 'synergos-attributed-quote',
    map: (d) => {
      const data = d as unknown as QuoteElementData;
      return toRecord({
        quoteText:   data.text?.body ?? '',
        authorName:  data.author?.authorName ?? '',
        authorRole:  data.author?.authorRole ?? '',
        variant:     data.domVariant?.variant ?? 'default',
        theme:       data.domVariant?.theme ?? 'light',
      });
    },
  },

  // ── Action (second alias for ButtonContainer) ────────────────────────────────
  elementActionButtonContainer: {
    tag: 'synergos-button-container',
    map: (d) => toRecord(mapButtonContainerData(d as unknown as ButtonElementData)),
  },

  // ── Blog blocks ─────────────────────────────────────────────────────────────
  elementCompBlogHighlight: {
    tag: 'synergos-blog-highlight',
    map: (d) => toRecord(mapMediaTextData(d as unknown as MediaTextSplitElementData)),
  },
  elementCompArticleList: {
    tag: 'synergos-article-list',
    map: (d) => toRecord(mapInfoBlockData(d as unknown as Parameters<typeof mapInfoBlockData>[0])),
  },

  // ── Forms ────────────────────────────────────────────────────────────────────
  elementFormEmbed: {
    tag: 'synergos-form-embed',
    map: (d) => toRecord(mapIframeEmbedData(d as unknown as IframeEmbedElementData)),
  },
  elementCompFormBlock: {
    tag: 'synergos-form-block',
    map: (d) => toRecord(mapInfoBlockData(d as unknown as Parameters<typeof mapInfoBlockData>[0])),
  },

  // ── Shop domain ──────────────────────────────────────────────────────────────
  elementShopProductCard: {
    tag: 'synergos-product-card',
    map: (d) => toRecord(mapProductCardData(d)),
  },
  elementShopProductGrid: {
    tag: 'synergos-product-grid',
    map: (d) => toRecord(mapProductGridData(d)),
  },
  elementShopProductDetail: {
    tag: 'synergos-product-detail',
    map: (d) => toRecord(mapProductDetailData(d)),
  },
  elementShopCartSummary: {
    tag: 'synergos-cart-summary',
    map: (d) => toRecord(mapCartSummaryData(d)),
  },
  elementShopCartItem: {
    tag: 'synergos-cart-item',
    map: (d) => toRecord(mapCartItemData(d)),
  },
  elementShopPriceDisplay: {
    tag: 'synergos-price-display',
    map: (d) => toRecord(mapPriceDisplayData(d)),
  },
  elementShopQuantitySelector: {
    tag: 'synergos-quantity-selector',
    map: (d) => toRecord(mapQuantitySelectorData(d)),
  },
  elementShopVariantPicker: {
    tag: 'synergos-variant-picker',
    map: (d) => toRecord(mapVariantPickerData(d)),
  },
  elementSynAccordion: {
    tag: 'synergos-accordion',
    map: (d) => toRecord(d),
  },
  elementSynAudioPlayer: {
    tag: 'synergos-audio-player',
    map: (d) => toRecord(d),
  },
  elementSynAutocomplete: {
    tag: 'synergos-autocomplete',
    map: (d) => toRecord(d),
  },
  elementSynAvatar: {
    tag: 'synergos-avatar',
    map: (d) => toRecord(d),
  },
  elementSynAvatarGroup: {
    tag: 'synergos-avatar-group',
    map: (d) => toRecord(d),
  },
  elementSynAvatarUpload: {
    tag: 'synergos-avatar-upload',
    map: (d) => toRecord(d),
  },
  elementSynBadge: {
    tag: 'synergos-badge',
    map: (d) => toRecord(d),
  },
  elementSynBadgeGroup: {
    tag: 'synergos-badge-group',
    map: (d) => toRecord(d),
  },
  elementSynBreadcrumb: {
    tag: 'synergos-breadcrumb',
    map: (d) => toRecord(d),
  },
  elementSynCalendar: {
    tag: 'synergos-calendar',
    map: (d) => toRecord(d),
  },
  elementSynCarousel: {
    tag: 'synergos-carousel',
    map: (d) => toRecord(d),
  },
  elementSynChartBar: {
    tag: 'synergos-chart-bar',
    map: (d) => toRecord(d),
  },
  elementSynCodeBlock: {
    tag: 'synergos-code-block',
    map: (d) => toRecord(d),
  },
  elementSynColorPicker: {
    tag: 'synergos-color-picker',
    map: (d) => toRecord(d),
  },
  elementSynColorSwatches: {
    tag: 'synergos-color-swatches',
    map: (d) => toRecord(d),
  },
  elementSynCommentsWidget: {
    tag: 'synergos-comments-widget',
    map: (d) => toRecord(d),
  },
  elementSynCookieConsent: {
    tag: 'synergos-cookie-consent',
    map: (d) => toRecord(d),
  },
  elementSynCopyButton: {
    tag: 'synergos-copy-button',
    map: (d) => toRecord(d),
  },
  elementSynCountdownClock: {
    tag: 'synergos-countdown-clock',
    map: (d) => toRecord(d),
  },
  elementSynCountdownDigital: {
    tag: 'synergos-countdown-digital',
    map: (d) => toRecord(d),
  },
  elementSynDataGrid: {
    tag: 'synergos-data-grid',
    map: (d) => toRecord(d),
  },
  elementSynDatePicker: {
    tag: 'synergos-date-picker',
    map: (d) => toRecord(d),
  },
  elementSynDivider: {
    tag: 'synergos-divider',
    map: (d) => toRecord(d),
  },
  elementSynDrawer: {
    tag: 'synergos-drawer',
    map: (d) => toRecord(d),
  },
  elementSynDropdown: {
    tag: 'synergos-dropdown',
    map: (d) => toRecord(d),
  },
  elementSynDropzone: {
    tag: 'synergos-dropzone',
    map: (d) => toRecord(d),
  },
  elementSynFab: {
    tag: 'synergos-fab',
    map: (d) => toRecord(d),
  },
  elementSynFileUploader: {
    tag: 'synergos-file-uploader',
    map: (d) => toRecord(d),
  },
  elementSynFormStepper: {
    tag: 'synergos-form-stepper',
    map: (d) => toRecord(d),
  },
  elementSynHeroBanner: {
    tag: 'synergos-hero-banner',
    map: (d) => toRecord(d),
  },
  elementSynIconLabel: {
    tag: 'synergos-icon-label',
    map: (d) => toRecord(d),
  },
  elementSynKpiCard: {
    tag: 'synergos-kpi-card',
    map: (d) => toRecord(d),
  },
  elementSynLightboxGallery: {
    tag: 'synergos-lightbox-gallery',
    map: (d) => toRecord(d),
  },
  elementSynLivestream: {
    tag: 'synergos-livestream',
    map: (d) => toRecord(d),
  },
  elementSynMapPin: {
    tag: 'synergos-map-pin',
    map: (d) => toRecord(d),
  },
  elementSynModalTrigger: {
    tag: 'synergos-modal-trigger',
    map: (d) => toRecord(d),
  },
  elementSynNotificationCenter: {
    tag: 'synergos-notification-center',
    map: (d) => toRecord(d),
  },
  elementSynNotificationToast: {
    tag: 'synergos-notification-toast',
    map: (d) => toRecord(d),
  },
  elementSynOEmbed: {
    tag: 'synergos-oembed',
    map: (d) => toRecord(d),
  },
  elementSynOtpInput: {
    tag: 'synergos-otp-input',
    map: (d) => toRecord(d),
  },
  elementSynPagination: {
    tag: 'synergos-pagination',
    map: (d) => toRecord(d),
  },
  elementSynPoll: {
    tag: 'synergos-poll',
    map: (d) => toRecord(d),
  },
  elementSynPopover: {
    tag: 'synergos-popover',
    map: (d) => toRecord(d),
  },
  elementSynProgressBar: {
    tag: 'synergos-progress-bar',
    map: (d) => toRecord(d),
  },
  elementSynQrCode: {
    tag: 'synergos-qr-code',
    map: (d) => toRecord(d),
  },
  elementSynQuoteAnimated: {
    tag: 'synergos-quote-animated',
    map: (d) => toRecord(d),
  },
  elementSynRangeSlider: {
    tag: 'synergos-range-slider',
    map: (d) => toRecord(d),
  },
  elementSynRatingStars: {
    tag: 'synergos-rating-stars',
    map: (d) => toRecord(d),
  },
  elementSynRichTooltip: {
    tag: 'synergos-rich-tooltip',
    map: (d) => toRecord(d),
  },
  elementSynScrollTop: {
    tag: 'synergos-scroll-top',
    map: (d) => toRecord(d),
  },
  elementSynSearchBox: {
    tag: 'synergos-search-box',
    map: (d) => toRecord(d),
  },
  elementSynSelectMulti: {
    tag: 'synergos-select-multi',
    map: (d) => toRecord(d),
  },
  elementSynSeparator: {
    tag: 'synergos-separator',
    map: (d) => toRecord(d),
  },
  elementSynShareBar: {
    tag: 'synergos-share-bar',
    map: (d) => toRecord(d),
  },
  elementSynSignaturePad: {
    tag: 'synergos-signature-pad',
    map: (d) => toRecord(d),
  },
  elementSynSkeleton: {
    tag: 'synergos-skeleton',
    map: (d) => toRecord(d),
  },
  elementSynSocialProof: {
    tag: 'synergos-social-proof',
    map: (d) => toRecord(d),
  },
  elementSynSpacer: {
    tag: 'synergos-spacer',
    map: (d) => toRecord(d),
  },
  elementSynSplitter: {
    tag: 'synergos-splitter',
    map: (d) => toRecord(d),
  },
  elementSynStatTicker: {
    tag: 'synergos-stat-ticker',
    map: (d) => toRecord(d),
  },
  elementSynStepper: {
    tag: 'synergos-stepper',
    map: (d) => toRecord(d),
  },
  elementSynTabs: {
    tag: 'synergos-tabs',
    map: (d) => toRecord(d),
  },
  elementSynTag: {
    tag: 'synergos-tag',
    map: (d) => toRecord(d),
  },
  elementSynTestimonialCarousel: {
    tag: 'synergos-testimonial-carousel',
    map: (d) => toRecord(d),
  },
  elementSynTimeline: {
    tag: 'synergos-timeline',
    map: (d) => toRecord(d),
  },
  elementSynTimelineHorizontal: {
    tag: 'synergos-timeline-horizontal',
    map: (d) => toRecord(d),
  },
  elementSynToastCenter: {
    tag: 'synergos-toast-center',
    map: (d) => toRecord(d),
  },
  elementSynTooltip: {
    tag: 'synergos-tooltip',
    map: (d) => toRecord(d),
  },
  elementSynTourGuide: {
    tag: 'synergos-tour-guide',
    map: (d) => toRecord(d),
  },
  elementSynTreeView: {
    tag: 'synergos-tree-view',
    map: (d) => toRecord(d),
  },
  elementSynVideoPlayer: {
    tag: 'synergos-video-player',
    map: (d) => toRecord(d),
  },
  elementSynAcademy: {
    tag: 'synergos-academy',
    map: (d) => toRecord(d),
  },
  elementSynAppLauncher: {
    tag: 'synergos-app-launcher',
    map: (d) => toRecord(d),
  },
  elementSynBlogs: {
    tag: 'synergos-blogs',
    map: (d) => toRecord(d),
  },
  elementSynBookingWizard: {
    tag: 'synergos-booking-wizard',
    map: (d) => toRecord(d),
  },
  elementSynEhr: {
    tag: 'synergos-ehr',
    map: (d) => toRecord(d),
  },
  elementSynEventos: {
    tag: 'synergos-eventos',
    map: (d) => toRecord(d),
  },
  elementSynGov: {
    tag: 'synergos-gov',
    map: (d) => toRecord(d),
  },
  elementSynRealty: {
    tag: 'synergos-realty',
    map: (d) => toRecord(d),
  },
  elementSynPaxSelector: {
    tag: 'synergos-pax-selector',
    map: (d) => toRecord(d),
  },
  elementSynSeatMap: {
    tag: 'synergos-seat-map',
    map: (d) => toRecord(d),
  },
  elementSynSeller: {
    tag: 'synergos-seller',
    map: (d) => toRecord(d),
  },
  elementSynStorefront: {
    tag: 'synergos-storefront',
    map: (d) => toRecord(d),
  },
  elementSynTravelShell: {
    tag: 'synergos-travel-shell',
    map: (d) => toRecord(d),
  },
  elementSynFaqSection: {
    tag: 'synergos-faq-section',
    map: (d) => toRecord(d),
  },
  elementSynFeatureGrid: {
    tag: 'synergos-feature-grid',
    map: (d) => toRecord(d),
  },
  elementSynMediaText: {
    tag: 'synergos-media-text',
    map: (d) => toRecord(d),
  },
  elementSynModuleMount: {
    tag: 'synergos-module-mount',
    map: (d) => toRecord(d),
  },
  elementSynTestimonialSection: {
    tag: 'synergos-testimonial-section',
    map: (d) => toRecord(d),
  },
};

export function mapBlockToElementResult(block: BlockConfig): BlockMappingResult {
  const blockType = block.type.trim();
  const entry = REGISTRY[blockType];
  if (!entry) {
    return {
      ok: false,
      error: {
        code: 'mapper_not_found',
        blockType,
        message: `No mapper is registered for block type "${blockType}".`,
      },
    };
  }

  return {
    ok: true,
    value: {
      tag: entry.tag,
      inputs: withConfigPayload(entry.tag, entry.map(block.data)),
      blockClass: block.blockClass,
    },
  };
}

export function mapBlockToElement(block: BlockConfig): MappedBlock | null {
  const result = mapBlockToElementResult(block);
  return result.ok ? result.value : null;
}
