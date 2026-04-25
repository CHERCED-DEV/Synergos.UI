import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynFormStepper</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-form-stepper',
  standalone: true,
  templateUrl: './form-stepper.html',
  styleUrl: './form-stepper.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-form-stepper' },
})
export class FormStepperElementComponent {
  readonly stepsJson = input<string | undefined>(undefined);
  readonly submitEndpoint = input<string | undefined>(undefined);
  readonly allowSkip = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
