import type { BlockConfig } from '@synergos/contracts';
import type {
  HeroElementData,
  CardElementData,
  CtaBannerElementData,
  SectionElementData,
  FeatureGridElementData,
  FaqListElementData,
  TestimonialListElementData,
  MediaTextSplitElementData,
  MacroHostElementData,
  ContainerElementData,
  GridElementData,
  StackElementData,
  ButtonElementData,
  IconElementData,
  ImageElementData,
  LinkElementData,
  FeatureElementData,
} from '@synergos/contracts';
import { mapHeroData } from './hero.mapper';
import { mapCardData } from './card.mapper';
import { mapBannerData } from './banner.mapper';
import { mapSectionData } from './section.mapper';
import { mapFeatureGridData } from './feature-grid.mapper';
import { mapFaqSectionData } from './faq-section.mapper';
import { mapTestimonialSectionData } from './testimonial-section.mapper';
import { mapMediaTextData } from './media-text.mapper';
import { mapMacroHostData } from './macro-host.mapper';
import { mapCtaGroupData } from './cta-group.mapper';
import { mapFeatureItemData } from './feature-item.mapper';
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
    result[key] = String(value ?? '');
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
  elementStructStack: {
    tag: 'synergos-stack',
    map: (d) => toRecord(mapStackData(d as unknown as StackElementData)),
  },
  elementActionButtonContainer: {
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
  elementActionLink: {
    tag: 'synergos-link-block',
    map: (d) => toRecord(mapLinkBlockData(d as unknown as LinkElementData)),
  },
  elementTextBlock: {
    tag: 'synergos-text-block',
    map: (d) => toRecord(mapTextBlockData(d as unknown as Record<string, unknown>)),
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
