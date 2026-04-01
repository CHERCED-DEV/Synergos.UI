import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  SocialLinksComponent,
  type SocialLinkItem,
  type SocialLinksLayout,
  coerceConfigInput,
  resolveConfigValue,
} from '@synergos/shared';

export interface SocialShareConfig {
  readonly title?: string;
  readonly pageUrl?: string;
  readonly links?: readonly SocialLinkItem[];
  readonly layout?: SocialLinksLayout;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeLayout(value: string): SocialLinksLayout {
  return value === 'stack' ? 'stack' : 'row';
}

function normalizeLink(value: unknown): SocialLinkItem | null {
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

function createDefaultLinks(pageUrl: string, title: string): readonly SocialLinkItem[] {
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

  readonly configInput = input<Partial<SocialShareConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<SocialShareConfig>,
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly pageUrlInput = input<string | undefined>(undefined, { alias: 'pageUrl' });
  readonly linksInput = input<string | undefined>(undefined, { alias: 'links' });
  readonly layoutInput = input<string | undefined>(undefined, { alias: 'layout' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.configInput()?.title, 'Share'),
  );
  readonly pageUrl = computed(() =>
    resolveConfigValue(this.pageUrlInput(), this.configInput()?.pageUrl, ''),
  );
  readonly layout = computed<SocialLinksLayout>(() =>
    normalizeLayout(resolveConfigValue(this.layoutInput(), this.configInput()?.layout, 'row')),
  );
  readonly links = computed<readonly SocialLinkItem[]>(() => {
    if (this.linksInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.linksInput());
      if (Array.isArray(parsedValue)) {
        return parsedValue.map((link) => normalizeLink(link)).filter((link): link is SocialLinkItem => link !== null);
      }
    }

    const configuredLinks = (this.configInput()?.links ?? [])
      .map((link) => normalizeLink(link))
      .filter((link): link is SocialLinkItem => link !== null);

    if (configuredLinks.length > 0) {
      return configuredLinks;
    }

    return createDefaultLinks(this.pageUrl(), this.title());
  });
  readonly ariaLabel = computed(() => `${this.title()} links`);
}
