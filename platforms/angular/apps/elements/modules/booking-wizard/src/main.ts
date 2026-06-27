import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { BookingWizardElementComponent } from './booking-wizard/booking-wizard';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-booking-wizard')) {
    const BookingWizardElement = createCustomElement(BookingWizardElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-booking-wizard', BookingWizardElement);
  }
});
