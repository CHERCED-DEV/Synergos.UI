import type { BlockConfig } from '../contracts/page-config.contract';
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
} from '../contracts/elements.contract';
import { mapHeroData } from './hero.mapper';
import { mapCardData } from './card.mapper';
import { mapBannerData } from './banner.mapper';
import { mapSectionData } from './section.mapper';
import { mapFeatureGridData } from './feature-grid.mapper';
import { mapFaqSectionData } from './faq-section.mapper';
import { mapTestimonialSectionData } from './testimonial-section.mapper';
import { mapMediaTextData } from './media-text.mapper';
import { mapMacroHostData } from './macro-host.mapper';

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
