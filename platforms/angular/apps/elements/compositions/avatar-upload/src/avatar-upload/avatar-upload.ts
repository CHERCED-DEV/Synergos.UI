import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynAvatarUpload</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-avatar-upload',
  standalone: true,
  templateUrl: './avatar-upload.html',
  styleUrl: './avatar-upload.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-avatar-upload' },
})
export class AvatarUploadElementComponent {
  readonly label = input<string | undefined>(undefined);
  readonly uploadEndpoint = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
