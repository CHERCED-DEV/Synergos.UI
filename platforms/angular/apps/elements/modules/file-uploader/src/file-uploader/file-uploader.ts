import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynFileUploader</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-file-uploader',
  standalone: true,
  templateUrl: './file-uploader.html',
  styleUrl: './file-uploader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-file-uploader' },
})
export class FileUploaderElementComponent {
  readonly uploadEndpoint = input<string | undefined>(undefined);
  readonly acceptedTypes = input<string | undefined>(undefined);
  readonly maxFileSizeMb = input<string | undefined>(undefined);
  readonly maxFiles = input<string | undefined>(undefined);
  readonly label = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
