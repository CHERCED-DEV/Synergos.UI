import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { DatePickerElementComponent } from './date-picker/date-picker';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-date-picker')) {
    const DatePickerElement = createCustomElement(DatePickerElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-date-picker', DatePickerElement);
  }
});
