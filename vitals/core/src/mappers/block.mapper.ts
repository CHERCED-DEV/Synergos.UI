import type { BlockConfig } from '@synergos/contracts';
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
import { mapPricingCardData } from './pricing-card.mapper';
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
import { mapHelloWorldData } from './hello-world.mapper';
import { mapFeatureJourneyData } from './feature-journey.mapper';
import { mapInsightExplorerData } from './insight-explorer.mapper';
import { mapMediaExplorerData } from './media-explorer.mapper';

export interface MappedBlock {
  tag: string;
  inputs: Record<string, string>;
  blockClass: string;
}

interface MapperEntry {
  tag: string;
  map: (data: Record<string, unknown>) => Record<string, string>;
}

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
  elementIntegrationMacroHost: {
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
  elementCompButtonGroup: {
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
  elementInfoPricingCard: {
    tag: 'synergos-pricing-card',
    map: (d) => toRecord(mapPricingCardData(d as unknown as Record<string, unknown>)),
  },
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
  elementTemplateHelloWorld: {
    tag: 'synergos-hello-world',
    map: (d) => toRecord(mapHelloWorldData(d as unknown as Record<string, unknown>)),
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
};

export function mapBlockToElement(block: BlockConfig): MappedBlock | null {
  const entry = REGISTRY[block.type];
  if (!entry) {
    return null;
  }

  return {
    tag: entry.tag,
    inputs: entry.map(block.data),
    blockClass: block.blockClass,
  };
}
