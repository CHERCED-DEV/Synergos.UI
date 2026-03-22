import type { BlockConfig } from '../contracts/page-config.contract';
import type { HeroElementData, CardElementData, CtaBannerElementData, SectionElementData } from '../contracts/elements.contract';
import { mapHeroData } from './hero.mapper';
import { mapCardData } from './card.mapper';
import { mapBannerData } from './banner.mapper';
import { mapSectionData } from './section.mapper';

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
