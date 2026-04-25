import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynDropzone</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-dropzone',
  standalone: true,
  templateUrl: './dropzone.html',
  styleUrl: './dropzone.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-dropzone' },
})
export class DropzoneElementComponent {
  readonly label = input<string | undefined>(undefined);
  readonly acceptedTypes = input<string | undefined>(undefined);
  readonly uploadEndpoint = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
