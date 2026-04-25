import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynMapPin</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-map-pin',
  standalone: true,
  templateUrl: './map-pin.html',
  styleUrl: './map-pin.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-map-pin' },
})
export class MapPinElementComponent {
  readonly centerLat = input<string | undefined>(undefined);
  readonly centerLng = input<string | undefined>(undefined);
  readonly zoomLevel = input<string | undefined>(undefined);
  readonly pinsJson = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
