import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { StepperElementComponent } from './stepper/stepper';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-stepper')) {
    const StepperElement = createCustomElement(StepperElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-stepper', StepperElement);
  }
});
