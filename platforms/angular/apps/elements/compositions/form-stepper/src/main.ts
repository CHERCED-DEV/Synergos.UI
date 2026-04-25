import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { FormStepperElementComponent } from './form-stepper/form-stepper';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-form-stepper')) {
    const FormStepperElement = createCustomElement(FormStepperElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-form-stepper', FormStepperElement);
  }
});
