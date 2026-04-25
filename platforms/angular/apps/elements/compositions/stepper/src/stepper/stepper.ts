import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynStepper</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-stepper',
  standalone: true,
  templateUrl: './stepper.html',
  styleUrl: './stepper.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-stepper' },
})
export class StepperElementComponent {
  readonly stepsJson = input<string | undefined>(undefined);
  readonly currentStep = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
