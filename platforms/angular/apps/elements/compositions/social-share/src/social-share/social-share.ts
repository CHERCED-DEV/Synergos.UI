import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ComponentTranslations, SocialShareElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  SocialLinksComponent,
  type SocialLinkItem,
  type SocialLinksLayout,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normalizeLayout(value: string): SocialLinksLayout {
  return value === 'stack' ? 'stack' : 'row';
}

export function normalizeLink(value: unknown): SocialLinkItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const label = readString(value['label']).trim();
  const href = readString(value['href']).trim();
  if (!label || !href) {
    return null;
  }

  return {
    label,
    href,
    iconSymbol: readString(value['iconSymbol']).trim(),
    target: readString(value['target']).trim() || '_blank',
    rel: readString(value['rel']).trim() || 'noopener noreferrer',
  };
}

export function normalizeLinks(value: unknown): readonly SocialLinkItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((link) => normalizeLink(link))
    .filter((link): link is SocialLinkItem => link !== null);

  return items.length > 0 ? items : undefined;
}

export function sanitizeSocialShareConfig(
  value: Partial<SocialShareElementConfig>,
): Partial<SocialShareElementConfig> {
  const layoutValue = coerceTrimmedStringInput(value.layout);

  return omitUndefinedProperties<Partial<SocialShareElementConfig>>({
    title: coerceTrimmedStringInput(value.title),
    pageUrl: coerceTrimmedStringInput(value.pageUrl),
    layout: layoutValue ? normalizeLayout(layoutValue) : undefined,
    links: normalizeLinks(value.links) as Partial<SocialShareElementConfig>['links'],
    translations: coerceStringRecordInput(value.translations),
  });
}

export function createDefaultLinks(pageUrl: string, title: string): readonly SocialLinkItem[] {
  if (!pageUrl.trim()) {
    return [];
  }

  const encodedUrl = encodeURIComponent(pageUrl);
  const encodedTitle = encodeURIComponent(title);

  return [
    {
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      iconSymbol: 'facebook',
    },
    {
      label: 'X',
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      iconSymbol: 'x',
    },
    {
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      iconSymbol: 'linkedin',
    },
    {
      label: 'Email',
      href: `mailto:?subject=${encodedTitle}&body=${encodedUrl}`,
      iconSymbol: 'mail',
      target: '_self',
    },
  ];
}

@Component({
  selector: 'sg-social-share',
  imports: [SocialLinksComponent],
  templateUrl: './social-share.html',
  styleUrl: './social-share.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-social-share' },
})
export class SocialShareElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<Partial<SocialShareElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<SocialShareElementConfig>(sanitizeSocialShareConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly pageUrlInput = input<string | undefined>(undefined, { alias: 'pageUrl' });
  readonly linksInput = input<string | undefined>(undefined, { alias: 'links' });
  readonly layoutInput = input<string | undefined>(undefined, { alias: 'layout' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, 'Share'),
  );
  readonly pageUrl = computed(() =>
    resolveConfigValue(this.pageUrlInput(), this.config()?.pageUrl, ''),
  );
  readonly layout = computed<SocialLinksLayout>(() =>
    normalizeLayout(resolveConfigValue(this.layoutInput(), this.config()?.layout, 'row')),
  );
  readonly translations = computed<ComponentTranslations>(() => this.config()?.translations ?? {});
  readonly links = computed<readonly SocialLinkItem[]>(() => {
    if (this.linksInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.linksInput());
      if (Array.isArray(parsedValue)) {
        return parsedValue.map((link) => normalizeLink(link)).filter((link): link is SocialLinkItem => link !== null);
      }
    }

    const configLinks = normalizeLinks(this.config()?.links);
    if (configLinks) {
      return configLinks;
    }

    return createDefaultLinks(this.pageUrl(), this.title());
  });
  readonly ariaLabel = computed(() => this.translations()['linksAriaLabel'] ?? `${this.title()} links`);
  readonly hostClasses = computed(() => `social-share--${this.layout()}`);
}
