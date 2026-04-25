import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynLightboxGallery</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-lightbox-gallery',
  standalone: true,
  templateUrl: './lightbox-gallery.html',
  styleUrl: './lightbox-gallery.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-lightbox-gallery' },
})
export class LightboxGalleryElementComponent {
  readonly imagesJson = input<string | undefined>(undefined);
  readonly columns = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
