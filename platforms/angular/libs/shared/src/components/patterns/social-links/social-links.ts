import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../../primitives/icon/icon';
import { LinkComponent } from '../../primitives/link/link';
import { classNames } from '../../../utils/class-names.util';

export type SocialLinksLayout = 'row' | 'stack';

export interface SocialLinkItem {
  readonly id?: string;
  readonly label: string;
  readonly href: string;
  readonly iconSymbol?: string;
  readonly target?: string;
  readonly rel?: string;
}

@Component({
  selector: 'syn-social-links',
  standalone: true,
  imports: [IconComponent, LinkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="syn-social-links" [class]="linksClass()" [attr.aria-label]="ariaLabel()">
      @if (title()) {
        <span class="syn-social-links__title">{{ title() }}</span>
      }

      <ul class="syn-social-links__list">
        @for (link of links(); track trackBy(link, $index)) {
          <li class="syn-social-links__item">
            <syn-link
              class="syn-social-links__link"
              [href]="link.href"
              [label]="link.label"
              [target]="link.target || '_blank'"
              [rel]="link.rel || 'noopener noreferrer'"
              [ariaLabel]="link.label"
            >
              @if (link.iconSymbol) {
                <syn-icon [symbol]="link.iconSymbol" [decorative]="true" />
              }
              {{ link.label }}
            </syn-link>
          </li>
        }
      </ul>
    </nav>
  `,
  styleUrl: './social-links.scss',
})
export class SocialLinksComponent {
  readonly title = input('');
  readonly ariaLabel = input('Social links');
  readonly layout = input<SocialLinksLayout>('row');
  readonly links = input<readonly SocialLinkItem[]>([]);

  linksClass(): string {
    return classNames('syn-social-links', `syn-social-links--${this.layout()}`);
  }

  trackBy(link: SocialLinkItem, index: number): string {
    return link.id ?? `${link.label}-${index}`;
  }
}
